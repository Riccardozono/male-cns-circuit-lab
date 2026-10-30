"""Independent optimizer, source and actual-episode reconciliation."""
import argparse
import json
from neuronal_experiment_io_retry import ROOT, Pipe, atomic_json, file_hash
from train_current_neuronal_feedback_r2 import BASE, KEYS, valid, improves

def verify(tag):
    assert tag.replace('-', '').isalnum()
    out = BASE/tag
    assert not (out/'verification.json').exists()
    report = json.loads((out/'report.json').read_text())
    identity = report['identity']
    assert report['passed'] and not report['promoted'] and identity['dimensions'] == 18 and identity['population'] == 16
    for file, digest in {**identity['sourceHashes'], **identity['sourceClosure']}.items():
        assert file_hash(ROOT/file) == digest, file
    assert file_hash(identity['baselineProofFile']) == identity['baselineProofSha256']
    assert file_hash(identity['preparedFile']) == identity['preparedSha256']
    parent = json.loads(open(identity['baselineProofFile']).read())
    assert parent['passed'] and parent['genes'] == [0]*18 and parent['parentReportSha256'] == identity['parentReportSha256']
    for file, digest in parent['sourceHashes'].items():
        assert file_hash(ROOT/file) == digest
    metadata = json.loads((out/'metadata.json').read_text())
    assert len(metadata['parallelEnvironments']) == 4 and len({e['physicalPid'] for e in metadata['parallelEnvironments']}) == 4
    preflight = json.loads((out/'preflight.json').read_text())
    assert preflight['passed'] and len(preflight['practices']) == 4
    for e in [preflight['full'], *preflight['practices']]:
        assert valid(e) and e['actionTraceSha256'] == parent['actionTraceSha256']
        assert all(e['result'][k] == parent['result'][k] for k in KEYS)
    for k, env in enumerate(report['cudaByEnvironment']):
        c = env['cuda']
        assert c['stats']['gpuCalls'] > 0 and c['stats']['cpuFallbacks'] == 0
        assert c['identity'] == metadata['parallelEnvironments'][k]['metadata']['cuda']['identity']
        for file, digest in c['identity']['sources'].items():
            assert file_hash(ROOT/file) == digest
        assert file_hash(c['identity']['driverPath']) == c['identity']['driverSha256']
    elite, best, records, summaries, hashes = [0.0]*18, None, [], [], {}
    optimizer = Pipe(ROOT/'work/neural-current-feedback-search.cjs', {'mean': elite, 'sigma': identity['sigma'], 'population': 16, 'seed': identity['seed']})
    try:
        for generation in range(1, identity['generations']+1):
            file = out/f'iteration-{generation:03}.json'
            row = json.loads(file.read_text())
            asked = json.loads((out/f'asked-{generation:03}.json').read_text())
            hashes[file.name] = file_hash(file)
            expected = optimizer.request('ask', elite=elite)
            assert row['generation'] == generation and row['protectedElite'] == asked['protectedElite'] == elite
            assert asked['genes'] == expected and len(row['evaluated']) == 16
            assert row['evaluated'][0]['episode']['actionTraceSha256'] == (best['episode']['actionTraceSha256'] if best else parent['actionTraceSha256'])
            scores = []
            for index, candidate in enumerate(row['evaluated']):
                assert candidate['candidate'] == index and candidate['environment'] == index % 4
                assert candidate['genes'] == expected[index] and len(candidate['genes']) == 18 and all(abs(v) <= 8 for v in candidate['genes'])
                e = candidate['episode']
                assert valid(e) and e['validationMode'] == 'practice' and e['controls'] > 0
                assert len(e['result']['lapTimes']) == e['result']['laps']
                scores.append(e['result']['fitness'])
                if improves(e, best['episode']['result'] if best else parent['result']):
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
    assert report['actualSuffixControls'] == sum(r['episode']['controls'] for r in records)
    eligible = bool(best and len(report['fullProofs']) == 2 and all(improves(e, parent['result']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in report['fullProofs']))
    assert report['eligibleForIndependentNativeProof'] == eligible
    proof = {'passed': True, 'reportSha256': file_hash(out/'report.json'), 'verifierSha256': file_hash(__file__), 'iterationHashes': hashes, 'actualCandidateEvaluations': len(records), 'optimizerUpdates': len(summaries), 'eligibleForIndependentNativeProof': eligible, 'promoted': False}
    atomic_json(out/'verification.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'iterationHashes'}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('tag')
    verify(parser.parse_args().tag)
