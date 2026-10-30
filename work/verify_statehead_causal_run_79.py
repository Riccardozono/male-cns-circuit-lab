"""Reconcile the larger-batch PPO study with its archives and matched control."""
import collections
import gzip
import json
from pathlib import Path

import torch

from analyze_statehead_critic_prior_history_74 import BASE, EXPECTED_SAVE, ROOT, SAVE, file_hash
from statehead_causal_gae_actor_76 import advantages_causal
from statehead_reward_actor import StateheadActor

RUN = BASE / 'statehead-frontier-causalcritic-16ep-gae1-distance5-ppo-4up-20261026-79'
CONTROL = BASE / 'statehead-frontier-causalcritic-gae1-distance5-ppo-4up-20261026-76'


def main():
    destination = RUN / 'verification.json'
    if destination.exists() or file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Existing verification or original save identity prevents this check')
    report = json.loads((RUN / 'report.json').read_text(encoding='utf-8'))
    control = json.loads((CONTROL / 'report.json').read_text(encoding='utf-8'))
    if (not report['passed'] or report['learningSucceeded'] or report['approvedForApp']
            or report['physicalImprovementOverProtectedParent'] or report['trainingFrontierAdvanced']
            or report['updatesCompleted'] != 4 or report['episodesCompleted'] != 64
            or report['baseline'] != report['finalFreshReplay']
            or report['best']['result'] != report['baseline'] or any(report['best']['weights'])
            or report['settings']['episodesPerUpdate'] != 16):
        raise RuntimeError('Run outcome or protected policy does not match its boundary')
    mismatches = []
    for name, expected in report['sourceHashes'].items():
        path = ROOT / name
        if not path.is_file() or file_hash(path).lower() != expected.lower():
            mismatches.append(name)
    if mismatches:
        raise RuntimeError('Source closure differs: ' + ', '.join(mismatches))
    gpu = report['cuda']
    if (gpu['gpuCalls'] <= 0 or gpu['gpuCalls'] != gpu['calls'] or gpu['cpuFallbacks'] != 0
            or gpu['device']['name'] != 'NVIDIA GeForce RTX 4060'):
        raise RuntimeError('Expected actual RTX 4060 graph execution without CPU fallback')
    episodes, archive_hashes, matched = [], {}, 0
    keys = ('seed', 'sign', 'traceSha256', 'result', 'trainingReward')
    for event, baseline in zip(report['events'], control['events']):
        index = event['update']
        if (event != json.loads((RUN / f'update-{index:02}.json').read_text(encoding='utf-8'))
                or len(event['episodeSummaries']) != 16 or event['acceptedFraction'] is not None):
            raise RuntimeError('Update manifest, size or promotion status differs')
        for a, b in zip(baseline['episodeSummaries'], event['episodeSummaries'][:8]):
            matched += int(all(a[key] == b[key] for key in keys))
        for summary in event['episodeSummaries']:
            name = summary['privateArchiveFile']
            path = RUN / name
            digest = file_hash(path)
            if digest.lower() != summary['privateArchiveSha256'].lower():
                raise RuntimeError(f'Archive hash mismatch: {name}')
            with gzip.open(path, 'rt', encoding='utf-8') as stream:
                e = json.load(stream)
            if (e['seed'] != summary['seed'] or e['sign'] != summary['sign']
                    or e['traceSha256'] != summary['traceSha256'] or e['result'] != summary['result']
                    or not e['fullFromLine'] or e['gateFloor'] != 0 or e['controls'] != len(e['rows'])):
                raise RuntimeError(f'Archive does not match its update manifest: {name}')
            for row in e['rows']:
                vector = row.pop('neuralInputVector', None)
                if not isinstance(vector, list) or len(vector) != 516:
                    raise RuntimeError(f'Full neuronal vector missing from archive: {name}')
            episodes.append(e)
            archive_hashes[name] = digest
    if matched != 32 or len(episodes) != 64 or sum(e['controls'] for e in episodes) != report['trainingControls']:
        raise RuntimeError('Matched control or archived control counts differ')
    groups = collections.defaultdict(list)
    for e in episodes:
        groups[e['seed']].append(e['sign'])
    if len(groups) != 32 or any(sorted(signs) != [-1, 1] for signs in groups.values()):
        raise RuntimeError('Expected 32 distinct paired seeds')
    candidates = [candidate for event in report['events'] for candidate in event['candidates']]
    if len(candidates) != 16:
        raise RuntimeError('Expected sixteen physical candidates')
    for c in candidates:
        proofs = c.get('fullFromLineProofs', [])
        if (not c.get('surrogateEligible') or len(proofs) != 2 or proofs[0] != proofs[1]
                or c.get('fullFromLineResult') != proofs[0] or proofs[0]['laps'] != 0
                or c.get('safePhysicalImprovement') or c.get('safeFrontierImprovement')):
            raise RuntimeError('Candidate proof or promotion status does not reconcile')
    advantage, critic = advantages_causal(episodes, gamma=.999, gae_lambda=1.)
    recorded = report['events'][-1]['advantageMetrics']
    if (abs(critic['valueMse'] - recorded['valueMse']) > 1e-8
            or abs(critic['valueR2'] - recorded['valueR2']) > 1e-10):
        raise RuntimeError('Archived trajectories do not reproduce the final critic')
    metadata = json.loads((RUN / 'metadata.private.json').read_text(encoding='utf-8'))
    actor = StateheadActor(metadata, episodes, episodes[0]['behaviorWeights'],
                           episodes[0]['exploration'], device='cpu')
    initial_score, initial_kl = actor.objective(advantage)
    if abs(float(initial_kl.detach())) > 1e-10:
        raise RuntimeError('Reconstructed behavior policy does not match the recorded sampler')
    final_candidate = next(c for c in report['events'][-1]['candidates'] if c['fraction'] == 1.)
    with torch.no_grad():
        actor.motor.copy_(actor.tensor(final_candidate['weights']))
        actor.variance.copy_(actor.tensor(final_candidate['exploration']['weights']))
        score, kl = actor.objective(advantage)
    score_error = abs(float(score) - final_candidate['screen']['meanClippedSurrogate'])
    kl_error = abs(float(kl) - final_candidate['screen']['meanGaussianKL'])
    if score_error > 1e-8 or kl_error > 1e-8:
        raise RuntimeError('Native and reconstructed final candidate scores differ')
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original save changed during verification')
    snapshots = {}
    for source, name in [
        (ROOT / 'work/train_statehead_causal_ppo_79.py', 'trainer-source.py'),
        (ROOT / 'work/statehead_causal_gae_actor_76.py', 'critic-source.py'),
        (Path(__file__), 'verifier-source.py'),
    ]:
        target = RUN / name
        with target.open('xb') as stream:
            stream.write(source.read_bytes())
        if file_hash(source) != file_hash(target):
            raise RuntimeError('Source snapshot differs from its source')
        snapshots[name] = file_hash(target)
    safe = [c for c in candidates if c['fullFromLineResult']['reason'] not in
            ('urto', 'fuori pista', 'progresso non valido')]
    output = {
        'format': 'statehead-causalcritic-large-batch-verification-v1', 'passed': True,
        'learningSucceeded': False, 'approvedForApp': False,
        'reportSha256': file_hash(RUN / 'report.json'), 'controlReportSha256': file_hash(CONTROL / 'report.json'),
        'matchedControlEpisodes': matched, 'archiveCount': len(archive_hashes),
        'pairedSeedGroups': len(groups), 'sourceCount': len(report['sourceHashes']),
        'candidateCount': len(candidates), 'identicalReplayPairs': len(candidates),
        'safeCandidates': len(safe), 'bestSafeCandidate': max(c['fullFromLineResult']['bestProgress'] for c in safe),
        'maxCandidate': max(c['fullFromLineResult']['bestProgress'] for c in candidates),
        'episodeReasons': dict(collections.Counter(e['result']['reason'] for e in episodes)),
        'episodesWithLaps': sum(e['result']['laps'] > 0 for e in episodes),
        'finalCriticMse': critic['valueMse'], 'finalCriticR2': critic['valueR2'],
        'initialPolicyKL': float(initial_kl.detach()), 'candidateScoreError': score_error, 'candidateKLError': kl_error,
        'gpuCalls': gpu['gpuCalls'], 'cpuFallbacks': gpu['cpuFallbacks'],
        'originalSaveSha256': file_hash(SAVE), 'sourceSnapshots': snapshots,
        'boundary': 'Integrity, archived-vector and matched-control verification. No physical learning, generalization or app readiness was established.',
    }
    with destination.open('x', encoding='utf-8') as stream:
        json.dump(output, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print('LARGE_BATCH_VERIFICATION ' + json.dumps({'verification': str(destination), 'sha256': file_hash(destination), **output}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    torch.set_num_threads(2)
    main()
