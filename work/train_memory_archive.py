"""Explore actual failed frontiers without promoting them to the clean champion."""
import argparse
import json
import queue
import subprocess
import sys
import time
from neuronal_experiment_io_retry import ROOT, NODE, atomic_json, file_hash
from neural_ppo_parallel import Environments
from train_learned_context_memory import BASE, KEYS, valid, improves
from neuronal_memory_archive import Archive

SEED_DIRECTORY = BASE/'neuronal-additive-memory256-first'

def seed_records():
    report = json.loads((SEED_DIRECTORY/'report.json').read_text())
    verified = json.loads((SEED_DIRECTORY/'verification.json').read_text())
    assert verified['passed'] and verified['reportSha256'] == file_hash(SEED_DIRECTORY/'report.json')
    for f, digest in {**report['identity']['sourceHashes'], **report['identity']['sourceClosure']}.items():
        assert file_hash(ROOT/f) == digest
    rows, hashes = [], {}
    for name, digest in verified['iterationHashes'].items():
        assert file_hash(SEED_DIRECTORY/name) == digest
        hashes[name] = digest
        rows.extend(json.loads((SEED_DIRECTORY/name).read_text())['evaluated'])
    assert len(rows) == 256
    return rows, hashes

def run(tag, generations):
    assert tag.replace('-', '').isalnum() and 1 <= generations <= 32
    out = BASE/tag
    out.mkdir(exist_ok=False)
    seeded, seed_hashes = seed_records()
    proof_file = BASE/'additive-memory-preflight/independent-native.json'
    proof = json.loads(proof_file.read_text())
    assert proof['passed']
    for f, digest in proof['sourceHashes'].items():
        assert file_hash(ROOT/f) == digest
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-additive-memory-env.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ['work/train_memory_archive.py', 'work/neuronal_memory_archive.py', 'work/train_learned_context_memory.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    identity = {'format': 'male-cns-neuronal-memory-frontier-archive-v1', 'appVersion': '5.6.0', 'generations': generations, 'seed': 201026, 'dimensions': 9, 'population': 16, 'pythonVersion': sys.version, 'baselineProofFile': str(proof_file), 'baselineProofSha256': file_hash(proof_file), 'seedDirectory': str(SEED_DIRECTORY), 'seedReportSha256': file_hash(SEED_DIRECTORY/'report.json'), 'seedVerificationSha256': file_hash(SEED_DIRECTORY/'verification.json'), 'seedIterationHashes': seed_hashes, 'sourceHashes': {f: file_hash(ROOT/f) for f in sources}, 'sourceClosure': closure, 'boundary': 'Imported256 are historical actual records, not new evaluations. Unsafe parents remain exploration only; clean official-score champion protected. Same inference/physics/rewards as previous study. No teacher/route/clock inputs or deployment.'}
    atomic_json(out/'identity.json', identity)
    env = None
    records, summaries, best = [], [], None
    started = time.monotonic()
    def progress(phase, **extra):
        atomic_json(out/'state.json', {'phase': phase, 'newRecordedCandidates': len(records), 'historicalImportedCandidates': len(seeded), 'wallSeconds': time.monotonic()-started, 'pids': [e.process.pid for e in env.envs] if env else [], **extra})
    try:
        progress('actually-reaching-four-prefixes')
        env = Environments(ROOT/'work/neural-additive-memory-env.cjs', {})
        atomic_json(out/'metadata.json', env.metadata)
        full = env.request('evaluate', weights=proof['genes'], mode='full')
        practices = env.all('evaluate', weights=proof['genes'], mode='practice')
        for e in [full, *practices]:
            assert valid(e) and e['actionTraceSha256'] == proof['actionTraceSha256']
            assert all(e['result'][k] == proof['result'][k] for k in KEYS)
        atomic_json(out/'preflight.json', {'passed': True, 'full': full, 'practices': practices})
        baseline = {'genes': proof['genes'], 'episode': full}
        archive = Archive(baseline, identity['seed'])
        for row in seeded:
            archive.offer(row)
        atomic_json(out/'initial-archive.json', archive.snapshot())
        for generation in range(1, generations+1):
            asked = archive.ask()
            protected_trace = archive.champion['episode']['actionTraceSha256']
            atomic_json(out/f'asked-{generation:03}.json', {'candidates': asked, 'protectedTrace': protected_trace})
            replies, evaluated = queue.Queue(), [None]*16
            def lane(k):
                try:
                    for index in range(k, 16, 4):
                        replies.put((index, env.envs[k].request('evaluate', weights=asked[index]['genes'], mode='practice')))
                except BaseException as error:
                    replies.put((None, repr(error)))
                    raise
            futures = [env.pool.submit(lane, k) for k in range(4)]
            for completed in range(16):
                index, episode = replies.get(timeout=240)
                if index is None:
                    raise RuntimeError(episode)
                assert valid(episode)
                evaluated[index] = {'candidate': index, 'environment': index % 4, 'genes': asked[index]['genes'], 'episode': episode}
                progress('evaluating', generation=generation, completedInBatch=completed+1)
            for f in futures:
                f.result()
            assert evaluated[0]['episode']['actionTraceSha256'] == protected_trace
            for row in evaluated:
                archive.offer(row)
                if improves(row['episode'], best['episode']['result'] if best else proof['result']):
                    best = row
            atomic_json(out/f'iteration-{generation:03}.json', {'generation': generation, 'evaluated': evaluated, 'archive': archive.snapshot()})
            records.extend(evaluated)
            summary = {'generation': generation, 'bestFitness': max(r['episode']['result']['fitness'] for r in evaluated), 'maxProgress': max(r['episode']['result']['bestProgress'] for r in evaluated), 'maxLaps': max(r['episode']['result']['laps'] for r in evaluated), 'archiveCells': len(archive.cells), 'cleanImproved': best is not None}
            summaries.append(summary)
            atomic_json(out/'training.json', {'iterations': summaries, 'bestClean': best})
            print(json.dumps(summary), flush=True)
        proofs = []
        if best:
            progress('full-from-line-proofs')
            proofs = [env.request('evaluate', weights=best['genes'], mode='full') for _ in range(2)]
        eligible = bool(best and len(proofs) == 2 and all(improves(e, proof['result']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in proofs))
        report = {'passed': True, 'identity': identity, 'historicalImportedCandidates': len(seeded), 'actualCandidateEvaluations': len(records), 'actualSuffixControls': sum(r['episode']['controls'] for r in records), 'iterations': summaries, 'bestClean': best, 'fullProofs': proofs, 'eligibleForIndependentNativeProof': eligible, 'cudaByEnvironment': env.request('metadata_all'), 'promoted': False, 'wallSeconds': time.monotonic()-started}
        atomic_json(out/'report.json', report)
        progress('finished', eligibleForIndependentNativeProof=eligible)
        print(json.dumps({'finished': True, 'eligible': eligible, 'newCandidates': len(records)}), flush=True)
    except BaseException as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'newRecordedCandidates': len(records)})
        raise
    finally:
        if env:
            env.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    parser.add_argument('--generations', type=int, default=16)
    args = parser.parse_args()
    run(args.tag, args.generations)
