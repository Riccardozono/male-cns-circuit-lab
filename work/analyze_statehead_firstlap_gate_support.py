"""Compare the protected zero policy with the best deterministic PPO candidate."""
import json
import math
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


STUDY = ROOT / '.impeccable/review/learning-ml/statehead-firstlap-gated-zero-ppo-4up-20261026-31'
PREPARED = ROOT / '.impeccable/review/learning-ml/statehead-firstlap-gated-basis-20261026-27'
PREFLIGHT = ROOT / '.impeccable/review/learning-ml/statehead-firstlap-gate-basis-zero-policy-20261026-30/report.json'
SAVE = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
SAVE_SHA256 = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'


def summarize(trace):
    rows = trace['rows']
    active = [row for row in rows if row['control']['radialGate'] > 0]
    by_bin = {}
    for row in rows:
        progress = row['before']['bestProgress']
        bucket = int(progress // 250) * 250
        record = by_bin.setdefault(str(bucket), {'controls': 0, 'active': 0, 'maxGate': 0.0})
        record['controls'] += 1
        record['active'] += int(row['control']['radialGate'] > 0)
        record['maxGate'] = max(record['maxGate'], row['control']['radialGate'])
    return {
        'result': trace['result'], 'controls': trace['controls'],
        'activeControls': len(active), 'activeProgressRange': (
            [active[0]['before']['bestProgress'], active[-1]['before']['bestProgress']] if active else None),
        'maximumGate': max((row['control']['radialGate'] for row in rows), default=0.0),
        'progressBins250m': by_bin,
    }


def main():
    tag = 'statehead-firstlap-gate-support-followup-20261026-32'
    out = ROOT / '.impeccable/review/learning-ml' / tag
    out.mkdir(exist_ok=False)
    started = time.monotonic()
    environment = None
    try:
        training = json.loads((STUDY / 'report.json').read_text(encoding='utf-8'))
        preflight = json.loads(PREFLIGHT.read_text(encoding='utf-8'))
        basis = json.loads((PREPARED / 'basis.private.json').read_text(encoding='utf-8'))
        if (not training['passed'] or training['learningSucceeded'] or training['approvedForApp']
                or not preflight['passed'] or file_hash(SAVE) != SAVE_SHA256):
            raise RuntimeError('Expected verified but unpromoted study and unchanged user save')

        candidates = []
        for event in training['events']:
            for candidate in event['candidates']:
                if candidate.get('fullFromLineProofs'):
                    candidates.append((candidate['fullFromLineResult']['bestProgress'], event['update'], candidate))
        _, update, selected = max(candidates, key=lambda item: item[0])
        selected_weights = selected['weights']
        if selected['fullFromLineResult']['laps'] != 0:
            raise RuntimeError('This diagnostic expects a non-lap candidate from the private experiment')

        environment = Pipe(ROOT / 'work/statehead-reward-gate-env.cjs', initialization={'basisOverride': basis})
        metadata = environment.metadata
        expected = {key: preflight['parentExpected'][key] for key in (
            'bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds', 'complete', 'lapTimes')}
        if metadata['baseline']['observed'] != expected:
            raise RuntimeError('Fresh zero-policy parent baseline changed')

        config = {'gateFloor': 0.0, 'includeDecoderInputVectors': False}
        zero = environment.request('trace-evaluate', weights=[0.0] * 18, configuration=config)
        candidate = environment.request('trace-evaluate', weights=selected_weights, configuration=config)
        if zero['result'] != metadata['baseline']['observed'] or not all(
                row['control']['commands'] == row['control']['prior'] for row in zero['rows']):
            raise RuntimeError('Zero head failed the protected full replay identity')
        if candidate['result'] != selected['fullFromLineResult']:
            raise RuntimeError('Diagnostic candidate differs from its original deterministic replay')

        first_command_divergence = None
        max_command_delta = 0.0
        max_command_delta_row = None
        max_position_delta = 0.0
        max_position_delta_row = None
        for index, row in enumerate(candidate['rows']):
            other = zero['rows'][index]
            delta = max(abs(a - b) for a, b in zip(row['control']['commands'], other['control']['commands']))
            if delta > 0 and first_command_divergence is None:
                first_command_divergence = {
                    'controlIndex': index + 1,
                    'progress': other['before']['bestProgress'],
                    'gate': other['control']['radialGate'],
                    'protectedCommand': other['control']['commands'],
                    'candidateCommand': row['control']['commands'],
                    'maxAbsoluteCommandDelta': delta,
                }
            if delta > max_command_delta:
                max_command_delta = delta
                max_command_delta_row = {'controlIndex': index + 1, 'progress': row['before']['bestProgress'],
                                          'protectedCommand': other['control']['commands'],
                                          'candidateCommand': row['control']['commands']}
            position_delta = math.dist(row['after']['position'], other['after']['position'])
            if position_delta > max_position_delta:
                max_position_delta = position_delta
                max_position_delta_row = {'controlIndex': index + 1, 'protectedProgress': other['after']['bestProgress'],
                                          'candidateProgress': row['after']['bestProgress'],
                                          'positionDeltaPx': position_delta}

        report = {
            'format': 'private-statehead-firstlap-gate-support-followup-v1',
            'passed': True, 'learningSucceeded': False, 'approvedForApp': False,
            'appVersion': metadata['appVersion'], 'parentSha256': metadata['parentSha256'],
            'parentFullTrace': summarize(zero),
            'candidate': {'update': update, 'fraction': selected['fraction'],
                          'weights': selected_weights, 'fullResult': candidate['result'],
                          'fullTrace': summarize(candidate),
                          'repeatReplayIdentical': selected.get('repeatReplayIdentical')},
            'firstCommandDivergence': first_command_divergence,
            'maximumCommandDelta': max_command_delta,
            'maximumCommandDeltaAt': max_command_delta_row,
            'maximumPositionDeltaPx': max_position_delta,
            'maximumPositionDeltaAt': max_position_delta_row,
            'candidateFirstLapSupport': 'The comparison uses actual per-control 516-value MaleCNS inputs and neural gate values; route coordinates are not decoder inputs.',
            'originalSaveSha256': file_hash(SAVE),
            'sourceHashes': {file: file_hash(ROOT / file) for file in (
                'work/analyze_statehead_firstlap_gate_support.py',
                'work/statehead-reward-gate-env.cjs',
                'work/neural-statehead-gate.cjs',
                'work/neural-command-residual.cjs')},
            'trainingReportSha256': file_hash(STUDY / 'report.json'),
            'wallSeconds': time.monotonic() - started,
            'boundary': 'Full zero-policy physical replay and a deterministic replay of the strongest local-gate PPO candidate. This measures gate coverage and causal command/trajectory divergence, not a new training run or a learning success.',
        }
        atomic_json(out / 'report.json', report)
        atomic_json(out / 'progress.json', {'phase': 'finished', 'passed': True})
    except BaseException as error:
        atomic_json(out / 'failure.json', {'error': repr(error)})
        raise
    finally:
        if environment is not None:
            environment.close()


if __name__ == '__main__':
    main()
