"""Reconstruct the complete coefficient grid and reconcile physical records."""
import json
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash
from probe_mixture_bias_grid import BASE, TAG, VALUES
from train_learned_context_memory import KEYS, valid, improves

if __name__ == '__main__':
    out = BASE/TAG
    assert not (out/'verification.json').exists()
    report = json.loads((out/'report.json').read_text())
    identity = report['identity']
    assert report['passed'] and not report['promoted'] and identity['values'] == VALUES
    for file, digest in {**identity['sourceHashes'], **identity['sourceClosure']}.items():
        assert file_hash(ROOT/file) == digest, file
    assert file_hash(identity['baselineProofFile']) == identity['baselineProofSha256']
    assert file_hash(identity['axisFile']) == identity['axisSha256']
    parent = json.loads(open(identity['baselineProofFile']).read())
    axis = json.loads(open(identity['axisFile']).read())
    assert parent['passed'] and axis['complete'] and not axis['censored']
    for reference in [parent, axis]:
        for file, digest in reference['sourceHashes'].items():
            assert file_hash(ROOT/file) == digest
    metadata = json.loads((out/'metadata.json').read_text())
    assert len(metadata['parallelEnvironments']) == 4 and len({e['physicalPid'] for e in metadata['parallelEnvironments']}) == 4
    preflight = json.loads((out/'preflight.json').read_text())
    assert preflight['passed'] and len(preflight['practices']) == 4
    for e in preflight['practices']:
        assert valid(e) and e['actionTraceSha256'] == parent['actionTraceSha256']
        assert all(e['result'][k] == parent['result'][k] for k in KEYS)
    asked = json.loads((out/'asked.json').read_text())
    expected = []
    for steering in VALUES:
        for longitudinal in VALUES:
            genes = parent['genes'][:]
            genes[0] += steering
            genes[1] += longitudinal
            genes[18] = 1
            expected.append({'genes': genes, 'steeringBiasDelta': steering, 'longitudinalBiasDelta': longitudinal})
    assert asked == expected and len(report['evaluated']) == len(expected) == 81
    best, hashes = None, {}
    for index, candidate in enumerate(report['evaluated']):
        file = out/f'candidate-{index:03}.json'
        hashes[file.name] = file_hash(file)
        assert json.loads(file.read_text()) == candidate
        assert candidate['candidate'] == index and candidate['environment'] == index % 4 and candidate['genes'] == expected[index]['genes']
        e = candidate['episode']
        assert valid(e) and e['validationMode'] == 'practice' and e['controls'] > 0 and len(e['result']['lapTimes']) == e['result']['laps']
        if improves(e, best['episode']['result'] if best else parent['result']):
            best = candidate
    centre = VALUES.index(0)*len(VALUES)+VALUES.index(0)
    assert report['evaluated'][centre]['episode']['actionTraceSha256'] == axis['actionTraceSha256']
    assert all(report['evaluated'][centre]['episode']['result'][k] == axis['result'][k] for k in KEYS)
    assert report['bestClean'] == best and report['actualCandidateEvaluations'] == 81
    assert report['actualSuffixControls'] == sum(row['episode']['controls'] for row in report['evaluated'])
    eligible = bool(best and len(report['fullProofs']) == 2 and all(improves(e, parent['result']) and e['actionTraceSha256'] == best['episode']['actionTraceSha256'] for e in report['fullProofs']))
    assert report['eligibleForIndependentNativeProof'] == eligible
    for k, env in enumerate(report['cudaByEnvironment']):
        c = env['cuda']
        assert c['stats']['gpuCalls'] > 0 and c['stats']['cpuFallbacks'] == 0
        assert c['identity'] == metadata['parallelEnvironments'][k]['metadata']['cuda']['identity']
        for file, digest in c['identity']['sources'].items():
            assert file_hash(ROOT/file) == digest
        assert file_hash(c['identity']['driverPath']) == c['identity']['driverSha256']
    proof = {'passed': True, 'reportSha256': file_hash(out/'report.json'), 'verifierSha256': file_hash(__file__), 'recordHashes': hashes, 'actualCandidateEvaluations': 81, 'eligibleForIndependentNativeProof': eligible, 'promoted': False, 'boundary': 'Reconstructs all learned parameter vectors and reconciles actual records, including full-native centre trial. Not another81physicalruns or81independentlaps.'}
    atomic_json(out/'verification.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'recordHashes'}))
