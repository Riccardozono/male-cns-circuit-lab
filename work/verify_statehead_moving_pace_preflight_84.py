"""Compare protected and frontier policies under the old and proposed stop rule.

Fresh deterministic, full-from-line real-physics traces only; no training,
user-save migration or app modification. The experimental research environment
otherwise uses its historical progress-5 scoring, not the app's progress-7.
"""
import json
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash

BASE = ROOT / '.impeccable/review/learning-ml'
OUT = BASE / 'statehead-moving-pace-preflight-20261026-84'
SAVE = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
SAVE_SHA = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
RESEARCH = BASE / 'statehead-moving-slow-recovery-paired-20261026-81/report.json'
REFERENCE = BASE / 'statehead-fulltrace-gated-ppo-4up-20261026-43/report.json'
IDENTITY = BASE / 'statehead-fulltrace-gated-ppo-4up-20261026-43/identity.json'
PREFLIGHT = BASE / 'statehead-fulltrace-gate-zero-preflight-20261026-42/report.json'
BASIS = BASE / 'statehead-fulltrace-gate-basis-20261026-41/basis.private.json'
FRONTIER = BASE / 'statehead-frontier-gae1-distance5-ppo-4up-20261026-68/report.json'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    if OUT.exists() or file_hash(SAVE) != SAVE_SHA:
        raise RuntimeError('Preserve the existing diagnostic and the original user save')
    research, ref, identity, preflight, frontier = map(read, [RESEARCH, REFERENCE, IDENTITY, PREFLIGHT, FRONTIER])
    if not research['passed'] or research['summary']['resumed'] != 7 or not ref['passed'] or not preflight['passed']:
        raise RuntimeError('Prior physical and baseline evidence is required')
    candidates = [c for event in frontier['events'] if event['update'] == 4
                  for c in event['candidates'] if c['fraction'] == .3]
    if (len(candidates) != 1 or not candidates[0]['repeatReplayIdentical']
            or len(candidates[0]['fullFromLineProofs']) != 2
            or candidates[0]['fullFromLineProofs'][0] != candidates[0]['fullFromLineProofs'][1]):
        raise RuntimeError('A known repeated safe frontier policy is required')
    chosen = candidates[0]
    cached = {'observed': ref['finalFreshReplay'], 'controls': preflight['controls'],
              'traceSha256': preflight['parentActionTraceSha256'], 'parentSha256': identity['parentSha256']}
    initialization = {'basisOverride': read(BASIS), 'instantGate': True, 'verifiedBaseline': cached}
    policy = [('protected', [0.0] * 18, ref['finalFreshReplay']),
              ('trainingFrontier', chosen['weights'], chosen['fullFromLineResult'])]
    results = {}
    for name, script in [('previous', 'work/statehead-slow-pace-replay-env-81.cjs'),
                         ('movingPace', 'work/statehead-moving-pace-ppo-env-84.cjs')]:
        env = Pipe(ROOT / script, initialization=initialization)
        try:
            results[name] = {}
            for label, weights, expected in policy:
                trace = env.request('trace-evaluate', weights=weights, configuration={
                    'gateFloor': 0.0, 'includeTraceRows': False, 'includeDecoderInputVectors': False})
                if trace['result'] != expected:
                    raise RuntimeError(f'{name} {label} result differs from the reviewed reference: {trace["result"]}')
                results[name][label] = {'result': trace['result'], 'controls': trace['controls'],
                                        'traceSha256': trace['traceSha256']}
                print('MOVING_PACE_PREFLIGHT ' + json.dumps({'environment': name, 'policy': label,
                      **results[name][label]}), flush=True)
            stats = env.request('stats')
            if stats['gpuCalls'] <= 0 or stats['calls'] != stats['gpuCalls'] or stats['cpuFallbacks'] != 0:
                raise RuntimeError('Expected RTX/CUDA calls and no CPU fallback')
            results[name]['cuda'] = stats
        finally:
            env.close()
    for label, _, _ in policy:
        if results['previous'][label] != results['movingPace'][label]:
            raise RuntimeError(f'{label} trajectory differs under the modified termination rule')
    if file_hash(SAVE) != SAVE_SHA:
        raise RuntimeError('Original user save changed')
    files = ['work/statehead-moving-pace-ppo-env-84.cjs', 'work/statehead-slow-pace-replay-env-81.cjs',
             'work/verify_statehead_moving_pace_preflight_84.py', 'work/neural-statehead-rl-live.cjs',
             '.impeccable/experimental-penalty5/outputs/rewards.js',
             '.impeccable/experimental-penalty5/outputs/simulation.js', 'outputs/rewards.js']
    report = {'passed': True, 'learningSucceeded': False, 'approvedForApp': False,
              'originalSaveSha256': file_hash(SAVE), 'basisSha256': file_hash(BASIS),
              'previousResearchSha256': file_hash(RESEARCH), 'referenceSha256': file_hash(REFERENCE),
              'frontierSha256': file_hash(FRONTIER), 'sourceHashes': {f: file_hash(ROOT / f) for f in files},
              'results': results,
              'boundary': 'Two deterministic research policies, complete from-line traces under paired termination rules. '
                          'Historical progress-5 research rewards plus a moving-pace adapter; not the app progress-7 reward, '
                          'not the user save policy, no optimizer update, and no claim of generalization or convergence.'}
    OUT.mkdir(exist_ok=False)
    atomic_json(OUT / 'report.json', report)
    print('MOVING_PACE_PREFLIGHT_REPORT ' + json.dumps({'report': str(OUT / 'report.json'),
          'sha256': file_hash(OUT / 'report.json'), 'passed': True}), flush=True)


if __name__ == '__main__':
    main()
