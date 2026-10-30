"""Decompose actual PPO score gradients by reached progress and episode outcome.

Progress and outcomes are diagnostic labels only; neither is added to an actor
or critic. This file performs no update and never exports a model.
"""
import json
from pathlib import Path

import numpy as np
import torch

from analyze_statehead_critic_prior_history_74 import BASE, EXPECTED_SAVE, ROOT, SAVE, file_hash, load_study
from statehead_causal_gae_actor_76 import advantages_causal
from statehead_reward_actor import StateheadActor

RUN = BASE / 'statehead-frontier-causalcritic-gae1-distance5-ppo-4up-20261026-76'
OUT = BASE / 'statehead-credit-segment-diagnostic-20261026-77'
BOUNDS = [0., 50., 300., 600., 800., float('inf')]
LABELS = ['0-50m', '50-300m', '300-600m', '600-800m', '800m+']


def gradient(actor, advantages, selection):
    for p in (actor.motor, actor.variance):
        p.grad = None
    score, kl = actor.objective((advantages * selection).tolist())
    score.backward()
    vector = torch.cat([actor.motor.grad, actor.variance.grad]).detach().numpy().copy()
    if abs(float(kl.detach())) > 1e-10 or not np.isfinite(vector).all():
        raise RuntimeError('Invalid behavior-policy gradient or KL')
    return vector


def cosine(a, b):
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(a @ b / denominator) if denominator else None


def main():
    if OUT.exists() or file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Existing output or original-save identity prevents analysis')
    report, episodes, archive_hashes, _ = load_study(RUN, [1, 2, 3, 4])
    if report['trainingFrontierAdvanced'] or report['learningSucceeded']:
        raise RuntimeError('This analysis expects the same unpromoted policy in every episode')
    advantage, _ = advantages_causal(episodes, gamma=.999, gae_lambda=1.)
    advantage = np.asarray(advantage)
    progress, active, terminal, outcome, differences = [], [], [], [], []
    for episode in episodes:
        high = float(episode['start']['progress'])
        shaping = float(episode['progressShapingPerMeter'])
        if shaping != 5. or not episode['fullFromLine']:
            raise RuntimeError('Expected the recorded from-line distance-shaping ledger')
        for i, row in enumerate(episode['rows']):
            progress.append(high)
            active.append(bool(row['active']))
            terminal.append(i >= len(episode['rows']) - 30)
            outcome.append(episode['result']['reason'])
            prior, command = row['prior'], row['commands']
            differences.append([abs(command[0] - prior[0]),
                                abs(command[1] - prior[1]), abs(command[2] - prior[2])])
            high += float(row['rewardProgressBonus']) / shaping
        if abs(high - episode['result']['bestProgress']) > 1e-7:
            raise RuntimeError('Distance-shaping ledger does not reconstruct recorded high-water progress')
    progress = np.asarray(progress)
    active = np.asarray(active, dtype=bool)
    terminal = np.asarray(terminal, dtype=bool)
    outcome = np.asarray(outcome)
    differences = np.asarray(differences)
    if len(progress) != len(advantage):
        raise RuntimeError('Policy advantages and physical labels are misaligned')
    metadata = json.loads((RUN / 'metadata.private.json').read_text(encoding='utf-8'))
    actor = StateheadActor(metadata, episodes, episodes[0]['behaviorWeights'],
                           episodes[0]['exploration'], device='cpu')
    total_gradient = gradient(actor, advantage, np.ones(len(advantage)))
    pieces, vectors = [], []
    for label, low, high in zip(LABELS, BOUNDS[:-1], BOUNDS[1:]):
        selected = active & (progress >= low) & (progress < high)
        vector = gradient(actor, advantage, selected.astype(float))
        vectors.append(vector)
        motor, variance = vector[:18], vector[18:]
        pieces.append({
            'segment': label, 'activeControls': int(selected.sum()),
            'totalGradientNorm': float(np.linalg.norm(vector)),
            'motorGradientNorm': float(np.linalg.norm(motor)),
            'varianceGradientNorm': float(np.linalg.norm(variance)),
            'cosineToTotal': cosine(vector, total_gradient),
            'meanAbsoluteCommandDelta': (differences[selected].mean(axis=0).tolist()
                                         if selected.any() else None),
        })
    residual = float(np.max(np.abs(np.sum(vectors, axis=0) - total_gradient)))
    if residual > 1e-9:
        raise RuntimeError('Segment gradient contributions do not sum to the global gradient')
    reason_vectors = {}
    for reason in sorted(set(outcome)):
        selected = active & (outcome == reason)
        vector = gradient(actor, advantage, selected.astype(float))
        reason_vectors[str(reason)] = vector
    terminal_vector = gradient(actor, advantage, (active & terminal).astype(float))
    safe = sum((v for k, v in reason_vectors.items() if k != 'urto'), np.zeros_like(total_gradient))
    collision = reason_vectors['urto']
    output = {
        'format': 'statehead-credit-segment-diagnostic-v1', 'completed': True,
        'learningSucceeded': False, 'approvedForApp': False,
        'sourceReportSha256': file_hash(RUN / 'report.json'),
        'sourceVerificationSha256': file_hash(RUN / 'verification.json'),
        'archiveCount': len(archive_hashes), 'episodes': len(episodes),
        'activeControls': int(active.sum()), 'segmentGradientSumMaxError': residual,
        'globalGradientNorm': float(np.linalg.norm(total_gradient)),
        'segmentNormSumOverGlobal': float(sum(np.linalg.norm(v) for v in vectors) / np.linalg.norm(total_gradient)),
        'segments': pieces,
        'segmentCosines': [[cosine(a, b) for b in vectors] for a in vectors],
        'outcomes': {k: {'activeControls': int((active & (outcome == k)).sum()),
                         'gradientNorm': float(np.linalg.norm(v)),
                         'cosineToTotal': cosine(v, total_gradient)} for k, v in reason_vectors.items()},
        'safeVsCollisionCosine': cosine(safe, collision),
        'last30': {'activeControls': int((active & terminal).sum()),
                   'gradientNorm': float(np.linalg.norm(terminal_vector)),
                   'cosineToTotal': cosine(terminal_vector, total_gradient)},
        'sourceSha256': {'analysis': file_hash(Path(__file__)),
                         'critic': file_hash(ROOT / 'work/statehead_causal_gae_actor_76.py'),
                         'actor': file_hash(ROOT / 'work/statehead_reward_actor.py')},
        'originalSaveSha256': file_hash(SAVE),
        'boundary': 'Real archived on-policy data only; progress and outcomes label gradients offline, not policy inputs. Correlations and cancellation do not prove a causal fault, improved driving, safety or generalization.',
    }
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original save changed during analysis')
    OUT.mkdir(parents=True, exist_ok=False)
    path = OUT / 'report.json'
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('CREDIT_SEGMENTS ' + json.dumps({'report': str(path), 'sha256': file_hash(path),
          'globalGradientNorm': output['globalGradientNorm'],
          'segmentNormSumOverGlobal': output['segmentNormSumOverGlobal'],
          'segments': pieces, 'safeVsCollisionCosine': output['safeVsCollisionCosine'],
          'last30': output['last30']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    torch.set_num_threads(2)
    main()
