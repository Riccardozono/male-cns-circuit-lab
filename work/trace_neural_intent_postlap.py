"""Private telemetry and same-state brake/throttle probe for the V3/Monza parent."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash


def summarize(rows):
    def group(test):
        selected = [row for row in rows if test(row)]
        deltas = [row['speedDeltaMps'] for row in selected]
        return {'controls': len(selected), 'meanSpeedDeltaMps': float(np.mean(deltas)) if deltas else None,
                'medianSpeedDeltaMps': float(np.median(deltas)) if deltas else None,
                'meanLongitudinalG': float(np.mean([row['after']['longitudinalG'] for row in selected])) if deltas else None}
    return {
        'totalControls': len(rows),
        'controlsWithBrake': sum(row['after']['outputs'][2] > .05 for row in rows),
        'controlsWithThrottle': sum(row['after']['outputs'][1] > .05 for row in rows),
        'gasBrakeOverlap': sum(min(row['after']['outputs'][1], row['after']['outputs'][2]) > 1e-9 for row in rows),
        'brakeAndMoving': group(lambda r: r['after']['outputs'][2] > .05 and r['before']['speedMps'] > 2),
        'neitherPedalAndMoving': group(lambda r: r['after']['outputs'][1] <= .05 and r['after']['outputs'][2] <= .05 and r['before']['speedMps'] > 2),
        'throttleAndMoving': group(lambda r: r['after']['outputs'][1] > .05 and r['before']['speedMps'] > 2),
    }


def run(tag):
    if not tag.replace('-', '').isalnum():
        raise ValueError('Scoped private diagnostic tag required')
    out = ROOT / '.impeccable/review/learning-ml' / tag
    out.mkdir(exist_ok=False)
    proof_dir = ROOT / '.impeccable/review/learning-ml/neural-current-intent-proof-20261025-01'
    proof = json.loads((proof_dir / 'report.json').read_text(encoding='utf-8'))
    env = None
    try:
        env = Pipe(ROOT / 'work/neural-intent-trace-world.cjs',
                   initialization={'configuration': {'horizonControls': 200}})
        meta = env.metadata
        if meta['parentSha256'] != proof['parentSha256'] or meta['baseline'] != proof['fullZeroResidualResult']:
            raise RuntimeError('Current protected V3/Monza parent identity mismatch')
        lap_reset = {'mode': 'observed-lap-boundary', 'headingKickRad': 0}
        env.request('reset', configuration=lap_reset)
        rows = []
        controls = 0
        while True:
            result = env.request('step', action=[0, 0, 0, 0])
            controls += 1
            actuation = result['info']['actuation']
            before, after = actuation['before'], actuation['after']
            rows.append({'control': controls, 'speedDeltaMps': after['speedMps'] - before['speedMps'],
                         'before': before, 'after': after})
            if result['terminated']:
                terminal = result['info']
                break
            if result['truncated']:
                raise RuntimeError('Native second-segment diagnostic was truncated')
        baseline_match = (terminal['progress'] == meta['baseline']['bestProgress'] and
                          terminal['laps'] == meta['baseline']['laps'] and
                          terminal['reason'] == meta['baseline']['reason'] and
                          controls == meta['referenceControls'] - meta['firstLapControls'])
        if not baseline_match:
            raise RuntimeError('Zero-residual post-lap trace differs from the protected full trajectory')

        cases = []
        for label, action in [('neural-parent', [0, 0, 0, 0]),
                              ('full-throttle-probe', [0, 1, 0, 0]),
                              ('full-brake-probe', [0, -1, 0, 0])]:
            env.request('reset', configuration=lap_reset)
            step = env.request('step', action=action)
            diagnostic = step['info']['diagnostic']
            if not diagnostic:
                raise RuntimeError('One-step same-state physical probe is missing telemetry')
            cases.append({'label': label, 'policyResidual': action, 'terminated': step['terminated'],
                          'info': step['info'], 'pre': diagnostic['pre'], 'post': diagnostic['post']})
        baseline_pre = cases[0]['pre']
        state_keys = ['x', 'y', 'heading', 'speedMps', 'progress', 'laps', 'intent', 'sensorVector',
                      'visualSensors', 'physicsSensors', 'neuralActivitySha256', 'observation']
        same_start = all(all(c['pre'][key] == baseline_pre[key] for key in state_keys) for c in cases[1:])
        if not same_start:
            raise RuntimeError('Throttle/brake probes did not start from the exact same physical/neural state')
        probe_summary = []
        for case in cases:
            pre, post = case['pre'], case['post']
            probe_summary.append({'label': case['label'], 'samePreState': True,
                                  'parentIntent': pre['intent'], 'requestedMotors': pre['requested'],
                                  'appliedMotors': post['outputs'], 'speedBeforeMps': pre['speedMps'],
                                  'speedAfterMps': post['speedMps'],
                                  'speedDeltaMps': post['speedMps'] - pre['speedMps'],
                                  'longitudinalGBefore': pre['longitudinalG'],
                                  'longitudinalGAfter': post['longitudinalG'],
                                  'gearBefore': pre['vehicle'].get('gear'), 'gearAfter': post['vehicle'].get('gear'),
                                  'absActiveAfter': post['vehicle'].get('absActive'),
                                  'brakeTemperatureAfterC': post['vehicle'].get('brakeC')})
        sources = ['work/trace_neural_intent_postlap.py', 'work/neural-intent-trace-world.cjs',
                   'work/neural-intent-live.cjs', 'work/neural-statehead-cuda-model.cjs',
                   'work/neural-statehead.cjs', 'work/neural-frontier-chain.cjs',
                   'work/neural-command-residual.cjs', 'work/neural-research-source-identity.cjs',
                   'work/neuronal_experiment_io.py', 'outputs/vehicle-992.js', 'outputs/simulation.js',
                   '.impeccable/review/learning-ml/neural-current-intent-proof-20261025-01/report.json',
                   '.impeccable/review/learning-ml/neural-current-intent-proof-20261025-01/successful-neural-reference-520.private.npy']
        js = "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(" + json.dumps(sources) + ")))"
        hashes = json.loads(__import__('subprocess').check_output([str(NODE), '-e', js], cwd=ROOT, text=True,
                                                                 creationflags=__import__('subprocess').CREATE_NO_WINDOW))
        stats = env.request('stats')
        report = {'format': 'private-neural-intent-postlap-physics-trace-v1', 'passed': True,
                  'learningSucceeded': False, 'approvedForApp': False, 'appVersion': '5.6.0',
                  'parentSha256': meta['parentSha256'], 'fullBaseline': meta['baseline'],
                  'postLapControls': controls, 'postLapTraceMatchesProtectedBaseline': baseline_match,
                  'traceSummary': summarize(rows), 'sameStateMotorProbe': {'sameInitialPhysicalAndNeuralState': same_start,
                                                                            'cases': probe_summary},
                  'traceRows': rows, 'sourceHashes': hashes, 'cuda': stats,
                  'boundary': 'Native physical trace from the actual retained V3/Monza lap-boundary snapshot. The policy only received actual neuronal/own-command observations. Same-state full-throttle/full-brake probes are one-control diagnostics, never training labels or an application controller. No app/save/version/release changes.'}
        atomic_json(out / 'report.json', report)
        print(json.dumps({'passed': True, 'postLapControls': controls, 'baselineMatch': baseline_match,
                          'traceSummary': report['traceSummary'], 'sameStateMotorProbe': probe_summary,
                          'cuda': stats}, separators=(',', ':')), flush=True)
    except BaseException as error:
        atomic_json(out / 'failure.json', {'error': repr(error)})
        raise
    finally:
        if env:
            env.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    run(parser.parse_args().tag)
