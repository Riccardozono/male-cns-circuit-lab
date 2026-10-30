"""Real structured parameter calibration, never prescribed vehicle commands."""
import json
import queue
import subprocess
import time
from neuronal_experiment_io_retry import ROOT, NODE, atomic_json, file_hash
from neural_ppo_parallel import Environments
from train_learned_context_memory import BASE, KEYS, valid, improves

VALUES = [-4, -2, -1, -.5, 0, .5, 1, 2, 4]
TAG = 'neuronal-mixture-bias-grid81-first'

def run():
    out = BASE/TAG
    out.mkdir(exist_ok=False)
    proof_file = BASE/'learned-mixture-feedback-preflight/independent-native.json'
    axis_file = BASE/'mixture-single-axis-full-native.json'
    proof, axis = json.loads(proof_file.read_text()), json.loads(axis_file.read_text())
    assert proof['passed'] and len(proof['genes']) == 19 and proof['genes'][-1] == 0
    assert axis['complete'] and not axis['censored'] and axis['genes'] == proof['genes'][:18]+[1]
    for reference in [proof, axis]:
        for f, digest in reference['sourceHashes'].items():
            assert file_hash(ROOT/f) == digest
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-mixture-feedback-env.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ['work/probe_mixture_bias_grid.py', 'work/train_learned_context_memory.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    identity = {'format': 'male-cns-actual-mixture-bias-grid-v1', 'appVersion': '5.6.0', 'dimensions': 19, 'values': VALUES, 'baselineProofFile': str(proof_file), 'baselineProofSha256': file_hash(proof_file), 'axisFile': str(axis_file), 'axisSha256': file_hash(axis_file), 'sourceHashes': {f: file_hash(ROOT/f) for f in sources}, 'sourceClosure': closure, 'boundary': 'Cartesian grid of two learned bias coefficients, mixture1; remaining seventeen genes unchanged. No steering/throttle/brake command imposed, route, clock or teacher.81actualshort physical trials, not81full laps. Existing independent native baseline proof reused with sources verified; newfourprefixesactuallyreached.'}
    atomic_json(out/'identity.json', identity)
    candidates = []
    for steering in VALUES:
        for longitudinal in VALUES:
            genes = proof['genes'][:]
            genes[0] += steering
            genes[1] += longitudinal
            genes[18] = 1
            assert all(abs(x) <= 8 for x in genes)
            candidates.append({'genes': genes, 'steeringBiasDelta': steering, 'longitudinalBiasDelta': longitudinal})
    atomic_json(out/'asked.json', candidates)
    env, best = None, None
    evaluated = [None]*len(candidates)
    started = time.monotonic()
    try:
        atomic_json(out/'state.json', {'phase': 'actually-reaching-four-prefixes', 'actualCompleted': 0})
        env = Environments(ROOT/'work/neural-mixture-feedback-env.cjs', {})
        atomic_json(out/'metadata.json', env.metadata)
        practices = env.all('evaluate', weights=proof['genes'], mode='practice')
        for e in practices:
            assert valid(e) and e['actionTraceSha256'] == proof['actionTraceSha256']
            assert all(e['result'][k] == proof['result'][k] for k in KEYS)
        atomic_json(out/'preflight.json', {'passed': True, 'practices': practices, 'fullNativeReferenceReused': str(proof_file)})
        replies = queue.Queue()
        def lane(k):
            try:
                for index in range(k, len(candidates), 4):
                    replies.put((index, env.envs[k].request('evaluate', weights=candidates[index]['genes'], mode='practice')))
            except BaseException as error:
                replies.put((None, repr(error)))
                raise
        futures = [env.pool.submit(lane, k) for k in range(4)]
        for completed in range(len(candidates)):
            index, episode = replies.get(timeout=240)
            if index is None:
                raise RuntimeError(episode)
            assert valid(episode)
            row = {'candidate': index, 'environment': index % 4, 'genes': candidates[index]['genes'], 'episode': episode}
            evaluated[index] = row
            atomic_json(out/f'candidate-{index:03}.json', row)
            atomic_json(out/'state.json', {'phase': 'evaluating', 'actualCompleted': completed+1, 'pids': [e.process.pid for e in env.envs], 'wallSeconds': time.monotonic()-started})
        for f in futures:
            f.result()
        # Native full retained-gate-only trial and actual grid centre must agree.
        centre = VALUES.index(0)*len(VALUES)+VALUES.index(0)
        assert evaluated[centre]['episode']['actionTraceSha256'] == axis['actionTraceSha256']
        for row in evaluated:
            if improves(row['episode'], best['episode']['result'] if best else proof['result']):
                best = row
        proofs = []
        if best:
            atomic_json(out/'state.json', {'phase': 'full-from-line-proofs', 'actualCompleted': len(evaluated)})
            proofs = [env.request('evaluate', weights=best['genes'], mode='full') for _ in range(2)]
        eligible = bool(best and len(proofs) == 2 and all(improves(e, proof['result']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in proofs))
        report = {'passed': True, 'identity': identity, 'actualCandidateEvaluations': len(evaluated), 'actualSuffixControls': sum(e['episode']['controls'] for e in evaluated), 'evaluated': evaluated, 'bestClean': best, 'fullProofs': proofs, 'eligibleForIndependentNativeProof': eligible, 'cudaByEnvironment': env.request('metadata_all'), 'promoted': False, 'wallSeconds': time.monotonic()-started}
        atomic_json(out/'report.json', report)
        atomic_json(out/'state.json', {'phase': 'finished', 'actualCompleted': len(evaluated), 'eligibleForIndependentNativeProof': eligible})
        print(json.dumps({'finished': True, 'actualTrials': len(evaluated), 'bestClean': best, 'eligible': eligible}), flush=True)
    except BaseException as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'actualCompleted': sum(r is not None for r in evaluated)})
        raise
    finally:
        if env:
            env.close()

if __name__ == '__main__':
    run()
