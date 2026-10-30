"""Private progressive reward training; never changes the active Windows app."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import subprocess
import time
import numpy as np
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash

BASE = ROOT / '.impeccable/review/neural-sacl'
SOURCES = ['work/train_progressive_context.py', 'work/neuronal_experiment_io.py',
           'work/neural-progressive-env.cjs', 'work/neural-progressive-action.cjs',
           'work/neural-progressive-optimizer.cjs', 'work/progressive-model-io.cjs',
           'work/neural-grown-model.cjs', 'work/neural-retained-features.cjs',
           'work/neural-context-readout.cjs', 'work/prepare-grown-context.cjs',
           'work/neural-diversity.cjs', 'work/neural-rl-context-state.cjs',
           'work/neural-context-live.cjs', 'work/neural-context-stack.cjs',
           'work/neural-json-head.cjs', 'work/exact-coo.cjs', 'work/exact-dense.cjs']
FIELDS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds']

def read(file):
    return json.loads(Path(file).read_text(encoding='utf-8'))

def core(result):
    return {key: result[key] for key in FIELDS}

def node(script, configuration):
    p = subprocess.run([str(NODE), str(ROOT / 'work' / script), json.dumps(configuration)], cwd=ROOT,
                       capture_output=True, text=True, encoding='utf-8', timeout=240,
                       creationflags=subprocess.CREATE_NO_WINDOW)
    if p.returncode:
        raise RuntimeError(p.stderr[-8192:] + '\n' + p.stdout[-8192:])
    lines = p.stdout.strip().splitlines()
    result = lines[-1]
    if result.startswith('GROWTH_PREPARED '):
        result = result.partition(' ')[2]
    return json.loads(result)

def model_data(file):
    return json.loads(read(file)['payloadJson'])

def candidate(weights, episode):
    r = episode['result']
    return {'weights': weights, 'fitness': r['fitness'], 'progress': r['bestProgress'],
            'laps': r['laps'], 'reason': r['reason'], 'censored': episode['censored'],
            'overlap': episode['gasBrakeOverlapSteps']}

def run_stage(directory, parent_file, args, source_hashes, retention, fraction):
    directory.mkdir(exist_ok=True)
    prepared_file = directory / 'prepared.json'
    if not prepared_file.exists():
        node('prepare-grown-context.cjs', {'out': str(directory), 'parentModelFile': str(parent_file),
                                         'centres': 6, 'protectedFraction': fraction})
    prepared = read(prepared_file)
    if prepared['parentModelSha256'] != file_hash(parent_file):
        raise RuntimeError('Prepared parent changed')
    expected_trace = node('progressive-model-io.cjs', {'op': 'trace', 'file': str(directory / 'parent-actual-trace.json')})
    checkpoint_file = directory / 'checkpoint.json'
    checkpoint = read(checkpoint_file) if checkpoint_file.exists() else None
    configuration = {'parentModelFile': str(parent_file), 'basisFile': str(prepared_file), 'retention': retention}
    expected_config = {'configuration': configuration, 'sourceHashes': source_hashes,
                       'population': args.population, 'iterations': args.iterations, 'workers': args.workers}
    if checkpoint and checkpoint['identity'] != expected_config:
        raise RuntimeError('Checkpoint is not compatible; preserve it')
    pipes, optimizer = [], None
    random = np.random.default_rng(151216)
    records, history, validations = [], [], []
    began = time.monotonic()
    try:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            slots = [None] * args.workers
            futures = {pool.submit(Pipe, ROOT / 'work/neural-progressive-env.cjs', {'configuration': configuration}): i for i in range(args.workers)}
            errors = []
            for future in as_completed(futures):
                try:
                    slots[futures[future]] = future.result()
                except Exception as error:
                    errors.append(error)
            pipes = [p for p in slots if p]
        if errors:
            raise errors[0]
        metadata = pipes[0].metadata
        if any(p.metadata != metadata for p in pipes):
            raise RuntimeError('Independent numerical environments differ')
        dimensions = metadata['learnableParameters']
        zero = [0.] * dimensions
        ids = [pipes[0].send('evaluate', weights=zero, mode='full'), pipes[1].send('evaluate', weights=zero, mode='practice')]
        baseline, practice = [p.receive(i) for p, i in zip(pipes[:2], ids)]
        if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [baseline, practice]) or core(baseline['result']) != core(practice['result']) or core(baseline['result']) != core(model_data(parent_file)['verifiedFullResult']) or baseline['actionTraceSha256'] != expected_trace['traceSha256']:
            raise RuntimeError('Zero new weights must reproduce every actual full parent command, progress and time exactly')
        if checkpoint:
            records, history, validations = checkpoint['records'], checkpoint['history'], checkpoint['validations']
            random.bit_generator.state = checkpoint['numpyRandomState']
            initialization = {'restored': checkpoint['optimizerState']}
            last_improvement = checkpoint['lastImprovement']
            first_iteration = checkpoint['nextIteration']
            last_iteration = history[-1]['iteration'] if history else 0
            if state_stopped(checkpoint['optimizerState']['archive']['champion'], last_iteration, last_improvement):
                first_iteration = args.iterations + 1
        else:
            initialization = {'configuration': {'dimensions': dimensions, 'binMetres': 25, 'maxProgress': metadata['maxProgress'], 'population': args.population},
                              'seeds': [candidate(zero, baseline)], 'seed': 151216}
            last_improvement, first_iteration = 0, 1
        optimizer = Pipe(ROOT / 'work/neural-progressive-optimizer.cjs', initialization)
        state = optimizer.request('state')
        previous = state['archive']['champion']
        print('PROGRESSIVE_READY ' + json.dumps({'stage': directory.name, 'retention': retention, 'fraction': fraction, 'dimensions': dimensions,
              'actualProtectedControls': metadata['protectedControls'], 'zeroFullTraceMatchesNativeParent': True, 'baseline': core(baseline['result'])}), flush=True)
        for iteration in range(first_iteration, args.iterations + 1):
            candidates = optimizer.request('ask')
            for row in candidates[1:]:
                if iteration == 1 or random.random() < .65:
                    sigma = float(random.choice([.08, .2, .5, 1.1, 2.]))
                    row['weights'] = np.clip(np.array(row['weights']) + random.normal(0, sigma, dimensions), -8, 8).tolist()
                    row['additionalSigma'] = sigma
            actual = []
            for offset in range(0, len(candidates), args.workers):
                batch = candidates[offset:offset + args.workers]
                ids = [p.send('evaluate', weights=row['weights'], mode='practice') for p, row in zip(pipes, batch)]
                for p, row, request in zip(pipes, batch, ids):
                    episode = p.receive(request)
                    if episode['gasBrakeOverlapSteps']:
                        raise RuntimeError('Motor pedal overlap')
                    actual.append(candidate(row['weights'], episode))
                    records.append({**row, 'iteration': iteration, 'episode': episode})
            optimizer.request('offer', candidates=actual)
            state = optimizer.request('state')
            champion = state['archive']['champion']
            if champion['weights'] != previous['weights']:
                ids = [p.send('evaluate', weights=champion['weights'], mode='full') for p in pipes[:2]]
                a, b = [p.receive(i) for p, i in zip(pipes[:2], ids)]
                if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [a, b]) or core(a['result']) != core(b['result']) or a['actionTraceSha256'] != b['actionTraceSha256'] or a['result']['fitness'] != champion['fitness'] or a['result']['bestProgress'] != champion['progress']:
                    raise RuntimeError('Actual full promotion replay differs')
                validations.append({'iteration': iteration, 'weights': champion['weights'], 'full': a, 'independentRepeat': b})
                previous, last_improvement = champion, iteration
                atomic_json(directory / 'verified-champion.json', validations[-1])
            history.append({'iteration': iteration, 'champion': champion, 'evaluations': len(records), 'wallSeconds': time.monotonic() - began})
            checkpoint = {'identity': expected_config, 'environment': metadata, 'optimizerState': state,
                          'numpyRandomState': random.bit_generator.state, 'nextIteration': iteration + 1,
                          'lastImprovement': last_improvement, 'records': records, 'history': history, 'validations': validations}
            atomic_json(checkpoint_file, checkpoint)
            print('PROGRESSIVE_SEARCH ' + json.dumps({'stage': directory.name, 'iteration': iteration, 'evaluations': len(records), 'progress': champion['progress'],
                  'fitness': champion['fitness'], 'laps': champion['laps'], 'censored': sum(r['episode']['censored'] for r in records)}), flush=True)
            if state_stopped(champion, iteration, last_improvement):
                break
        improved = bool(validations)
        native, exported = [], None
        if improved:
            final = validations[-1]
            exported = directory / 'model.malecns-neural-grown.json'
            if not exported.exists():
                node('progressive-model-io.cjs', {'op': 'export', 'parent': str(parent_file), 'basis': str(prepared_file), 'weights': final['weights'],
                     'retention': retention, 'result': final['full']['result'], 'file': str(exported),
                     'provenance': {'checkpointSha256': file_hash(checkpoint_file), 'parentModelSha256': file_hash(parent_file), 'actualRewardsOnly': True}})
            with ThreadPoolExecutor(max_workers=2) as pool:
                native = list(pool.map(lambda _: node('progressive-model-io.cjs', {'op': 'verify', 'file': str(exported)}), range(2)))
            if any(not e['passed'] or e['actionTraceSha256'] != final['full']['actionTraceSha256'] or core(e['result']) != core(final['full']['result']) for e in native):
                raise RuntimeError('Exported native decoder does not reproduce all learned full commands')
        report = {'passed': True, 'improved': improved, 'identity': expected_config, 'environment': metadata,
                  'baselineFull': baseline, 'baselinePractice': practice, 'history': history, 'records': records,
                  'validations': validations, 'optimizerState': state, 'nativeVerifications': native,
                  'exportedModelFile': str(exported) if exported else None,
                  'result': native[0]['result'] if improved else core(baseline['result']),
                  'boundary': 'Private reward-selected V3/Monza growth, actual neuronal observations only. Cached practice is not a full generation. All final promotions verified in two independent native processes with exact command/progress/time traces. No active app/save/release replacement, teacher or imposed path.'}
        atomic_json(directory / 'report.json', report)
        return report
    finally:
        for p in pipes:
            p.close()
        if optimizer:
            optimizer.close()

def alive(pid):
    p = subprocess.run(['powershell.exe', '-NoProfile', '-Command', f'if(Get-Process -Id {int(pid)} -ErrorAction SilentlyContinue){{exit 0}}else{{exit 1}}'], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    return p.returncode == 0

def state_stopped(champion, iteration, last_improvement):
    return champion['laps'] == 2 or iteration >= 4 and iteration - last_improvement >= 3

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='progressive-3652-first')
    parser.add_argument('--stages', type=int, default=6)
    parser.add_argument('--iterations', type=int, default=8)
    parser.add_argument('--population', type=int, default=16)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--repair-driver', action='store_true', help='Record an explicit recovery of transport-only source changes after a confirmed terminal failed run')
    args = parser.parse_args()
    if not args.tag.replace('-', '').isalnum() or not 1 <= args.stages <= 12 or not 4 <= args.iterations <= 30 or not 4 <= args.population <= 100 or not 2 <= args.workers <= 4:
        raise ValueError('Bounded private research configuration required')
    out = BASE / args.tag
    out.mkdir(exist_ok=True)
    manifest_file = out / 'run.json'
    hashes = {name: file_hash(ROOT / name) for name in SOURCES}
    configuration = {k: v for k, v in vars(args).items() if k not in ['resume', 'repair_driver']}
    original = BASE / 'retained-native-model/model.malecns-neural-grown.json'
    if manifest_file.exists():
        old = read(manifest_file)
        if not args.resume or old['status'] == 'finished' or alive(old['pid']):
            raise RuntimeError('Preserve finished run or confirmed live process; never restart solely on observation timeout')
        if old['configuration'] != configuration:
            raise RuntimeError('Resume configuration mismatch')
        changed = [name for name in hashes if hashes[name] != old['sourceHashes'].get(name)]
        if changed:
            allowed = {'work/train_progressive_context.py', 'work/neuronal_experiment_io.py'}
            if not args.repair_driver or old['status'] != 'failed' or not set(changed) <= allowed:
                raise RuntimeError('Resume source mismatch; no automatic compatibility bypass')
            # Preserve completed report source identities; only future stages use
            # the explicitly recorded repaired orchestration. Inference is unchanged.
            old.setdefault('sourceRevisions', []).append({'previousSourceHashes': old['sourceHashes'], 'newSourceHashes': hashes,
                'changed': changed, 'previousStatus': old['status'], 'previousError': old.get('error'),
                'boundary': 'Explicit terminal-run transport recovery only. Completed models/reports remain immutable; neural/physical sources unchanged.'})
            old['sourceHashes'] = hashes
        manifest = old
    else:
        manifest = {'configuration': configuration, 'sourceHashes': hashes, 'nodeExecutableSha256': file_hash(NODE),
                    'initialModelFile': str(original), 'initialModelSha256': file_hash(original), 'stages': [],
                    'bestModelFile': str(original), 'bestResult': core(model_data(original)['verifiedFullResult'])}
    manifest.update(status='running', pid=os.getpid())
    atomic_json(manifest_file, manifest)
    failures = 0
    for stage in manifest['stages']:
        failures = 0 if stage['improved'] else failures + 1
    try:
        for index in range(len(manifest['stages']) + 1, args.stages + 1):
            retention = 'peak' if failures % 2 == 0 else 'none'
            fraction = max(.65, .8 - .1 * (failures // 2))
            directory = out / f'stage-{index:02d}'
            if (directory / 'report.json').exists():
                report = read(directory / 'report.json')
                if not report['passed'] or report['identity']['sourceHashes'] != hashes:
                    raise RuntimeError('Existing stage is not a verified matching completion')
            else:
                report = run_stage(directory, Path(manifest['bestModelFile']), args, hashes, retention, fraction)
            row = {'stage': index, 'improved': report['improved'], 'result': report['result'], 'reportFile': str(directory / 'report.json'),
                   'reportSha256': file_hash(directory / 'report.json'), 'evaluations': len(report['records']), 'retention': retention, 'protectedFraction': fraction}
            manifest['stages'].append(row)
            if report['improved']:
                manifest['bestModelFile'], manifest['bestResult'], failures = report['exportedModelFile'], report['result'], 0
            else:
                failures += 1
            atomic_json(manifest_file, manifest)
            print('PROGRESSIVE_STAGE_DONE ' + json.dumps(row), flush=True)
            if manifest['bestResult']['laps'] == 2:
                break
        manifest['status'] = 'finished'
        manifest['twoLapsAchieved'] = manifest['bestResult']['laps'] == 2
        atomic_json(manifest_file, manifest)
        print('PROGRESSIVE_DONE ' + json.dumps({'bestResult': manifest['bestResult'], 'stages': len(manifest['stages']), 'twoLapsAchieved': manifest['twoLapsAchieved']}), flush=True)
    except Exception as error:
        manifest.update(status='failed', error=str(error))
        atomic_json(manifest_file, manifest)
        raise

if __name__ == '__main__':
    main()
