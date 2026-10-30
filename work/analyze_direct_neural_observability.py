"""Summarize local numerical sensitivity; not driving examples or control labels."""
import json
import numpy as np
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash

if __name__ == '__main__':
    out = ROOT/'.impeccable/review/neural-sacl/direct-neural-observability'
    assert not (out/'analysis.json').exists()
    source = json.loads((out/'jacobian.json').read_text())
    assert source['passed'] and source['originalFullDriveUnchanged']
    for file, digest in source['sourceHashes'].items():
        assert file_hash(ROOT/file) == digest
    results = []
    for case in source['matrices']:
        matrix = np.asarray(case['jacobian'], dtype=np.float64)
        assert matrix.shape == (28, 77) and np.isfinite(matrix).all()
        singular = np.linalg.svd(matrix, compute_uv=False)
        norms = np.linalg.norm(matrix, axis=1)
        results.append({'horizonControls': case['horizonControls'], 'singularValues': singular.tolist(), 'rankAtRelative1e6': int((singular > singular[0]*1e-6).sum()), 'channelNorms': norms.tolist(), 'nearZeroChannelsAt1e12': np.where(norms < 1e-12)[0].tolist()})
    proof = {'passed': True, 'point': source['point'], 'jacobianSha256': file_hash(out/'jacobian.json'), 'scriptSha256': file_hash(__file__), 'results': results, 'boundary': 'One actually reached neuronal state, cloned numerical probes only. Local sensitivity ranks do not establish global state observability or that a policy can learn steering.'}
    atomic_json(out/'analysis.json', proof)
    print(json.dumps(proof))
