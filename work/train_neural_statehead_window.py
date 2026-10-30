"""Actual18coefficient state-dependent neural learning; global clean guard."""
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
from select_neural_verified_catalog import refresh

KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds']
ZERO = [0.0] * 18

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

def native_proof(file):
    result = subprocess.run([str(NODE), str(ROOT/'work/statehead-model-io.cjs'), json.dumps({'file': str(file)})],
                            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                            encoding='utf-8', timeout=210, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError('Standalone native state-head failed: ' + result.stderr[-8192:] + result.stdout[-4096:])
    return json.loads(result.stdout)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='neuronal-statehead-early1024-search')
    parser.add_argument('--prepared', default='neuronal-clean-6584-statehead-early1024-prepared')
    parser.add_argument('--preflight', default='neuronal-clean-6584-statehead-early1024-preflight')
    parser.add_argument('--iterations', type=int, default=16)
    args = parser.parse_args()
    if not all(s.replace('-', '').isalnum() for s in [args.tag, args.prepared, args.preflight]) or not 1 <= args.iterations <= 40:
        raise ValueError('Bounded isolated state-head study required')
    base = ROOT/'.impeccable/review/neural-sacl'
    prepared_file = base/args.prepared/'prepared.json'
    model_file = prepared_file.parent/'zero.malecns-statehead.json'
    preflight_file = base/args.preflight/'report.json'
    registry_file = base/'neuronal-clean-champion.json'
    prepared = json.loads(prepared_file.read_text(encoding='utf-8'))
    preflight = json.loads(preflight_file.read_text(encoding='utf-8'))
    registry = json.loads(registry_file.read_text(encoding='utf-8'))
    catalog = refresh(emit=False)
    protected_entry = catalog['selectedResearch']
    protected = protected_entry['result']
    source_result = prepared['sourceFullResult']
    if (not preflight['passed'] or preflight['phase'] != 'finished'
        or preflight['preparedSha256'] != file_hash(prepared_file)
        or preflight['modelSha256'] != file_hash(model_file)
        or prepared['parentSha256'] != registry['selected']['modelSha256']
        or any(source_result[k] != preflight['native']['result'][k] for k in KEYS)
        or any(file_hash(ROOT/'work'/name) != digest for name, digest in preflight['sourceHashes'].items())):
        raise RuntimeError('Completed exact zero-head proof and unchanged source parent required')
    if file_hash(NODE) != registry['nodeExecutableSha256']:
        raise RuntimeError('Pinned verified Node executable required')
    out = base/args.tag
    out.mkdir(exist_ok=False)
    atomic_json(out/'protected-catalog-at-start.json', catalog)
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
            futures = [pool.submit(Pipe, ROOT/'work/neural-statehead-env.cjs',
                                  {'configuration': {'preparedFile': str(prepared_file), 'modelFile': str(model_file)}}) for _ in range(2)]
            for future in futures:
                try:
                    pipes.append(future.result())
                    state('actually-reaching-two-prefixes')
                except Exception as error:
                    errors.append(error)
        if errors:
            raise errors[0]
        if pipes[0].metadata != pipes[1].metadata or pipes[0].metadata != preflight['metadata']:
            raise RuntimeError('Current physically reached neural contexts differ from the completed preflight')
        state('checking-own-actual-cached-suffixes')
        requests = [p.send('evaluate', genes=ZERO, mode='practice') for p in pipes]
        initial = [p.receive(r) for p, r in zip(pipes, requests)]
        if any(not valid_episode(e) or any(e['result'][k] != source_result[k] for k in KEYS)
               or e['actionTraceSha256'] != prepared['sourceCachedPracticeTraceSha256'] for e in initial):
            raise RuntimeError('Each real reached prefix must restore the exact complete zero-head suffix')
        optimizer = Pipe(ROOT/'work/neural-statehead-cma.cjs', {'mean': ZERO, 'sigma': .6, 'population': 16, 'seed': 15102115})
        sources = ['work/train_neural_statehead_window.py', 'work/select_neural_verified_catalog.py', 'work/neural-statehead-cma.cjs',
                   'work/neural-head-cma-transport.cjs', 'work/neural-cma.cjs', 'work/neuronal_experiment_io.py',
                   'work/neural-statehead-env.cjs', 'work/neural-statehead-model.cjs', 'work/neural-statehead.cjs',
                   'work/statehead-model-io.cjs', 'work/neural-research-source-identity.cjs',
                   'work/neural-command-state.cjs', 'work/neural-frontier-chain.cjs', 'work/neural-command-live.cjs']
        identity = {'configuration': vars(args), 'environment': pipes[0].metadata,
                    'nodeExecutableSha256': file_hash(NODE), 'preparationSha256': file_hash(prepared_file),
                    'modelFile': str(model_file), 'modelSha256': file_hash(model_file),
                    'preflightFile': str(preflight_file), 'preflightSha256': file_hash(preflight_file),
                    'protectedRegistrySha256': file_hash(registry_file), 'sourceParentModelSha256': prepared['parentSha256'],
                    'sourceParentResult': source_result, 'protectedModelSha256': protected_entry['modelSha256'],
                    'protectedCatalogFile': str(out/'protected-catalog-at-start.json'),
                    'protectedCatalogSha256': file_hash(out/'protected-catalog-at-start.json'),
                    'protectedGlobalResult': protected, 'plasticParameters': 18, 'projectionAxes': 8,
                    'population': 16, 'workers': 2, 'initialSigma': .6, 'seed': 15102115, 'geneBounds': [-8, 8],
                    'sourceHashes': {f: file_hash(ROOT/f) for f in sources},
                    'boundary': 'Fitness-only bounded CMA over18current-neuronal-state coefficients and an earlier observed window. Source parent and zero identity are separate from the strongest independently verified cross-family research guard. No teacher, route, clock, progress or ideal controls in the actor. Bound projection changes the actual pending optimizer x. Two full plus two fresh native proofs required; practice is not an app generation. No CUDA-gradient or new biological-cell claim.'}
        atomic_json(out/'identity.json', identity)
        atomic_json(out/'initial-suffixes.json', initial)
        elite = initial[0]
        study_clean, study_clean_genes = initial[0], ZERO[:]
        print('STATEHEAD_SEARCH_READY '+json.dumps({'protected': protected, 'physicalPids': [p.process.pid for p in pipes], 'parameters': 18}), flush=True)
        for iteration in range(1, args.iterations+1):
            genes = optimizer.request('ask', elite=elite_genes)
            scores = []
            for offset in range(0, 16, 2):
                batch = genes[offset:offset+2]
                if any(len(x) != 18 or any(not -8 <= v <= 8 for v in x) for x in batch):
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
                    if improves(episode, study_clean['result']):
                        study_clean, study_clean_genes = episode, x[:]
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
        selected = best_clean or study_clean
        selected_genes = best_clean_genes if best_clean else study_clean_genes
        state('two-full-physical-proofs')
        requests = [p.send('evaluate', genes=selected_genes, mode='full') for p in pipes]
        full = [p.receive(r) for p, r in zip(pipes, requests)]
        if (any(not valid_episode(e) or any(e['result'][k] != selected['result'][k] for k in KEYS)
                or e['result']['lapTimes'] != selected['result']['lapTimes'] for e in full)
            or full[0]['actionTraceSha256'] != full[1]['actionTraceSha256']
            or best_clean and any(not improves(e, protected) for e in full)):
            raise RuntimeError('Selected cached candidate did not repeat in two complete from-line episodes')
        for p in pipes:
            p.close()
        data = json.loads(json.loads(model_file.read_text(encoding='utf-8'))['payloadJson'])
        data.update(weights=selected_genes, expectedResult=full[0]['result'],
                    fullTraceSha256=full[0]['actionTraceSha256'], status='clean-verified')
        data['provenance'].update(sourceSearchIdentitySha256=file_hash(out/'identity.json'), actualCandidateEvaluations=len(records))
        payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        selected_file = out/'clean.malecns-statehead.json'
        atomic_json(selected_file, {'format': 'male-cns-neuronal-state-head-envelope', 'schema': 1,
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
                  'studyCleanPractice': study_clean, 'studyCleanGenes': study_clean_genes,
                  'preservedResearchChampionAtStart': protected_entry,
                  'selectedPractice': selected, 'fullProofs': full, 'nativeProofs': native,
                  'improvedProtectedGlobal': bool(best_clean), 'cleanModelFile': str(selected_file),
                  'cleanModelSha256': file_hash(selected_file), 'farthestCachedExploration': farthest,
                  'optimizerState': optimizer.request('state'), 'wallSeconds': time.monotonic()-started,
                  'boundary': 'Complete actual bounded18coefficient state-dependent neural search. A study-best clean export is NOT a global promotion unless it dominates the stronger protected cross-family research result. Farther cached crashes are not promoted or represented as independently proven full/native exploration. Selected study model alone has two from-line and two independently loaded native proofs. Not Windows integration, a new app version, other tracks/models/cold-start convergence or a claim that updates imply better driving.'}
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
