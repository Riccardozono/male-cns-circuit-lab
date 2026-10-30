"""Nine learned artificial-memory coefficients, scored on actual physical runs."""
import argparse
import json
import queue
import subprocess
import time
from neuronal_experiment_io_retry import ROOT, NODE, Pipe, atomic_json, file_hash
from neural_ppo_parallel import Environments

BASE = ROOT/'.impeccable/review/neural-sacl'
PREVIOUS = BASE/'neuronal-next-instant256-first'
KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds', 'lapTimes']

def valid(e):
    return e['complete'] and not e['censored'] and e['overlap'] == 0

def improves(e, reference):
    r = e['result']
    return (valid(e) and not any(s in r['reason'] for s in ['urto', 'fuori pista', 'progresso non valido']) and r['fitness'] > reference['fitness']+1e-6 and r['bestProgress'] >= reference['bestProgress'] and r['laps'] >= reference['laps'])

def baseline():
    proof_file = BASE/'learned-context-memory-preflight/independent-native.json'
    proof = json.loads(proof_file.read_text())
    assert proof['passed'] and proof['parentReportSha256'] == file_hash(PREVIOUS/'report.json')
    for f, digest in proof['sourceHashes'].items():
        assert file_hash(ROOT/f) == digest
    return proof_file, proof

def run(tag, generations):
    assert tag.replace('-', '').isalnum() and 1 <= generations <= 32
    out = BASE/tag
    out.mkdir(exist_ok=False)
    proof_file, proof = baseline()
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-context-memory-env.cjs','work/neural-context-memory-search.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ['work/train_learned_context_memory.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    identity = {'format': 'male-cns-learned-context-memory-study-v1', 'appVersion': '5.6.0', 'dimensions': 9, 'population': 16, 'seed': 181026, 'sigma': .5, 'generations': generations, 'baselineProofFile': str(proof_file), 'baselineProofSha256': file_hash(proof_file), 'parentReportSha256': proof['parentReportSha256'], 'sourceHashes': {f: file_hash(ROOT/f) for f in sources}, 'sourceClosure': closure, 'boundary': 'Six motor and three learned neuronal-retention coefficients; frozen prior controller. Official fitness only, no teacher/route/clock inputs. Not biological neurons or a deployed Windows model.'}
    atomic_json(out/'identity.json', identity)
    env = optimizer = None
    elite, best, records, summaries = proof['genes'][:], None, [], []
    started = time.monotonic()
    def progress(phase, **extra):
        atomic_json(out/'state.json', {'phase': phase, 'recordedCandidates': len(records), 'wallSeconds': time.monotonic()-started, 'pids': [e.process.pid for e in env.envs] if env else [], **extra})
    try:
        progress('actually-reaching-four-prefixes')
        env = Environments(ROOT/'work/neural-context-memory-env.cjs', {})
        atomic_json(out/'metadata.json', env.metadata)
        full = env.request('evaluate', weights=elite, mode='full')
        practices = env.all('evaluate', weights=elite, mode='practice')
        for e in [full, *practices]:
            assert valid(e) and e['actionTraceSha256'] == proof['actionTraceSha256']
            assert all(e['result'][k] == proof['result'][k] for k in KEYS)
        atomic_json(out/'preflight.json', {'passed': True, 'full': full, 'practices': practices})
        optimizer = Pipe(ROOT/'work/neural-context-memory-search.cjs', {'mean': elite, 'sigma': .5, 'population': 16, 'seed': 181026})
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
            scores = [e['episode']['result']['fitness'] for e in evaluated]
            for row in evaluated:
                if improves(row['episode'], best['episode']['result'] if best else proof['result']):
                    best, elite = row, row['genes'][:]
            optimizer.request('tell', fitness=scores)
            state = optimizer.request('state')
            assert state['optimizer']['generation'] == generation
            atomic_json(out/f'iteration-{generation:03}.json', {'generation': generation, 'protectedElite': protected, 'evaluated': evaluated, 'fitness': scores, 'optimizerState': state})
            records.extend(evaluated)
            s = {'generation': generation, 'bestFitness': max(scores), 'maxProgress': max(e['episode']['result']['bestProgress'] for e in evaluated), 'maxLaps': max(e['episode']['result']['laps'] for e in evaluated), 'cleanImproved': best is not None}
            summaries.append(s)
            atomic_json(out/'training.json', {'iterations': summaries, 'bestClean': best})
            print(json.dumps(s), flush=True)
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
        atomic_json(out/'failure.json', {'error': repr(error), 'recordedCandidates': len(records)})
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
