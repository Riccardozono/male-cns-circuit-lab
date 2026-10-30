"""Fitness-only CMA search over a gated affine of actual learned motor commands."""
import os
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import time

from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash

BASE = ROOT/'.impeccable/review/neural-sacl'
MODEL_FILE = BASE/'neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'
MODEL_REPORT = BASE/'neuronal-statehead-6584-cma-search/report.json'
CATALOG_FILE = BASE/'neuronal-verified-model-catalog.json'
PREPARED_FILE = BASE/'neuronal-clean-6584-statehead-early1024-prepared/prepared.json'
PREFLIGHT_FILE = BASE/'neuronal-clean-6584-statehead-early1024-preflight/report.json'
ENV_SCRIPT = ROOT/'work/neural-affine-motor-head-env.cjs'
OPTIMIZER_SCRIPT = ROOT/'work/neural-affine-head-cma.cjs'
IDENTITY = [1.0, 0.0, 1.0, 0.0]
RESULT_KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds', 'lapTimes']
BAD_REASONS = ['urto', 'fuori pista', 'progresso non valido']

def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()

def same_result(left, right):
    return all(left.get(key) == right.get(key) for key in RESULT_KEYS)

def valid_episode(episode):
    result = episode['result']
    return (episode['complete'] and not episode['censored'] and not episode['gasBrakeOverlapSteps']
            and isinstance(result.get('fitness'), (int, float))
            and isinstance(result.get('bestProgress'), (int, float))
            and isinstance(result.get('laps'), int) and 0 <= result['laps'] <= 2)

def safe_episode(episode):
    return valid_episode(episode) and not any(reason in episode['result']['reason'] for reason in BAD_REASONS)

def rank_episode(episode):
    result = episode['result']
    return (result['laps'], result['bestProgress'], result['fitness'])

def beats_global(episode, protected):
    if not safe_episode(episode):
        return False
    result = episode['result']
    if result['laps'] > protected['laps']:
        return result['bestProgress'] >= protected['bestProgress']
    return (result['laps'] == protected['laps']
            and result['bestProgress'] > protected['bestProgress'] + 1e-6
            and result['fitness'] > protected['fitness'] + 1e-6)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='neuronal-statehead-6590-affine-search-20261023-01')
    parser.add_argument('--iterations', type=int, default=16)
    args = parser.parse_args()
    if not args.tag.replace('-', '').isalnum() or not 1 <= args.iterations <= 40:
        raise ValueError('Use a unique bounded research run and 1–40 CMA iterations')
    out = BASE/args.tag
    out.mkdir(exist_ok=False)

    catalog = json.loads(CATALOG_FILE.read_text(encoding='utf-8'))
    prepared = json.loads(PREPARED_FILE.read_text(encoding='utf-8'))
    preflight = json.loads(PREFLIGHT_FILE.read_text(encoding='utf-8'))
    model_envelope = json.loads(MODEL_FILE.read_text(encoding='utf-8'))
    model_data = json.loads(model_envelope['payloadJson'])
    model_report = json.loads(MODEL_REPORT.read_text(encoding='utf-8'))
    protected = model_data['expectedResult']
    catalog_entry = catalog['selectedResearch']
    if (catalog_entry['modelSha256'] != file_hash(MODEL_FILE)
        or catalog_entry['reportSha256'] != file_hash(MODEL_REPORT)
        or catalog_entry['modelSha256'] != model_report['cleanModelSha256']
        or not model_report['passed'] or not model_report['improvedProtectedGlobal']
        or model_data['status'] != 'clean-verified' or protected['laps'] != 1
        or not preflight['passed'] or preflight['phase'] != 'finished'
        or preflight['preparedSha256'] != file_hash(PREPARED_FILE)
        or prepared['parentSha256'] != model_data['parentSha256']
        or prepared['firstActivatedControl'] != 7727
        or file_hash(NODE) != catalog['nodeExecutableSha256']):
        raise RuntimeError('Current catalog, clean one-lap parent, actual 7727 neural context, and pinned Node identity required')

    source_files = [
        'work/train_neural_affine_motor_head.py', 'work/neural-affine-motor-head-env.cjs',
        'work/neural-affine-motor-head.cjs', 'work/neural-affine-head-cma.cjs',
        'work/neural-head-cma-transport.cjs', 'work/neural-cma.cjs',
        'work/neuronal_experiment_io.py', 'work/neural-statehead-model.cjs',
        'work/neural-statehead.cjs', 'work/neural-frontier-chain.cjs',
        'work/neural-command-state.cjs', 'work/neural-projected-frontier.cjs',
        'work/neural-context-stack.cjs', 'work/neural-context-readout.cjs',
        'work/neural-command-live.cjs', 'work/neural-command-model.cjs',
        'work/neural-command-residual.cjs', 'work/neural-projected-residual.cjs',
        'work/neural-progressive-action.cjs', 'work/neural-context-readout.cjs',
        'work/neural-json-head.cjs', 'work/exact-dense.cjs', 'work/exact-coo.cjs',
        '.impeccable/experimental-penalty5/outputs/simulation.js',
        '.impeccable/experimental-penalty5/outputs/rewards.js',
        '.impeccable/experimental-penalty5/outputs/neural-learning.js',
        '.impeccable/experimental-penalty5/outputs/vehicle-992.js',
        'outputs/data/connectome.json', 'outputs/data/circuits.json'
    ]
    started = time.monotonic()
    pipes = []
    optimizer = None
    records = []
    iterations = []
    def state(phase, **extra):
        atomic_json(out/'state.json', {
            'pid': os.getpid(), 'phase': phase, 'elapsedWallSeconds': time.monotonic()-started,
            'actualCandidateEvaluations': len(records), 'childPids': [pipe.process.pid for pipe in pipes], **extra
        })

    state('starting-two-independent-actual-physics-evaluators')
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(Pipe, ENV_SCRIPT, {'configuration': {
                'preparedFile': str(PREPARED_FILE), 'modelFile': str(MODEL_FILE)
            }}) for _ in range(2)]
            for future in futures:
                pipes.append(future.result())
                state('reaching-neural-gate-from-line')
        metadata = pipes[0].metadata
        if (metadata != pipes[1].metadata or metadata['modelSha256'] != file_hash(MODEL_FILE)
            or metadata['preparedSha256'] != file_hash(PREPARED_FILE)
            or metadata['gateFirstActivatedControl'] != prepared['firstActivatedControl']):
            raise RuntimeError('The two actual stateful evaluators do not share the current model/context identity')

        full_requests = [pipe.send('evaluate', genes=IDENTITY, mode='full', watchdogMs=180000) for pipe in pipes]
        full_baselines = [pipe.receive(request) for pipe, request in zip(pipes, full_requests)]
        for proof in full_baselines:
            if (not valid_episode(proof) or not same_result(proof['result'], protected)
                or proof['actionTraceSha256'] != model_data['fullTraceSha256']):
                raise RuntimeError('Identity affine must exactly reproduce the selected one-lap model from line')
        if (full_baselines[0]['actionTraceSha256'] != full_baselines[1]['actionTraceSha256']
            or full_baselines[0]['gatedSuffixTraceSha256'] != full_baselines[1]['gatedSuffixTraceSha256']):
            raise RuntimeError('Independent identity baselines differ')

        practice_requests = [pipe.send('evaluate', genes=IDENTITY, mode='practice', watchdogMs=180000) for pipe in pipes]
        practice_baselines = [pipe.receive(request) for pipe, request in zip(pipes, practice_requests)]
        for full, practice in zip(full_baselines, practice_baselines):
            if (not valid_episode(practice) or not same_result(practice['result'], protected)
                or practice['actionTraceSha256'] != full['gatedSuffixTraceSha256']):
                raise RuntimeError('Actual cached neural context does not reproduce the exact full-run suffix')

        identity = {
            'configuration': vars(args), 'appVersion': model_data['appVersion'],
            'modelId': model_data['modelId'], 'circuitId': model_data['circuitId'],
            'protectedGlobalModelSha256': file_hash(MODEL_FILE),
            'protectedGlobalReportSha256': file_hash(MODEL_REPORT),
            'verifiedCatalogSha256': file_hash(CATALOG_FILE),
            'earlyNeuralContextPreparedSha256': file_hash(PREPARED_FILE),
            'earlyNeuralContextPreflightSha256': file_hash(PREFLIGHT_FILE),
            'pinnedNodeSha256': file_hash(NODE), 'metadata': metadata,
            'protectedResult': protected, 'affineIdentity': IDENTITY,
            'parameterLimits': [[0.25, 2], [-0.25, 0.25], [0.25, 2], [-0.25, 0.25]],
            'population': 16, 'workers': 2, 'initialSigma': 0.2, 'seed': 15102116,
            'objective': 'actual simulator fitness; no reward, physics, sensors or route changes',
            'sourceHashes': {name: file_hash(ROOT/name) for name in source_files},
            'boundary': 'The 4 learned values transform the real parent steering and exclusive longitudinal commands only after a context gate computed from 516 current neuronal/controller values. Identity must match the validated one-lap model before search. Full-from-line and fresh-process proofs required for any candidate. No target action, route, coordinate, speed target, lap count or clock enters controller inputs.'
        }
        atomic_json(out/'identity.json', identity)
        atomic_json(out/'identity-baselines.json', {
            'independentFullFromLine': full_baselines,
            'actualReachedContextSuffixes': practice_baselines,
            'exactIdentityMatch': True
        })
        print('AFFINE_READY '+json.dumps({
            'protected': protected, 'gateFirstActivatedControl': metadata['gateFirstActivatedControl'],
            'identityProofs': len(full_baselines), 'practiceSuffixProofs': len(practice_baselines),
            'modelSha256': identity['protectedGlobalModelSha256']
        }), flush=True)

        optimizer = Pipe(OPTIMIZER_SCRIPT, {
            'mean': IDENTITY, 'sigma': 0.2, 'population': 16, 'seed': 15102116
        })
        elite_genes = IDENTITY[:]
        best_safe = {'genes': IDENTITY[:], 'episode': full_baselines[0], 'source': 'protected-identity'}
        best_improved = None
        for iteration in range(1, args.iterations+1):
            genes = optimizer.request('ask', elite=elite_genes)
            if len(genes) != 16 or any(len(row) != 4 for row in genes):
                raise RuntimeError('CMA returned an invalid actual candidate batch')
            scores = []
            for offset in range(0, 16, 2):
                batch = genes[offset:offset+2]
                requests = [pipe.send('evaluate', genes=row, mode='practice', watchdogMs=180000)
                            for pipe, row in zip(pipes, batch)]
                episodes = [pipe.receive(request) for pipe, request in zip(pipes, requests)]
                for row, episode in zip(batch, episodes):
                    if not valid_episode(episode):
                        raise RuntimeError('Censored/incomplete episodes cannot receive invented fitness')
                    result = episode['result']
                    records.append({'iteration': iteration, 'genes': row, 'episode': episode})
                    scores.append(result['fitness'])
                    candidate = {'genes': row[:], 'episode': episode, 'source': 'actual-practice-rollout'}
                    if safe_episode(episode) and rank_episode(episode) > rank_episode(best_safe['episode']):
                        best_safe = candidate
                        elite_genes = row[:]
                    if beats_global(episode, protected) and (best_improved is None
                        or rank_episode(episode) > rank_episode(best_improved['episode'])):
                        best_improved = candidate
                state('actual-cma-search', iteration=iteration,
                      lastResults=[episode['result'] for episode in episodes], bestSafe=best_safe['episode']['result'],
                      bestImproved=best_improved['episode']['result'] if best_improved else None)
            optimizer_result = optimizer.request('tell', fitness=scores)
            row = {
                'iteration': iteration, 'evaluations': len(records), 'optimizer': optimizer_result,
                'bestSafe': best_safe['episode']['result'], 'bestSafeGenes': best_safe['genes'],
                'bestImproved': best_improved['episode']['result'] if best_improved else None,
                'bestImprovedGenes': best_improved['genes'] if best_improved else None,
                'wallSeconds': time.monotonic()-started
            }
            iterations.append(row)
            atomic_json(out/'progress.json', {
                'identity': identity, 'records': records, 'iterations': iterations,
                'optimizerState': optimizer.request('state')
            })
            print('AFFINE_PROGRESS '+json.dumps(row), flush=True)
            if best_improved and best_improved['episode']['result']['laps'] >= 2:
                break

        optimizer_state = optimizer.request('state')
        optimizer.close(); optimizer = None
        for pipe in pipes:
            pipe.close()
        pipes = []

        fresh_proofs = []
        candidate_genes = best_improved['genes'] if best_improved else None
        if best_improved:
            state('two-fresh-process-full-from-line-proofs', candidateGenes=candidate_genes)
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(Pipe, ENV_SCRIPT, {'configuration': {
                    'preparedFile': str(PREPARED_FILE), 'modelFile': str(MODEL_FILE)
                }}) for _ in range(2)]
                pipes = [future.result() for future in futures]
            if pipes[0].metadata != metadata or pipes[1].metadata != metadata:
                raise RuntimeError('Fresh proof processes do not match the trained source identity')
            requests = [pipe.send('evaluate', genes=candidate_genes, mode='full', watchdogMs=180000) for pipe in pipes]
            fresh_proofs = [pipe.receive(request) for pipe, request in zip(pipes, requests)]
            for proof in fresh_proofs:
                if (not valid_episode(proof) or not beats_global(proof, protected)
                    or not same_result(proof['result'], best_improved['episode']['result'])
                    or proof['gatedSuffixTraceSha256'] != best_improved['episode']['actionTraceSha256']):
                    raise RuntimeError('The clean practice candidate did not exactly repeat as a full from-line episode')
            if (fresh_proofs[0]['actionTraceSha256'] != fresh_proofs[1]['actionTraceSha256']
                or fresh_proofs[0]['gatedSuffixTraceSha256'] != fresh_proofs[1]['gatedSuffixTraceSha256']):
                raise RuntimeError('Independent fresh full candidate traces differ')

        report = {
            'phase': 'finished', 'identity': identity,
            'identityFullProofs': full_baselines,
            'identityPracticeSuffixProofs': practice_baselines,
            'actualCandidateEvaluations': len(records), 'iterations': iterations,
            'optimizerState': optimizer_state,
            'bestSafeExploration': best_safe,
            'bestCleanImprovementPractice': best_improved,
            'freshFullFromLineProofs': fresh_proofs,
            'twoLapObjectiveReached': bool(fresh_proofs and all(proof['result']['laps'] == 2 for proof in fresh_proofs)),
            'learningSucceeded': bool(fresh_proofs and all(proof['result']['laps'] == 2 for proof in fresh_proofs)),
            'promotedToWindowsApp': False,
            'promotedToVerifiedCatalog': False,
            'wallSeconds': time.monotonic()-started,
            'boundary': 'Bounded 4-parameter CMA trained only on actual simulator fitness after a current-neural-context gate. Identity baseline and cached suffix were physically checked; any reported candidate is re-evaluated from the line in two fresh Node 24.19.0 processes. Not an app integration, not compatible with ordinary saves, and not evidence for other models/tracks/cold starts. A research test result cannot complete the broader learning goal.'
        }
        atomic_json(out/'report.json', report)
        state('finished', reportSha256=file_hash(out/'report.json'), learningSucceeded=report['learningSucceeded'])
        print('AFFINE_DONE '+json.dumps({
            'evaluations': len(records), 'bestSafe': best_safe['episode']['result'],
            'bestImproved': best_improved['episode']['result'] if best_improved else None,
            'freshProofs': len(fresh_proofs), 'twoLapObjectiveReached': report['twoLapObjectiveReached'],
            'report': str(out/'report.json')
        }), flush=True)
    except Exception as error:
        atomic_json(out/'partial-records.json', {'records': records, 'iterations': iterations})
        state('failed', error=repr(error))
        raise
    finally:
        for pipe in pipes:
            pipe.close()
        if optimizer:
            optimizer.close()

if __name__ == '__main__':
    main()
