"""Actual current descending-neuron feedback over the frozen global champion."""
import argparse
import json
import queue
import subprocess
import time
from neuronal_experiment_io_retry import ROOT, NODE, Pipe, atomic_json, file_hash
from neural_ppo_parallel import Environments
from train_learned_context_memory import BASE, KEYS, valid, improves

def run(tag, generations):
    assert tag.replace('-', '').isalnum() and 1 <= generations <= 32
    out = BASE/tag
    out.mkdir(exist_ok=False)
    proof_file = BASE/'current-neuronal-feedback-prepared-r2/independent-native.json'
    prepared_file = proof_file.parent/'prepared.json'
    proof = json.loads(proof_file.read_text())
    assert proof['passed'] and proof['genes'] == [0]*18 and proof['preparedSha256'] == file_hash(prepared_file)
    assert proof['actualObservationValuesReproduced'] == 8531*516
    for f, digest in proof['sourceHashes'].items():
        assert file_hash(ROOT/f) == digest
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-current-feedback-env-r2.cjs','work/neural-current-feedback-search.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ['work/train_current_neuronal_feedback_r2.py', 'work/train_learned_context_memory.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    identity = {'format': 'male-cns-current-neuronal-feedback-study-v1', 'appVersion': '5.6.0', 'dimensions': 18, 'population': 16, 'seed': 211026, 'sigma': .5, 'generations': generations, 'baselineProofFile': str(proof_file), 'baselineProofSha256': file_hash(proof_file), 'preparedFile': str(prepared_file), 'preparedSha256': file_hash(prepared_file), 'parentReportSha256': proof['parentReportSha256'], 'sourceHashes': {f: file_hash(ROOT/f) for f in sources}, 'sourceClosure': closure, 'boundary': 'Eighteen current-neuronal readout coefficients, eight actual descending-neuron columns. Whole stronger6599.833 parent frozen. Official actual fitness only. No teacher/route/time/pose targets or deployment.'}
    atomic_json(out/'identity.json', identity)
    env = optimizer = None
    best, elite, records, summaries = None, [0.0]*18, [], []
    started = time.monotonic()
    def progress(phase, **extra):
        atomic_json(out/'state.json', {'phase': phase, 'newRecordedCandidates': len(records), 'wallSeconds': time.monotonic()-started, 'pids': [e.process.pid for e in env.envs] if env else [], **extra})
    try:
        progress('actually-reaching-four-prefixes')
        env = Environments(ROOT/'work/neural-current-feedback-env-r2.cjs', {})
        atomic_json(out/'metadata.json', env.metadata)
        full = env.request('evaluate', weights=elite, mode='full')
        practices = env.all('evaluate', weights=elite, mode='practice')
        for e in [full, *practices]:
            assert valid(e) and e['actionTraceSha256'] == proof['actionTraceSha256']
            assert all(e['result'][k] == proof['result'][k] for k in KEYS)
        atomic_json(out/'preflight.json', {'passed': True, 'full': full, 'practices': practices})
        optimizer = Pipe(ROOT/'work/neural-current-feedback-search.cjs', {'mean': elite, 'sigma': .5, 'population': 16, 'seed': 211026})
        for generation in range(1, generations+1):
            protected = elite[:]
            genes = optimizer.request('ask', elite=protected)
            assert len(genes) == 16 and genes[0] == protected
            atomic_json(out/f'asked-{generation:03}.json', {'genes': genes, 'protectedElite': protected})
            replies, evaluated = queue.Queue(), [None]*16
            def lane(k):
                try:
                    for index in range(k, 16, 4):
                        replies.put((index, env.envs[k].request('evaluate', weights=genes[index], mode='practice')))
                except BaseException as error:
                    replies.put((None, repr(error)))
                    raise
            futures = [env.pool.submit(lane, k) for k in range(4)]
            for completed in range(16):
                index, episode = replies.get(timeout=240)
                if index is None:
                    raise RuntimeError(episode)
                assert valid(episode)
                evaluated[index] = {'candidate': index, 'environment': index % 4, 'genes': genes[index], 'episode': episode}
                progress('evaluating', generation=generation, completedInBatch=completed+1)
            for f in futures:
                f.result()
            assert evaluated[0]['episode']['actionTraceSha256'] == (best['episode']['actionTraceSha256'] if best else proof['actionTraceSha256'])
            scores = [r['episode']['result']['fitness'] for r in evaluated]
            for row in evaluated:
                if improves(row['episode'], best['episode']['result'] if best else proof['result']):
                    best, elite = row, row['genes'][:]
            optimizer.request('tell', fitness=scores)
            state = optimizer.request('state')
            assert state['optimizer']['generation'] == generation
            atomic_json(out/f'iteration-{generation:03}.json', {'generation': generation, 'protectedElite': protected, 'evaluated': evaluated, 'fitness': scores, 'optimizerState': state})
            records.extend(evaluated)
            summary = {'generation': generation, 'bestFitness': max(scores), 'maxProgress': max(e['episode']['result']['bestProgress'] for e in evaluated), 'maxLaps': max(e['episode']['result']['laps'] for e in evaluated), 'cleanImproved': best is not None}
            summaries.append(summary)
            atomic_json(out/'training.json', {'iterations': summaries, 'bestClean': best})
            print(json.dumps(summary), flush=True)
        proofs = []
        if best:
            progress('full-from-line-proofs')
            proofs = [env.request('evaluate', weights=best['genes'], mode='full') for _ in range(2)]
        eligible = bool(best and len(proofs) == 2 and all(improves(e, proof['result']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in proofs))
        report = {'passed': True, 'identity': identity, 'actualCandidateEvaluations': len(records), 'actualSuffixControls': sum(e['episode']['controls'] for e in records), 'iterations': summaries, 'bestClean': best, 'fullProofs': proofs, 'eligibleForIndependentNativeProof': eligible, 'cudaByEnvironment': env.request('metadata_all'), 'promoted': False, 'wallSeconds': time.monotonic()-started}
        atomic_json(out/'report.json', report)
        progress('finished', eligibleForIndependentNativeProof=eligible)
        print(json.dumps({'finished': True, 'eligible': eligible, 'candidates': len(records)}), flush=True)
    except BaseException as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'newRecordedCandidates': len(records)})
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
