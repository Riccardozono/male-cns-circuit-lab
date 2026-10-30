"""Independently reconcile the private causal-critic PPO comparison."""
import collections
import json
from pathlib import Path

from analyze_statehead_critic_prior_history_74 import BASE, EXPECTED_SAVE, ROOT, SAVE, file_hash, load_study

RUN = BASE / 'statehead-frontier-causalcritic-gae1-distance5-ppo-4up-20261026-76'
CONTROL = BASE / 'statehead-frontier-gae1-distance5-ppo-4up-20261026-69'
REPORT74 = BASE / 'statehead-critic-prior-history-offline-20261026-74/report.json'
REPORT75 = BASE / 'statehead-critic-batch-size-offline-20261026-75/report.json'


def main():
    destination = RUN / 'verification.json'
    if destination.exists() or file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Existing verification or original save identity prevents this check')
    report_file = RUN / 'report.json'
    report, episodes, archive_hashes, update_hashes = load_study(RUN, [1, 2, 3, 4])
    control = json.loads((CONTROL / 'report.json').read_text(encoding='utf-8'))
    if (not report['passed'] or report['learningSucceeded'] or report['approvedForApp']
            or report['physicalImprovementOverProtectedParent'] or report['trainingFrontierAdvanced']
            or report['updatesCompleted'] != 4 or report['episodesCompleted'] != 32
            or report['baseline'] != report['finalFreshReplay']
            or report['best']['result'] != report['baseline']
            or any(report['best']['weights'])):
        raise RuntimeError('Run outcome or protected policy does not match the declared boundary')
    source_errors = []
    for name, expected in report['sourceHashes'].items():
        path = ROOT / name
        if not path.is_file() or file_hash(path).lower() != expected.lower():
            source_errors.append(name)
    if source_errors:
        raise RuntimeError('Source closure differs: ' + ', '.join(source_errors))
    gpu = report['cuda']
    if (gpu['gpuCalls'] <= 0 or gpu['gpuCalls'] != gpu['calls'] or gpu['cpuFallbacks'] != 0
            or gpu['device']['name'] != 'NVIDIA GeForce RTX 4060'):
        raise RuntimeError('Expected actual RTX 4060 graph execution without CPU fallback')
    control_rows = [row for event in control['events'] for row in event['episodeSummaries']]
    treatment_rows = [row for event in report['events'] for row in event['episodeSummaries']]
    keys = ('seed', 'sign', 'traceSha256', 'result', 'trainingReward')
    matched = sum(all(a[key] == b[key] for key in keys)
                  for a, b in zip(control_rows, treatment_rows))
    if len(control_rows) != 32 or len(treatment_rows) != 32 or matched != 32:
        raise RuntimeError('The paired control episodes are not identical')
    offline74 = json.loads(REPORT74.read_text(encoding='utf-8'))
    offline75 = json.loads(REPORT75.read_text(encoding='utf-8'))
    expected = [next(d for d in offline75['datasets'] if d['name'] == 'run69-8episodes'),
                next(d for d in offline75['datasets'] if d['name'] == 'run69-16episodes'),
                next(d for d in offline75['datasets'] if d['name'] == 'run69-24episodes'),
                next(d for d in offline74['datasets'] if d['name'] == 'run69')]
    for event, diagnostic in zip(report['events'], expected):
        measured = event['advantageMetrics']
        reference = diagnostic['comparison']['all']['causal15']
        if (event['acceptedFraction'] is not None or measured['criticInputs'] != 15
                or abs(measured['valueMse'] - reference['mse']) > 1e-8
                or abs(measured['valueR2'] - reference['r2']) > 1e-10):
            raise RuntimeError('Training critic does not match held-out diagnostic or changed policy')
    candidates = [c for event in report['events'] for c in event['candidates']]
    if len(candidates) != 16:
        raise RuntimeError('Expected sixteen physical candidates')
    for c in candidates:
        proofs = c.get('fullFromLineProofs', [])
        if (not c.get('surrogateEligible') or len(proofs) != 2 or proofs[0] != proofs[1]
                or c.get('fullFromLineResult') != proofs[0] or proofs[0]['laps'] != 0
                or c.get('safePhysicalImprovement') or c.get('safeFrontierImprovement')):
            raise RuntimeError('Candidate proof or promotion status does not reconcile')
    reasons = collections.Counter(e['result']['reason'] for e in episodes)
    safe_candidates = [c for c in candidates if c['fullFromLineResult']['reason'] not in
                       ('urto', 'fuori pista', 'progresso non valido')]
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original save changed during verification')
    snapshots = {}
    for source, name in [
        (ROOT / 'work/train_statehead_causal_ppo_76.py', 'trainer-source.py'),
        (ROOT / 'work/statehead_causal_gae_actor_76.py', 'critic-source.py'),
        (Path(__file__), 'verifier-source.py'),
    ]:
        target = RUN / name
        with target.open('xb') as stream:
            stream.write(source.read_bytes())
        if file_hash(source) != file_hash(target):
            raise RuntimeError('Source snapshot differs from its source')
        snapshots[name] = file_hash(target)
    output = {
        'format': 'statehead-causalcritic-run-verification-v1', 'passed': True,
        'learningSucceeded': False, 'approvedForApp': False,
        'reportSha256': file_hash(report_file), 'controlReportSha256': file_hash(CONTROL / 'report.json'),
        'matchedControlEpisodes': matched, 'archiveCount': len(archive_hashes),
        'updateCount': len(update_hashes), 'sourceCount': len(report['sourceHashes']),
        'candidateCount': len(candidates), 'identicalReplayPairs': len(candidates),
        'safeCandidates': len(safe_candidates),
        'bestSafeCandidate': max((c['fullFromLineResult']['bestProgress'] for c in safe_candidates), default=None),
        'maxCandidate': max(c['fullFromLineResult']['bestProgress'] for c in candidates),
        'episodeReasons': dict(reasons), 'episodesWithLaps': sum(e['result']['laps'] > 0 for e in episodes),
        'gpuCalls': gpu['gpuCalls'], 'cpuFallbacks': gpu['cpuFallbacks'],
        'originalSaveSha256': file_hash(SAVE), 'sourceSnapshots': snapshots,
        'boundary': 'Integrity and matched control verification; this result does not establish physical learning, generalization or app readiness.',
    }
    with destination.open('x', encoding='utf-8') as stream:
        json.dump(output, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'verification': str(destination), 'sha256': file_hash(destination), **output}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
