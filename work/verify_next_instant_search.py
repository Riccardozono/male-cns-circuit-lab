"""Replay every CMA ask/tell and reconcile source/physical records independently."""
import argparse
import json
from neuronal_experiment_io_retry import ROOT, NODE, Pipe, atomic_json, file_hash
from train_next_instant_context import BASE, KEYS, valid, improves

def verify(tag):
    assert tag.replace('-', '').isalnum()
    out = BASE/tag
    assert not (out/'verification.json').exists()
    report = json.loads((out/'report.json').read_text())
    identity = report['identity']
    assert report['passed'] and report['promoted'] is False
    assert identity['format'] == 'male-cns-next-instant-context-cma-v1'
    assert identity['dimensions'] == 6 and identity['population'] == 16
    for file, digest in {**identity['sourceHashes'], **identity['sourceClosure']}.items():
        assert file_hash(ROOT/file) == digest, file
    assert file_hash(identity['originFile']) == identity['originSha256']
    assert file_hash(identity['preparedFile']) == identity['preparedSha256']
    p = json.loads(open(identity['preparedFile']).read())
    prep_proof_file = BASE/'next-instant-context192-prepared/verification.json'
    assert file_hash(prep_proof_file) == identity['preparationProofSha256']
    prep_proof = json.loads(prep_proof_file.read_text())
    assert prep_proof['passed'] and prep_proof['actualObservationValuesReproduced'] == p['basis']['sourceObservationCount']*516
    metadata = json.loads((out/'metadata.json').read_text())
    assert len(metadata['parallelEnvironments']) == 4
    assert len({e['physicalPid'] for e in metadata['parallelEnvironments']}) == 4
    preflight = json.loads((out/'preflight.json').read_text())
    assert preflight['passed'] and len(preflight['practices']) == 4
    for e in [preflight['full'], *preflight['practices']]:
        assert valid(e) and e['actionTraceSha256'] == p['sourceFullTraceSha256']
        assert all(e['result'][k] == p['sourceFullResult'][k] for k in KEYS)
    assert len(report['cudaByEnvironment']) == 4
    for k, env in enumerate(report['cudaByEnvironment']):
        assert env['cuda']['stats']['gpuCalls'] > 0 and env['cuda']['stats']['cpuFallbacks'] == 0
        assert env['cuda']['identity'] == metadata['parallelEnvironments'][k]['metadata']['cuda']['identity']
        for file, digest in env['cuda']['identity']['sources'].items():
            assert file_hash(ROOT/file) == digest
        assert file_hash(env['cuda']['identity']['driverPath']) == env['cuda']['identity']['driverSha256']
        assert file_hash(BASE/'cuda-v3-kernel-prepared-r2/manifest.json') == env['cuda']['identity']['manifestSha256']
    elite, best, records, summaries, hashes = [0.0]*6, None, [], [], {}
    optimizer = Pipe(ROOT/'work/neural-instant-context-search.cjs', {'mean': elite, 'sigma': identity['sigma'], 'population': 16, 'seed': identity['seed']})
    try:
        for generation in range(1, identity['generationsRequested']+1):
            file = out/f'iteration-{generation:03}.json'
            row = json.loads(file.read_text())
            asked = json.loads((out/f'asked-{generation:03}.json').read_text())
            hashes[file.name] = file_hash(file)
            expected = optimizer.request('ask', elite=elite)
            assert row['generation'] == generation and row['protectedElite'] == asked['protectedElite'] == elite
            assert asked['genes'] == expected and len(row['evaluated']) == 16
            assert row['evaluated'][0]['episode']['actionTraceSha256'] == (best['episode']['actionTraceSha256'] if best else p['sourceFullTraceSha256'])
            scores = []
            for index, candidate in enumerate(row['evaluated']):
                assert candidate['candidate'] == index and candidate['environment'] == index % 4
                assert candidate['genes'] == expected[index] and all(abs(v) <= 8 for v in candidate['genes'])
                e = candidate['episode']
                assert valid(e) and e['validationMode'] == 'practice' and e['controls'] > 0
                assert e['result']['laps'] in [0, 1, 2] and len(e['result']['lapTimes']) == e['result']['laps']
                scores.append(e['result']['fitness'])
                if improves(e, best['episode']['result'] if best else p['sourceFullResult']):
                    best, elite = candidate, candidate['genes'][:]
            assert scores == row['fitness']
            optimizer.request('tell', fitness=scores)
            assert optimizer.request('state') == row['optimizerState']
            records.extend(row['evaluated'])
            summaries.append({'generation': generation, 'bestFitness': max(scores), 'maxProgress': max(e['episode']['result']['bestProgress'] for e in row['evaluated']), 'maxLaps': max(e['episode']['result']['laps'] for e in row['evaluated']), 'cleanImproved': best is not None})
    finally:
        optimizer.close()
    assert report['bestClean'] == best and report['iterations'] == summaries
    assert report['actualCandidateEvaluations'] == len(records)
    assert report['actualSuffixControls'] == sum(e['episode']['controls'] for e in records)
    proofs = report['fullProofs']
    eligible = bool(best and len(proofs) == 2 and all(improves(e, p['sourceFullResult']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in proofs))
    assert report['eligibleForIndependentNativeProof'] == eligible
    proof = {'passed': True, 'reportSha256': file_hash(out/'report.json'), 'verifierSha256': file_hash(__file__), 'iterations': hashes, 'optimizerUpdates': len(summaries), 'actualCandidateEvaluations': len(records), 'eligibleForIndependentNativeProof': eligible, 'promoted': False}
    atomic_json(out/'verification.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'iterations'}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('tag')
    verify(parser.parse_args().tag)
