"""Continue actual reward learning with block-wise antithetic parameter proposals."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import time
import numpy as np
from neuronal_experiment_io import ROOT, NODE, Pipe, file_hash, atomic_json
from train_progressive_context import node, alive, core, candidate
from projected_block_mutations import propose

def read(file):
    return json.loads(file.read_text(encoding='utf-8'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default='projected-frontier-3680')
    parser.add_argument('--tag', default='projected-block-3680')
    parser.add_argument('--iterations', type=int, default=8)
    parser.add_argument('--after-process', type=int, default=0)
    args = parser.parse_args()
    if not all(s.replace('-', '').isalnum() for s in [args.source, args.tag]) or not 1 <= args.iterations <= 30:
        raise ValueError('Bounded private block comparison required')
    if args.after_process:
        print('BLOCK_WAIT ' + json.dumps({'confirmedPriorPid': args.after_process}), flush=True)
        while alive(args.after_process):
            time.sleep(5)
    base = ROOT / '.impeccable/review/neural-sacl'
    source_file, out = base / args.source / 'report.json', base / args.tag
    source = read(source_file)
    if not source['passed'] or len(source['nativeVerifications']) != 2:
        raise RuntimeError('A fully native-verified source is required')
    prepared_file = base / args.source / 'prepared.json'
    prepared = read(prepared_file)
    if file_hash(prepared['parentModelFile']) != prepared['parentModelSha256'] or source['identity']['environment']['basisSha256'] != file_hash(prepared_file):
        raise RuntimeError('Frozen parent or representation changed')
    out.mkdir(exist_ok=False)
    random = np.random.default_rng()
    random.bit_generator.state = source['numpyRandomState']
    pipes, optimizer, records, history, validations = [], None, [], [], []
    began = time.monotonic()
    config = {'parentModelFile': prepared['parentModelFile'], 'basisFile': str(prepared_file)}
    try:
        errors = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(Pipe, ROOT / 'work/neural-projected-frontier-env.cjs', {'configuration': config}) for _ in range(4)]
            for future in futures:
                try:
                    pipes.append(future.result())
                except Exception as error:
                    errors.append(error)
        if errors:
            raise errors[0]
        metadata = pipes[0].metadata
        if any(p.metadata != metadata for p in pipes) or metadata != source['identity']['environment']:
            raise RuntimeError('Source numerical environment differs')
        optimizer = Pipe(ROOT / 'work/neural-progressive-optimizer.cjs', {'restored': source['state']})
        state = optimizer.request('state')
        weights = state['archive']['champion']['weights']
        a = pipes[0].send('evaluate', weights=weights, mode='full')
        b = pipes[1].send('evaluate', weights=weights, mode='practice')
        baseline, practice = pipes[0].receive(a), pipes[1].receive(b)
        if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [baseline, practice]) or core(baseline['result']) != core(practice['result']) or core(baseline['result']) != core(source['fullChampion']['result']) or baseline['actionTraceSha256'] != source['nativeVerifications'][0]['actionTraceSha256']:
            raise RuntimeError('Warm block start must exactly reproduce the independently verified source')
        identity = {'configuration': vars(args), 'sourceReportSha256': file_hash(source_file), 'environment': metadata,
                    'nodeExecutableSha256': file_hash(NODE), 'sourceHashes': {f: file_hash(ROOT / f) for f in [
                        'work/train_projected_blocks.py', 'work/projected_block_mutations.py', 'work/neuronal_experiment_io.py',
                        'work/neural-projected-frontier-env.cjs', 'work/neural-projected-frontier.cjs', 'work/neural-projected-frontier-model.cjs',
                        'work/projected-frontier-model-io.cjs', 'work/neural-progressive-action.cjs', 'work/neural-grown-model.cjs', 'work/neural-progressive-optimizer.cjs']}}
        atomic_json(out / 'identity.json', identity)
        print('BLOCK_READY ' + json.dumps({'baseline': core(baseline['result']), 'parameters': 18, 'warmFullTraceMatchesNativeSource': True}), flush=True)
        previous = state['archive']['champion']
        for iteration in range(1, args.iterations + 1):
            candidates = propose(state['archive'], random, 16)
            actual = []
            for offset in range(0, 16, 4):
                batch = candidates[offset:offset + 4]
                requests = [p.send('evaluate', weights=row['weights'], mode='practice') for p, row in zip(pipes, batch)]
                for p, row, request in zip(pipes, batch, requests):
                    episode = p.receive(request)
                    if episode['gasBrakeOverlapSteps']:
                        raise RuntimeError('Motor pedal overlap')
                    records.append({**row, 'iteration': iteration, 'episode': episode})
                    actual.append(candidate(row['weights'], episode))
            optimizer.request('offer', candidates=actual)
            state = optimizer.request('state')
            champion = state['archive']['champion']
            if champion['weights'] != previous['weights']:
                requests = [p.send('evaluate', weights=champion['weights'], mode='full') for p in pipes[:2]]
                a, b = [p.receive(request) for p, request in zip(pipes[:2], requests)]
                if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [a, b]) or core(a['result']) != core(b['result']) or a['actionTraceSha256'] != b['actionTraceSha256'] or a['result']['fitness'] != champion['fitness'] or a['result']['bestProgress'] != champion['progress']:
                    raise RuntimeError('Independent full block promotion differs')
                validations.append({'iteration': iteration, 'weights': champion['weights'], 'full': a, 'independentRepeat': b})
                atomic_json(out / 'verified-champion.json', validations[-1])
                previous = champion
            history.append({'iteration': iteration, 'champion': champion, 'evaluations': len(records), 'wallSeconds': time.monotonic() - began})
            checkpoint = {'identity': identity, 'state': state, 'numpyRandomState': random.bit_generator.state, 'records': records, 'history': history, 'validations': validations}
            atomic_json(out / 'progress.json', checkpoint)
            print('BLOCK_PROGRESS ' + json.dumps({'iteration': iteration, 'evaluations': len(records), 'progress': champion['progress'], 'fitness': champion['fitness'], 'laps': champion['laps']}), flush=True)
            if champion['laps'] == 2:
                break
        full, repeat = (validations[-1]['full'], validations[-1]['independentRepeat']) if validations else (baseline, source['independentChampionRepeat'])
        report = {'passed': False, 'phase': 'native-validation', 'identity': identity, 'baselineFull': baseline, 'fullChampion': full,
                  'independentChampionRepeat': repeat, 'state': state, 'numpyRandomState': random.bit_generator.state, 'history': history,
                  'records': records, 'validations': validations, 'boundary': 'Actual reward training, block-wise parameter mutation only. No hand-authored steering/throttle, route, teacher or physics changes. Cached practice is not a full generation. App/release remain untouched.'}
        atomic_json(out / 'training-report.json', report)
        model_file = out / 'model.malecns-projected-frontier.json'
        node('projected-frontier-model-io.cjs', {'op': 'export', 'file': str(model_file), 'parent': prepared['parentModelFile'], 'basis': str(prepared_file),
             'weights': state['archive']['champion']['weights'], 'result': full['result'], 'provenance': {'sourceReportSha256': file_hash(source_file), 'trainingReportSha256': file_hash(out / 'training-report.json')}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            native = list(pool.map(lambda _: node('projected-frontier-model-io.cjs', {'op': 'verify', 'file': str(model_file)}), range(2)))
        if any(not e['passed'] or e['actionTraceSha256'] != full['actionTraceSha256'] or core(e['result']) != core(full['result']) for e in native):
            raise RuntimeError('Exported block model native full trace differs')
        report.update(passed=True, phase='finished', nativeVerifications=native, exportedModelFile=str(model_file), improved=bool(validations))
        atomic_json(out / 'report.json', report)
        print('BLOCK_DONE ' + json.dumps({'passed': True, 'improved': bool(validations), 'result': core(full['result']), 'evaluations': len(records)}), flush=True)
    finally:
        for p in pipes:
            p.close()
        if optimizer:
            optimizer.close()

if __name__ == '__main__':
    main()
