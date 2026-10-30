"""Reconstruct archive selection, RNG, every mutation and actual episode admission."""
import argparse
import json
import sys
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash
from train_memory_archive import BASE, KEYS, valid, improves
from neuronal_memory_archive import Archive

def normalized(value):
    return json.loads(json.dumps(value))

def verify(tag):
    assert tag.replace('-', '').isalnum()
    out = BASE/tag
    assert not (out/'verification.json').exists()
    r = json.loads((out/'report.json').read_text())
    identity = r['identity']
    assert r['passed'] and not r['promoted'] and identity['format'] == 'male-cns-neuronal-memory-frontier-archive-v1'
    assert identity['pythonVersion'] == sys.version and identity['population'] == 16 and identity['dimensions'] == 9
    for f, digest in {**identity['sourceHashes'], **identity['sourceClosure']}.items():
        assert file_hash(ROOT/f) == digest, f
    assert file_hash(identity['baselineProofFile']) == identity['baselineProofSha256']
    parent = json.loads(open(identity['baselineProofFile']).read())
    assert parent['passed']
    for f, digest in parent['sourceHashes'].items():
        assert file_hash(ROOT/f) == digest
    seed_dir = __import__('pathlib').Path(identity['seedDirectory'])
    assert file_hash(seed_dir/'report.json') == identity['seedReportSha256']
    assert file_hash(seed_dir/'verification.json') == identity['seedVerificationSha256']
    seeds = []
    for name, digest in identity['seedIterationHashes'].items():
        assert file_hash(seed_dir/name) == digest
        seeds.extend(json.loads((seed_dir/name).read_text())['evaluated'])
    assert len(seeds) == r['historicalImportedCandidates'] == 256
    metadata = json.loads((out/'metadata.json').read_text())
    assert len(metadata['parallelEnvironments']) == 4 and len({e['physicalPid'] for e in metadata['parallelEnvironments']}) == 4
    preflight = json.loads((out/'preflight.json').read_text())
    assert preflight['passed'] and len(preflight['practices']) == 4
    for e in [preflight['full'], *preflight['practices']]:
        assert valid(e) and e['actionTraceSha256'] == parent['actionTraceSha256']
        assert all(e['result'][k] == parent['result'][k] for k in KEYS)
    archive = Archive({'genes': parent['genes'], 'episode': preflight['full']}, identity['seed'])
    for row in seeds:
        archive.offer(row)
    assert normalized(archive.snapshot()) == json.loads((out/'initial-archive.json').read_text())
    records, summaries, best, hashes = [], [], None, {}
    for generation in range(1, identity['generations']+1):
        asked = json.loads((out/f'asked-{generation:03}.json').read_text())
        expected = archive.ask()
        assert asked['candidates'] == expected
        assert asked['protectedTrace'] == archive.champion['episode']['actionTraceSha256']
        frontier = sorted(archive.cells.values(), key=lambda row: (row['episode']['result']['bestProgress'], row['episode']['result']['fitness']), reverse=True)[0]
        file = out/f'iteration-{generation:03}.json'
        hashes[file.name] = file_hash(file)
        row = json.loads(file.read_text())
        assert row['generation'] == generation and len(row['evaluated']) == 16
        assert row['evaluated'][0]['episode']['actionTraceSha256'] == asked['protectedTrace']
        assert row['evaluated'][1]['episode']['actionTraceSha256'] == frontier['episode']['actionTraceSha256']
        for index, candidate in enumerate(row['evaluated']):
            assert candidate['candidate'] == index and candidate['environment'] == index % 4
            assert candidate['genes'] == expected[index]['genes']
            e = candidate['episode']
            assert valid(e) and e['validationMode'] == 'practice' and e['controls'] > 0
            assert len(e['result']['lapTimes']) == e['result']['laps']
            archive.offer(candidate)
            if improves(e, best['episode']['result'] if best else parent['result']):
                best = candidate
        assert normalized(archive.snapshot()) == row['archive']
        records.extend(row['evaluated'])
        summaries.append({'generation': generation, 'bestFitness': max(e['episode']['result']['fitness'] for e in row['evaluated']), 'maxProgress': max(e['episode']['result']['bestProgress'] for e in row['evaluated']), 'maxLaps': max(e['episode']['result']['laps'] for e in row['evaluated']), 'archiveCells': len(archive.cells), 'cleanImproved': best is not None})
    assert r['iterations'] == summaries and r['bestClean'] == best
    assert r['actualCandidateEvaluations'] == len(records)
    assert r['actualSuffixControls'] == sum(e['episode']['controls'] for e in records)
    eligible = bool(best and len(r['fullProofs']) == 2 and all(improves(e, parent['result']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in r['fullProofs']))
    assert r['eligibleForIndependentNativeProof'] == eligible
    for k, env in enumerate(r['cudaByEnvironment']):
        c = env['cuda']
        assert c['stats']['gpuCalls'] > 0 and c['stats']['cpuFallbacks'] == 0
        assert c['identity'] == metadata['parallelEnvironments'][k]['metadata']['cuda']['identity']
        for f, digest in c['identity']['sources'].items():
            assert file_hash(ROOT/f) == digest
        assert file_hash(c['identity']['driverPath']) == c['identity']['driverSha256']
    proof = {'passed': True, 'reportSha256': file_hash(out/'report.json'), 'verifierSha256': file_hash(__file__), 'historicalImportedCandidates': len(seeds), 'actualCandidateEvaluations': len(records), 'archiveUpdates': len(summaries), 'iterationHashes': hashes, 'eligibleForIndependentNativeProof': eligible, 'promoted': False}
    atomic_json(out/'verification.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'iterationHashes'}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('tag')
    verify(parser.parse_args().tag)
