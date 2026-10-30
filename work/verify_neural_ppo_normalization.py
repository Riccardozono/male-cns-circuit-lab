"""Recompute fixed normalizer from recorded actual observations, not labels."""
import json
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

def run():
    base = ROOT/'.impeccable/review/neural-sacl'
    out = base/'neuronal-normalization-520-prepared'
    file = out/'normalization.json'
    source = base/'neuronal-ppo-symmetric-steering-first'
    data = json.loads(file.read_text(encoding='utf-8'))
    report_file, proof_file = source/'report.json', source/'verification.json'
    r = json.loads(report_file.read_text(encoding='utf-8'))
    v = json.loads(proof_file.read_text(encoding='utf-8'))
    assert r['passed'] and v['passed'] and v['reportSha256'] == file_hash(report_file)
    assert data['sourceReportFile'] == str(report_file)
    assert data['sourceReportSha256'] == file_hash(report_file)
    assert data['sourceVerificationSha256'] == file_hash(proof_file)
    assert data['preparationSourceSha256'] == file_hash(ROOT/'work/prepare_neural_ppo_normalization.py')
    assert data['sourceModelSha256'] == r['identity']['originSha256']
    expected_names = [f'rollout-{i:03}.json' for i in range(1, len(r['events'])+1)]
    assert list(data['sourceRolloutHashes']) == expected_names
    arrays = []
    for name in expected_names:
        assert data['sourceRolloutHashes'][name] == v['rolloutHashes'][name] == file_hash(source/name)
        rows = json.loads((source/name).read_text(encoding='utf-8'))['rows']
        x = np.array([row['x'] for row in rows], dtype=np.float64)
        assert x.shape == (256, 520) and np.isfinite(x).all() and np.abs(x).max() <= 1
        arrays.append(x)
    x = np.concatenate(arrays)
    assert len(x) == data['actualObservationRows'] == r['actualTransitions']
    assert data['dimensions'] == 520 and data['scaleFloor'] == .05
    assert data['transform'] == 'tanh((actualObservedX-mean)/scale)'
    assert np.array_equal(np.array(data['mean']), x.mean(0))
    assert np.array_equal(np.array(data['scales']), np.maximum(x.std(0), .05))
    proof = {'passed': True, 'normalizationSha256': file_hash(file),
             'preparationSourceSha256': data['preparationSourceSha256'], 'verificationSourceSha256': file_hash(__file__),
             'sourceReportSha256': file_hash(report_file), 'sourceVerificationSha256': file_hash(proof_file),
             'actualRows': len(x), 'dimensions': 520,
             'checks': ['current source/verification/raw rollout identities',
                        'exact mean and population std from actual x vectors only',
                        'all520dimensions retained; componentwise transform; scale floor0.05'],
             'boundary': 'Unsupervised-statistics numerical reconciliation only. The observation x includes genuine neural/controller history, not raw geometry/rewards/desired actions. Not a physical driving improvement or app save.'}
    atomic_json(out/'verification.json', proof)
    print(json.dumps(proof))

if __name__ == '__main__':
    run()
