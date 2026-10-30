"""Fitness-only coherent readout search with actual physical CUDA episodes.

The optimizer receivessix context coefficients and measured official R5 fitness only.
The learned policy sees neuronal/controller observations, never track targets.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import queue
import subprocess
import time
from neuronal_experiment_io_retry import ROOT, NODE, Pipe, atomic_json, file_hash
from neural_ppo_parallel import Environments

BASE = ROOT/'.impeccable/review/neural-sacl'
SOURCE = BASE/'neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'
PREPARED = BASE/'instant-neural-context256-prepared/prepared.json'
DIMENSIONS, OFFSET, TOTAL = 6, 0, 6
KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds', 'lapTimes']

def valid(e):
    return (e['complete'] and not e['censored'] and e['overlap'] == 0
            and all(isinstance(e['result'][k], (int, float)) for k in ['fitness', 'bestProgress', 'laps']))

def improves(e, parent):
    r = e['result']
    return (valid(e) and not any(s in r['reason'] for s in ['urto', 'fuori pista', 'progresso non valido'])
            and r['fitness'] > parent['fitness']+1e-6
            and r['bestProgress'] >= parent['bestProgress'] and r['laps'] >= parent['laps'])

def run(tag, generations):
    if not tag.replace('-', '').isalnum() or not 1 <= generations <= 40:
        raise ValueError('Bounded isolated coherent study required')
    resume_file = BASE/'leaky-context-committed12-prepared/verification.json'
    resume = json.loads(resume_file.read_text())
    assert resume['passed'] and resume['committedGenerations'] == 12 and resume['committedActualCandidates'] == 192
    assert resume['bestClean'] is None and generations > resume['committedGenerations']
    assert file_hash(resume['sourceStudy']+'/identity.json') == resume['sourceIdentitySha256']
    for file, digest in {**resume['sourceIdentity']['sourceHashes'], **resume['sourceIdentity']['completeInferenceAndOptimizerSourceClosure']}.items():
        assert file_hash(ROOT/file) == digest
    for file, digest in resume['iterationHashes'].items():
        assert file_hash(BASE/'neuronal-leaky-context256-first'/file) == digest
    out = BASE/tag
    out.mkdir(exist_ok=False)
    frozen = [0.0]*DIMENSIONS
    assert len(frozen) == TOTAL and frozen[OFFSET:] == [0]*DIMENSIONS
    origin = json.loads(json.loads(SOURCE.read_text())['payloadJson'])
    sources = ['work/train_neural_leaky_context_resumed.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/verify_committed_leaky_prefix.py',
               'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    closure = json.loads(subprocess.check_output([str(NODE), '-e',
        "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-instant-context-search-restored.cjs','work/neural-leaky-context-env.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"],
        cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    identity = {'format': 'male-cns-private-leaky-context-cma-resumed-study-v1', 'appVersion': '5.6.0',
        'originFile': str(SOURCE), 'originSha256': file_hash(SOURCE),
        'preparedFile': str(PREPARED), 'preparedSha256': file_hash(PREPARED),
        'neuralContextDecay': .98, 'parentModelFrozen': True, 'inferenceRevision': 'leaky98-neuronal-context-direct-motor-v1',
        'resumeProofFile': str(resume_file), 'resumeProofSha256': file_hash(resume_file), 'resumedThroughGeneration': 12, 'reusedCommittedActualCandidates': 192, 'dimensions': DIMENSIONS, 'frozenPrefixCount': OFFSET, 'totalPolicyParameters': TOTAL,
        'population': 16, 'generationsRequested': generations, 'seed': 161026, 'initialSigma': .5,
        'nodeExecutableSha256': file_hash(NODE), 'sourceHashes': {f: file_hash(ROOT/f) for f in sources},
        'completeInferenceAndOptimizerSourceClosure': closure,
        'objective': 'Actual complete physical official R5 fitness; no PPO terminal floor or additive cost used for selection',
        'boundary': 'Instantaneous neuronal contexts with bounded learned coefficients, four independently actually reached prefix environments. Practice candidates are not app generations or new independent complete laps. No deployment without independent full native proof.'}
    atomic_json(out/'identity.json', identity)
    started = time.monotonic()
    env = optimizer = None
    records, iterations = [], []
    elite = resume['elite'][:]
    best = None
    def progress(phase, **more):
        atomic_json(out/'state.json', {'phase': phase, 'actualCandidateEvaluations': len(records), 'resumedCommittedCandidates': 192, 'cumulativeCommittedCandidates': 192+len(records),
            'wallSeconds': time.monotonic()-started,
            'physicalPids': [e.process.pid for e in env.envs] if env else [],
            'optimizerPid': optimizer.process.pid if optimizer else None, **more})
    def merge(genes):
        if len(genes) != DIMENSIONS or any(not isinstance(v, (int, float)) or abs(v) > 8 for v in genes):
            raise ValueError('Exact bounded instantaneous context coefficients required')
        return genes[:]
    try:
        progress('actually-reaching-four-independent-prefixes')
        env = Environments(ROOT/'work/neural-leaky-context-env.cjs',
            {'modelFile': str(SOURCE), 'preparedFile': str(PREPARED)})
        atomic_json(out/'metadata.json', env.metadata)
        for e in env.metadata['parallelEnvironments']:
            assert e['metadata']['cuda']['stats']['gpuCalls'] > 0
            assert e['metadata']['cuda']['stats']['cpuFallbacks'] == 0
        progress('actual-zero-policy-preflight')
        full = env.request('evaluate', weights=frozen, mode='full')
        practices = env.all('evaluate', weights=frozen, mode='practice')
        for e in [full, *practices]:
            assert valid(e) and e['actionTraceSha256'] == origin['fullTraceSha256']
            assert all(e['result'][k] == origin['expectedResult'][k] for k in KEYS)
        atomic_json(out/'preflight.json', {'passed': True, 'full': full, 'practices': practices})
        optimizer = Pipe(ROOT/'work/neural-instant-context-search-restored.cjs', {'restored': resume['optimizerState']})
        for generation in range(resume['committedGenerations']+1, generations+1):
            asked_elite = elite[:]
            genes = optimizer.request('ask', elite=asked_elite)
            assert len(genes) == 16 and genes[0] == asked_elite
            atomic_json(out/f'asked-{generation:03}.json', {'genes': genes, 'protectedElite': asked_elite})
            replies = queue.Queue()
            evaluated = [None]*16
            def lane(index):
                try:
                    for candidate in range(index, 16, 4):
                        result = env.envs[index].request('evaluate', weights=merge(genes[candidate]), mode='practice')
                        replies.put((candidate, result))
                except BaseException as error:
                    replies.put((None, repr(error)))
                    raise
            progress('evaluating-actual-coherent-candidates', generation=generation, completedInBatch=0)
            futures = [env.pool.submit(lane, index) for index in range(4)]
            for completed in range(16):
                index, result = replies.get(timeout=240)
                if index is None:
                    raise RuntimeError(result)
                if not valid(result):
                    atomic_json(out/f'incomplete-{generation:03}-{index:02}.json', result)
                    raise RuntimeError('No censored/incomplete/fabricated fitness can enter CMA')
                evaluated[index] = {'candidate': index, 'environment': index % 4, 'genes': genes[index], 'episode': result}
                progress('evaluating-actual-coherent-candidates', generation=generation, completedInBatch=completed+1)
            for future in futures:
                future.result()
            assert all(r is not None for r in evaluated)
            if asked_elite == [0]*DIMENSIONS:
                assert evaluated[0]['episode']['actionTraceSha256'] == origin['fullTraceSha256']
            elif best:
                assert evaluated[0]['episode']['actionTraceSha256'] == best['episode']['actionTraceSha256']
            scores = [row['episode']['result']['fitness'] for row in evaluated]
            for row in evaluated:
                if improves(row['episode'], best['episode']['result'] if best else origin['expectedResult']):
                    best = row
                    elite = row['genes'][:]
            optimizer.request('tell', fitness=scores)
            state = optimizer.request('state')
            assert state['optimizer']['generation'] == generation
            iteration = {'generation': generation, 'actualCandidateEvaluations': len(records)+16,
                'protectedElite': asked_elite, 'evaluated': evaluated, 'fitness': scores, 'optimizerState': state}
            atomic_json(out/f'iteration-{generation:03}.json', iteration)
            records.extend(evaluated)
            iterations.append({'generation': generation, 'bestOfficialFitness': max(scores),
                'maxProgress': max(row['episode']['result']['bestProgress'] for row in evaluated),
                'maxLaps': max(row['episode']['result']['laps'] for row in evaluated), 'cleanImproved': best is not None})
            atomic_json(out/'training.json', {'iterations': iterations, 'bestClean': best})
            if best:
                atomic_json(out/'best-policy.json', {'status': 'research-unverified', 'identity': identity,
                    'weights': merge(best['genes']), 'observedPractice': best['episode']})
            print('COHERENT_GENERATION '+json.dumps(iterations[-1]), flush=True)
        proofs = []
        if best:
            progress('actual-candidate-full-from-line-proof')
            proofs = [env.request('evaluate', weights=merge(best['genes']), mode='full') for _ in range(2)]
        report = {'passed': True, 'identity': identity, 'actualCandidateEvaluations': len(records),
            'reusedCommittedActualCandidates': 192, 'cumulativeCommittedActualCandidates': 192+len(records), 'actualSuffixControls': sum(row['episode']['controls'] for row in records),
            'iterations': iterations, 'bestClean': best, 'fullProofs': proofs,
            'eligibleForIndependentNativeProof': bool(best and len(proofs) == 2
                and all(improves(p, origin['expectedResult']) for p in proofs)
                and proofs[0]['actionTraceSha256'] == proofs[1]['actionTraceSha256'] == best['episode']['actionTraceSha256']),
            'cudaByEnvironment': [m['cuda'] for m in env.request('metadata_all')],
            'wallSeconds': time.monotonic()-started, 'promoted': False}
        atomic_json(out/'report.json', report)
        progress('finished', eligibleForIndependentNativeProof=report['eligibleForIndependentNativeProof'])
        print('COHERENT_FINISHED '+json.dumps({k: report[k] for k in ['actualCandidateEvaluations', 'actualSuffixControls', 'eligibleForIndependentNativeProof', 'wallSeconds']}), flush=True)
    except BaseException as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'actualCompleteRecordedCandidates': len(records), 'wallSeconds': time.monotonic()-started})
        raise
    finally:
        if optimizer:
            optimizer.close()
        if env:
            env.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    parser.add_argument('--generations', type=int, default=16)
    args = parser.parse_args()
    run(args.tag, args.generations)
