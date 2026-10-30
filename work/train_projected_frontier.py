"""Append learned neuronal context, preserving the actual parent controller."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import time
import numpy as np
from neuronal_experiment_io import ROOT, NODE, Pipe, file_hash, atomic_json
from train_progressive_context import node, alive

def record(weights, episode):
    s = episode['result']
    return {'weights': weights, 'fitness': s['fitness'], 'progress': s['bestProgress'], 'laps': s['laps'], 'reason': s['reason'],
            'censored': episode['censored'], 'overlap': episode['gasBrakeOverlapSteps']}

def core(result):
    return {k: result[k] for k in ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds']}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='projected-frontier-3680')
    parser.add_argument('--iterations', type=int, default=8)
    parser.add_argument('--population', type=int, default=16)
    parser.add_argument('--after-process', type=int, default=0)
    args = parser.parse_args()
    if not args.tag.replace('-', '').isalnum() or not 1 <= args.iterations <= 30 or not 4 <= args.population <= 100:
        raise ValueError('Bounded own-reward growth experiment required')
    out = ROOT / '.impeccable/review/neural-sacl' / args.tag
    if args.after_process:
        print('PROJECTED_WAIT ' + json.dumps({'confirmedPriorPid': args.after_process}), flush=True)
        while alive(args.after_process):
            time.sleep(5)
    basis_file = out / 'prepared.json'
    prepared = json.loads(basis_file.read_text(encoding='utf-8'))
    out.mkdir(exist_ok=True)
    if (out / 'report.json').exists() or (out / 'identity.json').exists():
        raise RuntimeError('Preserve existing experiment; do not silently restart it')
    config = {'parentModelFile': prepared['parentModelFile'], 'basisFile': str(basis_file)}
    parent = json.loads(json.loads((ROOT / prepared['parentModelFile']).read_text(encoding='utf-8'))['payloadJson'])
    if file_hash(prepared['parentModelFile']) != prepared['parentModelSha256']:
        raise RuntimeError('Parent model changed')
    pipes, optimizer, history, records, validations = [], None, [], [], []
    random = np.random.default_rng(151216)
    started = time.monotonic()
    try:
        errors = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(Pipe, ROOT / 'work/neural-projected-frontier-env.cjs', {'configuration': config}) for _ in range(4)]
            # Preserve deterministic slot order, not process completion timing.
            indexed = {future: i for i, future in enumerate(futures)}
            slots = [None] * 4
            for future in as_completed(futures):
                try:
                    slots[indexed[future]] = future.result()
                except Exception as error:
                    errors.append(error)
            pipes = [pipe for pipe in slots if pipe is not None]
        if errors:
            raise errors[0]
        metadata = pipes[0].metadata
        if any(pipe.metadata != metadata for pipe in pipes):
            raise RuntimeError('Independent numerical environments differ')
        dimensions = metadata['learnableParameters']
        zero = [0.] * dimensions
        a = pipes[0].send('evaluate', weights=zero, mode='full')
        b = pipes[1].send('evaluate', weights=zero, mode='practice')
        baseline, practice = pipes[0].receive(a), pipes[1].receive(b)
        trace_file = ROOT / '.impeccable/review/neural-sacl/progressive-3652-first/stage-03/parent-actual-trace.json'
        if file_hash(trace_file) != prepared['sourceTraceSha256']:
            raise RuntimeError('Actual native parent trace changed')
        expected_trace = node('progressive-model-io.cjs', {'op': 'trace', 'file': str(trace_file)})
        if baseline['censored'] or practice['censored'] or baseline['gasBrakeOverlapSteps'] or practice['gasBrakeOverlapSteps'] or core(baseline['result']) != core(practice['result']) or core(baseline['result']) != core(parent['verifiedFullResult']):
            raise RuntimeError('Zero new coefficients must exactly match actual full parent and cached own practice')
        if baseline['actionTraceSha256'] != expected_trace['traceSha256']:
            raise RuntimeError('Zero projected coefficients changed a native parent command')
        optimizer = Pipe(ROOT / 'work/neural-progressive-optimizer.cjs', {
            'configuration': {'dimensions': dimensions, 'binMetres': 25, 'maxProgress': metadata['maxProgress'], 'population': args.population},
            'seeds': [record(zero, baseline)], 'seed': 151216})
        state = optimizer.request('state')
        previous = state['archive']['champion']
        identity = {'configuration': vars(args), 'environment': metadata, 'nodeExecutableSha256': file_hash(NODE),
                    'sourceHashes': {f: file_hash(ROOT / f) for f in ['work/train_projected_frontier.py', 'work/neuronal_experiment_io.py', 'work/neural-projected-frontier-env.cjs', 'work/neural-projected-frontier.cjs', 'work/neural-projected-frontier-model.cjs', 'work/projected-frontier-model-io.cjs', 'work/neural-progressive-action.cjs', 'work/neural-grown-model.cjs', 'work/neural-progressive-optimizer.cjs', 'work/neural-diversity.cjs', 'work/neural-context-readout.cjs']}}
        atomic_json(out / 'identity.json', identity)
        print('GROWTH_READY ' + json.dumps({'dimensions': dimensions, 'parentStages': metadata['parentStages'], 'protectedActualControls': metadata['protectedControls'], 'baseline': baseline['result'], 'zeroFullMatchesPractice': True, 'startupWallSeconds': time.monotonic() - started}), flush=True)
        for iteration in range(1, args.iterations + 1):
            candidates = optimizer.request('ask')
            for candidate in candidates[1:]:
                if iteration == 1 or random.random() < .65:
                    sigma = float(random.choice([.08, .2, .5, 1.1, 2.]))
                    candidate['weights'] = np.clip(np.array(candidate['weights']) + random.normal(0, sigma, dimensions), -8, 8).tolist()
                    candidate['additionalSigma'] = sigma
            current = []
            for offset in range(0, len(candidates), 4):
                batch = candidates[offset:offset + 4]
                ids = [pipe.send('evaluate', weights=row['weights'], mode='practice') for pipe, row in zip(pipes, batch)]
                for pipe, candidate, rid in zip(pipes, batch, ids):
                    episode = pipe.receive(rid)
                    if episode['gasBrakeOverlapSteps']:
                        raise RuntimeError('Motor pedal overlap')
                    records.append({**candidate, 'iteration': iteration, 'episode': episode})
                    current.append(record(candidate['weights'], episode))
            optimizer.request('offer', candidates=current)
            state = optimizer.request('state')
            archive = state['archive']
            if archive['champion']['weights'] != previous['weights']:
                weights = archive['champion']['weights']
                ids = [pipe.send('evaluate', weights=weights, mode='full') for pipe in pipes[:2]]
                full, repeat = [pipe.receive(rid) for pipe, rid in zip(pipes[:2], ids)]
                if full['censored'] or repeat['censored'] or core(full['result']) != core(repeat['result']) or full['result']['fitness'] != archive['champion']['fitness'] or full['result']['bestProgress'] != archive['champion']['progress']:
                    raise RuntimeError('Promotion failed complete independent from-line validation')
                validations.append({'iteration': iteration, 'weights': weights, 'full': full, 'independentRepeat': repeat})
                previous = archive['champion']
                atomic_json(out / 'verified-champion.json', validations[-1])
            furthest = max(archive['cells'], key=lambda row: (row['laps'], row['progress']))
            row = {'iteration': iteration, 'champion': archive['champion'], 'furthest': furthest, 'evaluations': len(records), 'cells': len(archive['cells']), 'wallSeconds': time.monotonic() - started}
            history.append(row)
            atomic_json(out / 'progress.json', {'identity': identity, 'state': state, 'numpyRandomState': random.bit_generator.state, 'history': history, 'records': records, 'validations': validations})
            print('GROWTH_PROGRESS ' + json.dumps({'iteration': iteration, 'safeProgress': archive['champion']['progress'], 'safeLaps': archive['champion']['laps'], 'furthest': furthest['progress'], 'reason': furthest['reason'], 'evaluations': len(records), 'censored': sum(r['episode']['censored'] for r in records), 'wallSeconds': row['wallSeconds']}), flush=True)
            if archive['champion']['laps'] == 2:
                break
        ids = [pipe.send('evaluate', weights=archive['champion']['weights'], mode='full') for pipe in pipes[:2]]
        full, repeat = [pipe.receive(rid) for pipe, rid in zip(pipes[:2], ids)]
        if full['censored'] or repeat['censored'] or core(full['result']) != core(repeat['result']):
            raise RuntimeError('Final physical validation differs')
        report = {'passed': False, 'phase': 'native-validation', 'identity': identity, 'parentModelFile': prepared['parentModelFile'], 'basisFile': str(basis_file), 'baselineFull': baseline, 'baselinePractice': practice,
                  'state': state, 'numpyRandomState': random.bit_generator.state, 'history': history, 'records': records, 'validations': validations, 'fullChampion': full, 'independentChampionRepeat': repeat,
                  'boundary': 'Warm-start V3/Monza. Actual own rewards; unchanged biological graph, physics and reward rules. Parent frozen, added compact neuronal features only. No route/clock/body/expert controls. Actual cached prefixes are practice, not full generations. Promotions fully replayed independently. No simulated-time ceiling; wall censored trials excluded. No active app/save/release replacement.'}
        atomic_json(out / 'training-report.json', report)
        model_file = out / 'model.malecns-projected-frontier.json'
        node('projected-frontier-model-io.cjs', {'op': 'export', 'file': str(model_file), 'parent': prepared['parentModelFile'], 'basis': str(basis_file),
             'weights': archive['champion']['weights'], 'result': full['result'], 'provenance': {'trainingReportSha256': file_hash(out / 'training-report.json'), 'actualRewardsOnly': True}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            native = list(pool.map(lambda _: node('projected-frontier-model-io.cjs', {'op': 'verify', 'file': str(model_file)}), range(2)))
        if any(not e['passed'] or e['actionTraceSha256'] != full['actionTraceSha256'] or core(e['result']) != core(full['result']) for e in native):
            raise RuntimeError('Actual exported projected native decoder differs')
        report.update(passed=True, phase='finished', nativeVerifications=native, exportedModelFile=str(model_file),
                      improved=full['result']['fitness'] > baseline['result']['fitness'] and full['result']['bestProgress'] >= baseline['result']['bestProgress'])
        atomic_json(out / 'report.json', report)
        print('GROWTH_DONE ' + json.dumps({'passed': True, 'evaluations': len(records), 'result': full['result']}), flush=True)
    finally:
        for pipe in pipes:
            pipe.close()
        if optimizer:
            optimizer.close()

if __name__ == '__main__':
    main()
