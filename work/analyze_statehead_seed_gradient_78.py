"""Estimate how individual paired seeds influence one archived PPO gradient."""
import itertools
import json
from pathlib import Path

import numpy as np
import torch

from analyze_statehead_critic_prior_history_74 import BASE, EXPECTED_SAVE, ROOT, SAVE, file_hash, load_study
from analyze_statehead_credit_segments_77 import cosine, gradient
from statehead_causal_gae_actor_76 import advantages_causal
from statehead_reward_actor import StateheadActor

RUN = BASE / 'statehead-frontier-causalcritic-gae1-distance5-ppo-4up-20261026-76'
OUT = BASE / 'statehead-seed-gradient-diagnostic-20261026-78'
SEGMENTS = BASE / 'statehead-credit-segment-diagnostic-20261026-77/report.json'


def main():
    if OUT.exists() or file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Existing output or original save identity prevents analysis')
    report, episodes, archive_hashes, _ = load_study(RUN, [1, 2, 3, 4])
    if report['learningSucceeded'] or report['trainingFrontierAdvanced']:
        raise RuntimeError('Expected one unchanged, unpromoted behavior policy')
    advantage, _ = advantages_causal(episodes, gamma=.999, gae_lambda=1.)
    advantage = np.asarray(advantage)
    seeds, progress, active = [], [], []
    for episode in episodes:
        high = float(episode['start']['progress'])
        for row in episode['rows']:
            seeds.append(episode['seed'])
            progress.append(high)
            active.append(bool(row['active']))
            high += float(row['rewardProgressBonus']) / float(episode['progressShapingPerMeter'])
        if abs(high - episode['result']['bestProgress']) > 1e-7:
            raise RuntimeError('Progress ledger does not reconcile')
    seeds, progress, active = np.asarray(seeds), np.asarray(progress), np.asarray(active, dtype=bool)
    groups = sorted(set(seeds))
    if len(groups) != 16:
        raise RuntimeError('Expected sixteen paired seeds')
    metadata = json.loads((RUN / 'metadata.private.json').read_text(encoding='utf-8'))
    actor = StateheadActor(metadata, episodes, episodes[0]['behaviorWeights'],
                           episodes[0]['exploration'], device='cpu')
    total = gradient(actor, advantage, np.ones(len(advantage)))
    per_seed, detailed = [], []
    for seed in groups:
        selected = active & (seeds == seed)
        late = selected & (progress >= 800.)
        vector = gradient(actor, advantage, selected.astype(float))
        late_vector = gradient(actor, advantage, late.astype(float)) if late.any() else np.zeros_like(vector)
        per_seed.append(vector)
        without = total - vector
        detailed.append({
            'seed': int(seed), 'activeControls': int(selected.sum()),
            'controlsAtOrBeyond800m': int(late.sum()),
            'gradientNorm': float(np.linalg.norm(vector)),
            'lateGradientNorm': float(np.linalg.norm(late_vector)),
            'cosineToGlobal': cosine(vector, total),
            'cosineWithoutSeedToGlobal': cosine(without, total),
            'relativeGradientChangeWithoutSeed': float(np.linalg.norm(vector) / np.linalg.norm(total)),
        })
    per_seed = np.asarray(per_seed)
    residual = float(np.max(np.abs(per_seed.sum(axis=0) - total)))
    if residual > 1e-9:
        raise RuntimeError('Paired-seed gradients do not sum to the global gradient')
    source_segments = json.loads(SEGMENTS.read_text(encoding='utf-8'))
    if abs(float(np.linalg.norm(total)) - source_segments['globalGradientNorm']) > 1e-10:
        raise RuntimeError('Global gradient disagrees with the segment diagnostic')
    # Fix the first seed in the first half so each 8-vs-8 partition appears once.
    cosines = []
    for rest in itertools.combinations(range(1, len(groups)), 7):
        indices = (0,) + rest
        first = per_seed[list(indices)].sum(axis=0)
        second = total - first
        value = cosine(first, second)
        if value is not None:
            cosines.append(value)
    if len(cosines) != 6435:
        raise RuntimeError('Unexpected number of balanced paired-seed partitions')
    values = np.asarray(cosines)
    output = {
        'format': 'statehead-seed-gradient-diagnostic-v1', 'completed': True,
        'learningSucceeded': False, 'approvedForApp': False,
        'sourceReportSha256': file_hash(RUN / 'report.json'),
        'sourceVerificationSha256': file_hash(RUN / 'verification.json'),
        'segmentReportSha256': file_hash(SEGMENTS), 'archiveCount': len(archive_hashes),
        'episodes': len(episodes), 'pairedSeeds': len(groups), 'activeControls': int(active.sum()),
        'globalGradientNorm': float(np.linalg.norm(total)), 'seedGradientSumMaxError': residual,
        'balancedSplits': {'count': len(values), 'negativeCosines': int((values < 0).sum()),
            'fractionNegative': float((values < 0).mean()),
            'q05': float(np.quantile(values, .05)), 'q25': float(np.quantile(values, .25)),
            'median': float(np.median(values)), 'q75': float(np.quantile(values, .75)),
            'q95': float(np.quantile(values, .95)), 'minimum': float(values.min()), 'maximum': float(values.max())},
        'seeds': detailed, 'sourceSha256': {'analysis': file_hash(Path(__file__)),
          'segmentAnalysis': file_hash(ROOT / 'work/analyze_statehead_credit_segments_77.py'),
          'critic': file_hash(ROOT / 'work/statehead_causal_gae_actor_76.py')},
        'originalSaveSha256': file_hash(SAVE),
        'boundary': 'Fixed advantages on one real 32-episode sample; all splits reuse the same cross-fitted critic. Descriptive gradient sensitivity, not independent validation, proof of causality or improved physical driving.',
    }
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original save changed during analysis')
    OUT.mkdir(parents=True, exist_ok=False)
    path = OUT / 'report.json'
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('SEED_GRADIENT ' + json.dumps({'report': str(path), 'sha256': file_hash(path),
        'balancedSplits': output['balancedSplits'], 'seeds': detailed}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    torch.set_num_threads(2)
    main()
