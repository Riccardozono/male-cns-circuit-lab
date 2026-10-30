"""Independent optimizer/source/episode-record reconciliation, not a new drive."""
import argparse
import json
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from train_neural_coherent_readout import BASE, KEYS, DIMENSIONS, OFFSET, TOTAL, valid, improves

def verify(tag):
    if not tag.replace('-', '').isalnum():
        raise ValueError('Bounded study name required')
    out = BASE/tag
    report = json.loads((out/'report.json').read_text())
    identity = report['identity']
    assert report['passed'] and report['promoted'] is False
    assert identity['dimensions'] == DIMENSIONS and identity['frozenPrefixCount'] == OFFSET
    assert identity['totalPolicyParameters'] == TOTAL and identity['population'] == 16
    assert file_hash(NODE) == identity['nodeExecutableSha256']
    for file, sha in {**identity['sourceHashes'], **identity['completeInferenceAndOptimizerSourceClosure']}.items():
        assert file_hash(ROOT/file) == sha, file
    for name in ['origin', 'prepared', 'normalization', 'frozenPolicy']:
        assert file_hash(identity[name+'File']) == identity[name+'Sha256']
    origin = json.loads(json.loads(open(identity['originFile'], encoding='utf-8').read())['payloadJson'])
    frozen = json.loads(open(identity['frozenPolicyFile'], encoding='utf-8').read())['weights']
    assert len(frozen) == TOTAL and frozen[OFFSET:] == [0]*DIMENSIONS
    metadata = json.loads((out/'metadata.json').read_text())
    assert len(metadata['parallelEnvironments']) == 4
    assert len({e['physicalPid'] for e in metadata['parallelEnvironments']}) == 4
    preflight = json.loads((out/'preflight.json').read_text())
    assert preflight['passed'] and len(preflight['practices']) == 4
    for e in [preflight['full'], *preflight['practices']]:
        assert valid(e) and e['actionTraceSha256'] == origin['fullTraceSha256']
        assert all(e['result'][k] == origin['expectedResult'][k] for k in KEYS)
    assert len(report['cudaByEnvironment']) == 4
    for index, cuda in enumerate(report['cudaByEnvironment']):
        assert cuda['stats']['gpuCalls'] > 0 and cuda['stats']['cpuFallbacks'] == 0
        assert cuda['identity'] == metadata['parallelEnvironments'][index]['metadata']['cuda']['identity']
        for file, sha in cuda['identity']['sources'].items():
            assert file_hash(ROOT/file) == sha
        assert file_hash(cuda['identity']['driverPath']) == cuda['identity']['driverSha256']
        assert file_hash(BASE/'cuda-v3-kernel-prepared-r2/manifest.json') == cuda['identity']['manifestSha256']
    records, iterations, hashes = [], [], {}
    elite, best = [0.0]*DIMENSIONS, None
    optimizer = Pipe(ROOT/'work/neural-readout-coherent-search.cjs',
        {'mean': elite[:], 'sigma': .1, 'population': 16, 'seed': 161026})
    try:
        for generation in range(1, identity['generationsRequested']+1):
            file = out/f'iteration-{generation:03}.json'
            hashes[file.name] = file_hash(file)
            row = json.loads(file.read_text())
            asked = json.loads((out/f'asked-{generation:03}.json').read_text())
            expected = optimizer.request('ask', elite=elite)
            assert row['protectedElite'] == asked['protectedElite'] == elite
            assert asked['genes'] == expected
            assert len(row['evaluated']) == 16
            protected = row['evaluated'][0]['episode']
            assert protected['actionTraceSha256'] == (best['episode']['actionTraceSha256'] if best else origin['fullTraceSha256'])
            scores = []
            for index, result in enumerate(row['evaluated']):
                assert result['candidate'] == index and result['environment'] == index % 4
                assert result['genes'] == expected[index]
                assert all(abs(v) <= 8 for v in result['genes'])
                episode = result['episode']
                assert valid(episode) and episode['validationMode'] == 'practice'
                assert episode['controls'] > 0 and episode['result']['laps'] in [0, 1, 2]
                assert len(episode['result']['lapTimes']) == episode['result']['laps']
                scores.append(episode['result']['fitness'])
                if improves(episode, best['episode']['result'] if best else origin['expectedResult']):
                    best, elite = result, result['genes'][:]
            assert scores == row['fitness']
            optimizer.request('tell', fitness=scores)
            assert optimizer.request('state') == row['optimizerState']
            records.extend(row['evaluated'])
            assert row['actualCandidateEvaluations'] == len(records)
            iterations.append({'generation': generation, 'bestOfficialFitness': max(scores),
                'maxProgress': max(r['episode']['result']['bestProgress'] for r in row['evaluated']),
                'maxLaps': max(r['episode']['result']['laps'] for r in row['evaluated']), 'cleanImproved': best is not None})
    finally:
        optimizer.close()
    assert report['iterations'] == iterations and report['bestClean'] == best
    assert report['actualCandidateEvaluations'] == len(records)
    assert report['actualSuffixControls'] == sum(r['episode']['controls'] for r in records)
    eligible = bool(best and len(report['fullProofs']) == 2
        and all(improves(p, origin['expectedResult']) for p in report['fullProofs'])
        and report['fullProofs'][0]['actionTraceSha256'] == report['fullProofs'][1]['actionTraceSha256'] == best['episode']['actionTraceSha256'])
    assert report['eligibleForIndependentNativeProof'] == eligible
    if best:
        policy = json.loads((out/'best-policy.json').read_text())
        assert policy['status'] == 'research-unverified' and policy['identity'] == identity
        assert policy['weights'] == frozen[:OFFSET]+best['genes']
        assert policy['observedPractice'] == best['episode']
    proof = {'passed': True, 'reportSha256': file_hash(out/'report.json'), 'verifierSha256': file_hash(__file__),
        'iterationHashes': hashes, 'actualCandidateEvaluations': len(records),
        'actualSuffixControls': report['actualSuffixControls'], 'optimizerUpdates': len(iterations),
        'eligibleForIndependentNativeProof': eligible, 'promoted': False,
        'boundary': 'Exact optimizer trajectory, source identities and actual episode records reconciled. Not another physical run or standalone native candidate proof.'}
    atomic_json(out/'verification.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'iterationHashes'}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('tag')
    verify(parser.parse_args().tag)
