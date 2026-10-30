"""Actual learned gain/bias feedback on neuronal motor outputs; global guard."""
import os
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import time
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash

KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds']
ZERO = [0.0] * 4

def valid_episode(episode):
    return (episode['complete'] and not episode['censored']
            and not episode['gasBrakeOverlapSteps']
            and all(isinstance(episode['result'][k], (int, float)) for k in ['fitness', 'bestProgress', 'laps']))

def improves(episode, previous):
    r = episode['result']
    return (valid_episode(episode)
            and not any(s in r['reason'] for s in ['urto', 'fuori pista', 'progresso non valido'])
            and r['fitness'] > previous['fitness'] + 1e-6
            and r['bestProgress'] >= previous['bestProgress'] and r['laps'] >= previous['laps'])

def native_proof(file, allow_research=False):
    result = subprocess.run([str(NODE), str(ROOT/'work/affine-model-io.cjs'), json.dumps({'file': str(file), 'allowResearch': allow_research})],
                            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                            encoding='utf-8', timeout=210, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError('Standalone native state-head failed: ' + result.stderr[-8192:] + result.stdout[-4096:])
    return json.loads(result.stdout)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='neuronal-affine-6590-search')
    parser.add_argument('--iterations', type=int, default=16)
    args = parser.parse_args()
    if not args.tag.replace('-', '').isalnum() or not 1 <= args.iterations <= 40:
        raise ValueError('Bounded isolated state-head study required')
    base = ROOT/'.impeccable/review/neural-sacl'
    model_file = base/'neuronal-affine-6590-prepared/zero.malecns-affine.json'
    registry_file = base/'neuronal-verified-model-catalog.json'
    seed_model = json.loads(json.loads(model_file.read_text(encoding='utf-8'))['payloadJson'])
    registry = json.loads(registry_file.read_text(encoding='utf-8'))
    protected = registry['selectedResearch']['result']
    if seed_model['originSha256'] != registry['selectedResearch']['modelSha256'] or any(seed_model['expectedResult'][k] != protected[k] for k in KEYS):
        raise RuntimeError('The seed must preserve the actual strongest verified research origin')
    if file_hash(NODE) != registry['nodeExecutableSha256']:
        raise RuntimeError('Pinned verified Node executable required')
    out = base/args.tag
    out.mkdir(exist_ok=False)
    atomic_json(out/'protected-catalog-at-start.json', registry)
    started = time.monotonic()
    pipes, records, iterations = [], [], []
    optimizer = None
    best_clean = best_clean_genes = None
    elite_genes = ZERO[:]
    def state(phase, **more):
        atomic_json(out/'state.json', {'pid': os.getpid(), 'phase': phase,
                    'actualCandidateEvaluations': len(records), 'elapsedWallSeconds': time.monotonic()-started,
                    'physicalChildPids': [p.process.pid for p in pipes], **more})
    state('actually-reaching-two-prefixes')
    try:
        errors = []
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(Pipe, ROOT/'work/neural-affine-env.cjs',
                                  {'configuration': {'modelFile': str(model_file)}}) for _ in range(2)]
            for future in futures:
                try:
                    pipes.append(future.result())
                    state('actually-reaching-two-prefixes')
                except Exception as error:
                    errors.append(error)
        if errors:
            raise errors[0]
        if pipes[0].metadata != pipes[1].metadata or pipes[0].metadata['protectedControls'] != seed_model['provenance']['expectedFirstActivation']:
            raise RuntimeError('Actually reached neural contexts differ')
        state('checking-own-actual-cached-suffixes')
        requests = [p.send('evaluate', genes=ZERO, mode='practice') for p in pipes]
        initial = [p.receive(r) for p, r in zip(pipes, requests)]
        if any(not valid_episode(e) or any(e['result'][k] != protected[k] for k in KEYS)
               or e['wholeActionTraceSha256'] != seed_model['fullTraceSha256'] for e in initial):
            raise RuntimeError('Each real reached prefix must restore the exact complete zero-head suffix')
        state('zero-full-and-native-preflight')
        zero_full = pipes[0].request('evaluate', genes=ZERO, mode='full')
        zero_native = native_proof(model_file, allow_research=True)
        if not valid_episode(zero_full) or zero_full['actionTraceSha256'] != seed_model['fullTraceSha256'] or not zero_native['passed']:
            raise RuntimeError('Zero feedback must repeat the full parent and independently loaded native origin')
        optimizer = Pipe(ROOT/'work/neural-affine-cma.cjs', {'mean': ZERO, 'sigma': .6, 'population': 16, 'seed': 15102116})
        sources = ['work/train_neural_affine.py', 'work/neural-affine-cma.cjs',
                   'work/neural-head-cma-transport.cjs', 'work/neural-cma.cjs', 'work/neuronal_experiment_io.py',
                   'work/neural-affine-env.cjs', 'work/neural-affine-model.cjs', 'work/neural-statehead.cjs',
                   'work/affine-model-io.cjs', 'work/neural-research-source-identity.cjs',
                   'work/neural-command-state.cjs', 'work/neural-frontier-chain.cjs', 'work/neural-command-live.cjs']
        identity = {'configuration': vars(args), 'environment': pipes[0].metadata,
                    'nodeExecutableSha256': file_hash(NODE),
                    'modelFile': str(model_file), 'modelSha256': file_hash(model_file),
                    'protectedCatalogFile': str(out/'protected-catalog-at-start.json'), 'protectedCatalogSha256': file_hash(out/'protected-catalog-at-start.json'),
                    'protectedModelSha256': seed_model['originSha256'],
                    'protectedGlobalResult': protected, 'plasticParameters': 4,
                    'population': 16, 'workers': 2, 'initialSigma': .6, 'seed': 15102116, 'geneBounds': [-4, 4],
                    'sourceHashes': {f: file_hash(ROOT/f) for f in sources},
                    'boundary': 'Fitness-only learned steering gain/bias and longitudinal gain/bias on actual neural parent commands, activated only by actual neuronal context. Not an imposed route or steering/braking target. Global6590m verified research origin preserved. Four calibration parameters are an experimental learning stage, NOT proof that the whole multi-model/two-lap objective is solved. No new biological cells or GPU-gradient claim.'}
        atomic_json(out/'identity.json', identity)
        atomic_json(out/'initial-suffixes.json', initial)
        atomic_json(out/'preflight.json', {'passed': True, 'zeroFull': zero_full, 'zeroNative': zero_native, 'initialSuffixes': initial})
        elite = initial[0]
        print('AFFINE_SEARCH_READY '+json.dumps({'protected': protected, 'physicalPids': [p.process.pid for p in pipes], 'parameters': 4}), flush=True)
        for iteration in range(1, args.iterations+1):
            genes = optimizer.request('ask', elite=elite_genes)
            scores = []
            for offset in range(0, 16, 2):
                batch = genes[offset:offset+2]
                if any(len(x) != 4 or any(not -4 <= v <= 4 for v in x) for x in batch):
                    raise RuntimeError('Only actually evaluated bounded coordinates may receive fitness')
                requests = [p.send('evaluate', genes=x, mode='practice') for p, x in zip(pipes, batch)]
                for p, x, request in zip(pipes, batch, requests):
                    episode = p.receive(request)
                    if not valid_episode(episode):
                        raise RuntimeError('Censored or incomplete physical rollouts never receive invented terminal fitness')
                    records.append({'iteration': iteration, 'genes': x, 'episode': episode})
                    scores.append(episode['result']['fitness'])
                    if episode['result']['fitness'] > elite['result']['fitness'] + 1e-6:
                        elite, elite_genes = episode, x[:]
                    if improves(episode, best_clean['result'] if best_clean else protected):
                        best_clean, best_clean_genes = episode, x[:]
                state('search', iteration=iteration, bestClean=best_clean['result'] if best_clean else None,
                      lastActualResult=records[-1]['episode']['result'])
            metrics = optimizer.request('tell', fitness=scores)
            row = {'iteration': iteration, 'evaluations': len(records), 'optimizer': metrics,
                   'elite': elite['result'], 'eliteGenes': elite_genes,
                   'pendingClean': best_clean['result'] if best_clean else None,
                   'pendingCleanGenes': best_clean_genes, 'wallSeconds': time.monotonic()-started}
            iterations.append(row)
            atomic_json(out/'progress.json', {'identity': identity, 'records': records, 'iterations': iterations,
                                             'optimizerState': optimizer.request('state')})
            print('STATEHEAD_SEARCH_PROGRESS '+json.dumps(row), flush=True)
            if best_clean and best_clean['result']['laps'] == 2:
                break
        selected = best_clean or initial[0]
        selected_genes = best_clean_genes if best_clean else ZERO[:]
        state('two-full-physical-proofs')
        requests = [p.send('evaluate', genes=selected_genes, mode='full') for p in pipes]
        full = [p.receive(r) for p, r in zip(pipes, requests)]
        if (any(not valid_episode(e) or any(e['result'][k] != selected['result'][k] for k in KEYS)
                or e['result']['lapTimes'] != selected['result']['lapTimes'] for e in full)
            or full[0]['actionTraceSha256'] != full[1]['actionTraceSha256']
            or any(e['actionTraceSha256'] != selected['wholeActionTraceSha256'] for e in full)
            or best_clean and any(not improves(e, protected) for e in full)):
            raise RuntimeError('Selected cached candidate did not repeat in two complete from-line episodes')
        for p in pipes:
            p.close()
        data = json.loads(json.loads(model_file.read_text(encoding='utf-8'))['payloadJson'])
        data.update(weights=selected_genes, expectedResult=full[0]['result'],
                    fullTraceSha256=full[0]['actionTraceSha256'], status='clean-verified')
        data['provenance'].update(sourceSearchIdentitySha256=file_hash(out/'identity.json'), actualCandidateEvaluations=len(records))
        payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        selected_file = out/'clean.malecns-affine.json'
        atomic_json(selected_file, {'format': 'male-cns-neuronal-affine-envelope', 'schema': 1,
                                   'payloadJson': payload, 'sha256': hashlib.sha256(payload.encode('utf-8')).hexdigest()})
        state('two-independent-loaded-native-proofs')
        with ThreadPoolExecutor(max_workers=2) as pool:
            native = list(pool.map(lambda _: native_proof(selected_file), range(2)))
        if any(not p['passed'] or not p['complete'] or p['censored'] or p['overlap']
               or p['actionTraceSha256'] != full[0]['actionTraceSha256'] for p in native):
            raise RuntimeError('Standalone numeric export does not exactly match the two actual full proofs')
        farthest = max([{'genes': ZERO, 'episode': initial[0]}]+records,
                       key=lambda r: (r['episode']['result']['laps'], r['episode']['result']['bestProgress'], r['episode']['result']['fitness']))
        report = {'passed': True, 'phase': 'finished', 'identity': identity, 'initialSuffixes': initial,
                  'actualCandidateEvaluations': len(records), 'records': records, 'iterations': iterations,
                  'searchElite': elite, 'searchEliteGenes': elite_genes, 'selectedGenes': selected_genes,
                  'selectedPractice': selected, 'fullProofs': full, 'nativeProofs': native,
                  'improvedProtectedGlobal': bool(best_clean), 'cleanModelFile': str(selected_file),
                  'cleanModelSha256': file_hash(selected_file), 'farthestCachedExploration': farthest,
                  'optimizerState': optimizer.request('state'), 'wallSeconds': time.monotonic()-started,
                  'boundary': 'Actual four-parameter learned neural-command feedback calibration. Strict global clean guard, two full and two independently loaded native proofs. Practice whole trace combines its actual reached prefix with actual suffix; it is not another independent physical episode. No scripted route, braking target, Windows integration, new release, extra biological cells or all-model/circuit/cold-start/two-lap completion claim.'}
        atomic_json(out/'report.json', report)
        state('finished', reportSha256=file_hash(out/'report.json'))
        print('STATEHEAD_SEARCH_DONE '+json.dumps({'passed': True, 'evaluations': len(records), 'improved': bool(best_clean),
                                                  'selected': full[0]['result'], 'model': str(selected_file)}), flush=True)
    except Exception as error:
        atomic_json(out/'partial-records.json', {'records': records, 'iterations': iterations})
        state('failed', error=repr(error))
        raise
    finally:
        for p in pipes:
            p.close()
        if optimizer:
            optimizer.close()

if __name__ == '__main__':
    main()
