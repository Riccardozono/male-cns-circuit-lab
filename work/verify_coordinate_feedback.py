"""Rebuild every paired proposal, accepted update and trust-radius change."""
import argparse
import json
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash
from train_coordinate_feedback import BASE, GROUPS, KEYS, valid
from neuronal_coordinate_search import Search, improves

def verify(tag):
    assert tag.replace('-', '').isalnum()
    out = BASE/tag
    assert not (out/'verification.json').exists()
    report = json.loads((out/'report.json').read_text())
    identity = report['identity']
    assert report['passed'] and not report['promoted'] and identity['dimensions'] == 18 and identity['groups'] == GROUPS
    for file, digest in {**identity['sourceHashes'], **identity['sourceClosure']}.items():
        assert file_hash(ROOT/file) == digest, file
    assert file_hash(identity['baselineProofFile']) == identity['baselineProofSha256']
    assert file_hash(identity['preparedFile']) == identity['preparedSha256']
    parent = json.loads(open(identity['baselineProofFile']).read())
    assert parent['passed'] and parent['genes'] == [0]*18
    for file, digest in parent['sourceHashes'].items():
        assert file_hash(ROOT/file) == digest
    metadata = json.loads((out/'metadata.json').read_text())
    assert len(metadata['parallelEnvironments']) == 4 and len({e['physicalPid'] for e in metadata['parallelEnvironments']}) == 4
    preflight = json.loads((out/'preflight.json').read_text())
    assert preflight['passed'] and len(preflight['practices']) == 4
    for e in [preflight['full'], *preflight['practices']]:
        assert valid(e) and e['actionTraceSha256'] == parent['actionTraceSha256']
        assert all(e['result'][k] == parent['result'][k] for k in KEYS)
    search = Search([0.0]*18)
    best, records, summaries, hashes = None, [], [], {}
    for cycle in range(1, identity['cycles']+1):
        before = search.updates
        for group, indices in enumerate(GROUPS):
            asked = json.loads((out/f'asked-{cycle:03}-{group:02}.json').read_text())
            expected = search.ask(indices)
            expected_trace = best['episode']['actionTraceSha256'] if best else parent['actionTraceSha256']
            assert asked['candidates'] == expected and asked['protectedTrace'] == expected_trace
            file = out/f'group-{cycle:03}-{group:02}.json'
            row = json.loads(file.read_text())
            hashes[file.name] = file_hash(file)
            assert row['cycle'] == cycle and row['group'] == group and len(row['evaluated']) == len(expected)
            assert row['evaluated'][0]['episode']['actionTraceSha256'] == expected_trace
            for index, candidate in enumerate(row['evaluated']):
                assert candidate['candidate'] == index and candidate['environment'] == index % 4 and candidate['genes'] == expected[index]['genes']
                e = candidate['episode']
                assert valid(e) and e['validationMode'] == 'practice' and e['controls'] > 0
                assert len(e['result']['lapTimes']) == e['result']['laps']
            selected = search.tell(row['evaluated'], best['episode']['result'] if best else parent['result'])
            if selected:
                best = selected
            assert row['search'] == search.snapshot()
            records.extend(row['evaluated'])
        improved = search.updates > before
        search.finish_cycle(improved)
        cycle_file = out/f'cycle-{cycle:03}.json'
        assert json.loads(cycle_file.read_text()) == {'cycle': cycle, 'search': search.snapshot(), 'improved': improved}
        hashes[cycle_file.name] = file_hash(cycle_file)
        summaries.append({'cycle': cycle, 'actualTrials': len(records), 'radiusNext': search.radius, 'updates': search.updates, 'bestResult': best['episode']['result'] if best else parent['result']})
    assert report['bestClean'] == best and report['cycles'] == summaries
    assert report['actualCandidateEvaluations'] == len(records)
    assert report['actualSuffixControls'] == sum(r['episode']['controls'] for r in records)
    eligible = bool(best and len(report['fullProofs']) == 2 and all(improves({'episode': e}, parent['result']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in report['fullProofs']))
    assert report['eligibleForIndependentNativeProof'] == eligible
    for k, env in enumerate(report['cudaByEnvironment']):
        c = env['cuda']
        assert c['stats']['gpuCalls'] > 0 and c['stats']['cpuFallbacks'] == 0
        assert c['identity'] == metadata['parallelEnvironments'][k]['metadata']['cuda']['identity']
        for file, digest in c['identity']['sources'].items():
            assert file_hash(ROOT/file) == digest
        assert file_hash(c['identity']['driverPath']) == c['identity']['driverSha256']
    proof = {'passed': True, 'reportSha256': file_hash(out/'report.json'), 'verifierSha256': file_hash(__file__), 'recordHashes': hashes, 'actualCandidateEvaluations': len(records), 'parameterUpdates': search.updates, 'cycles': len(summaries), 'eligibleForIndependentNativeProof': eligible, 'promoted': False}
    atomic_json(out/'verification.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'recordHashes'}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('tag')
    verify(parser.parse_args().tag)
