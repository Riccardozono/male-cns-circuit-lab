"""Direct paired credit assignment on real physical current-neuronal feedback."""
import argparse
import json
import queue
import subprocess
import time
from neuronal_experiment_io_retry import ROOT, NODE, atomic_json, file_hash
from neural_ppo_parallel import Environments
from train_learned_context_memory import BASE, KEYS, valid
from neuronal_coordinate_search import Search, improves

GROUPS = [list(range(i, min(i+4, 18))) for i in range(0, 18, 4)]

def run(tag, cycles):
    assert tag.replace('-', '').isalnum() and 1 <= cycles <= 16
    out = BASE/tag
    out.mkdir(exist_ok=False)
    proof_file = BASE/'current-neuronal-feedback-prepared-r2/independent-native.json'
    proof = json.loads(proof_file.read_text())
    assert proof['passed'] and proof['genes'] == [0]*18
    for f, digest in proof['sourceHashes'].items():
        assert file_hash(ROOT/f) == digest
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-current-feedback-env-r2.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ['work/train_coordinate_feedback.py', 'work/neuronal_coordinate_search.py', 'work/train_learned_context_memory.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    prepared = proof_file.parent/'prepared.json'
    identity = {'format': 'male-cns-paired-coordinate-feedback-study-v1', 'appVersion': '5.6.0', 'dimensions': 18, 'cycles': cycles, 'groups': GROUPS, 'baselineProofFile': str(proof_file), 'baselineProofSha256': file_hash(proof_file), 'preparedFile': str(prepared), 'preparedSha256': file_hash(prepared), 'sourceHashes': {f: file_hash(ROOT/f) for f in sources}, 'sourceClosure': closure, 'boundary': 'Measured opposed single-coefficient physical trials; no estimated fitness admitted, teacher, route or clock. Same current-neuronal controller/physics/official penalties as prior study. No deployment.'}
    atomic_json(out/'identity.json', identity)
    env = None
    search = Search([0.0]*18)
    best, records, summaries = None, [], []
    started = time.monotonic()
    def progress(phase, **extra):
        atomic_json(out/'state.json', {'phase': phase, 'actualRecordedTrials': len(records), 'wallSeconds': time.monotonic()-started, 'pids': [e.process.pid for e in env.envs] if env else [], **extra})
    try:
        progress('actually-reaching-four-prefixes')
        env = Environments(ROOT/'work/neural-current-feedback-env-r2.cjs', {})
        atomic_json(out/'metadata.json', env.metadata)
        full = env.request('evaluate', weights=search.genes, mode='full')
        practices = env.all('evaluate', weights=search.genes, mode='practice')
        for e in [full, *practices]:
            assert valid(e) and e['actionTraceSha256'] == proof['actionTraceSha256']
            assert all(e['result'][k] == proof['result'][k] for k in KEYS)
        atomic_json(out/'preflight.json', {'passed': True, 'full': full, 'practices': practices})
        for cycle in range(1, cycles+1):
            before = search.updates
            groups = []
            for group, indices in enumerate(GROUPS):
                asked = search.ask(indices)
                expected_trace = best['episode']['actionTraceSha256'] if best else proof['actionTraceSha256']
                atomic_json(out/f'asked-{cycle:03}-{group:02}.json', {'candidates': asked, 'protectedTrace': expected_trace})
                replies, evaluated = queue.Queue(), [None]*len(asked)
                def lane(k):
                    try:
                        for index in range(k, len(asked), 4):
                            replies.put((index, env.envs[k].request('evaluate', weights=asked[index]['genes'], mode='practice')))
                    except BaseException as error:
                        replies.put((None, repr(error)))
                        raise
                futures = [env.pool.submit(lane, k) for k in range(4)]
                for completed in range(len(asked)):
                    index, episode = replies.get(timeout=240)
                    if index is None:
                        raise RuntimeError(episode)
                    assert valid(episode)
                    evaluated[index] = {'candidate': index, 'environment': index % 4, 'genes': asked[index]['genes'], 'episode': episode}
                    progress('evaluating', cycle=cycle, group=group, completedInGroup=completed+1)
                for f in futures:
                    f.result()
                assert evaluated[0]['episode']['actionTraceSha256'] == expected_trace
                selected = search.tell(evaluated, best['episode']['result'] if best else proof['result'])
                if selected:
                    best = selected
                row = {'cycle': cycle, 'group': group, 'evaluated': evaluated, 'search': search.snapshot()}
                atomic_json(out/f'group-{cycle:03}-{group:02}.json', row)
                records.extend(evaluated)
                groups.append(row)
            improved = search.updates > before
            search.finish_cycle(improved)
            atomic_json(out/f'cycle-{cycle:03}.json', {'cycle': cycle, 'search': search.snapshot(), 'improved': improved})
            summary = {'cycle': cycle, 'actualTrials': len(records), 'radiusNext': search.radius, 'updates': search.updates, 'bestResult': best['episode']['result'] if best else proof['result']}
            summaries.append(summary)
            atomic_json(out/'training.json', {'cycles': summaries, 'bestClean': best})
            print(json.dumps(summary), flush=True)
        proofs = []
        if best:
            progress('full-from-line-proofs')
            proofs = [env.request('evaluate', weights=best['genes'], mode='full') for _ in range(2)]
        eligible = bool(best and len(proofs) == 2 and all(improves({'episode': e}, proof['result']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in proofs))
        report = {'passed': True, 'identity': identity, 'actualCandidateEvaluations': len(records), 'actualSuffixControls': sum(e['episode']['controls'] for e in records), 'cycles': summaries, 'bestClean': best, 'fullProofs': proofs, 'eligibleForIndependentNativeProof': eligible, 'cudaByEnvironment': env.request('metadata_all'), 'promoted': False, 'wallSeconds': time.monotonic()-started}
        atomic_json(out/'report.json', report)
        progress('finished', eligibleForIndependentNativeProof=eligible)
        print(json.dumps({'finished': True, 'actualTrials': len(records), 'eligible': eligible}), flush=True)
    except BaseException as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'actualRecordedTrials': len(records)})
        raise
    finally:
        if env:
            env.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    parser.add_argument('--cycles', type=int, default=8)
    args = parser.parse_args()
    run(args.tag, args.cycles)
