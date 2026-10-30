"""Reconcile finite neural probes and quantify their linear PCA compression.

No driving targets or synthetic transitions are produced. Non-neuronal context
is held fixed; this is not a full closed-loop sensitivity proof.
"""
import json
import math
import numpy as np
from neuronal_experiment_io import ROOT, NODE, atomic_json, file_hash

BASE = ROOT/'.impeccable/review/neural-sacl'

def run():
    report_file = BASE/'neuronal-sensory-coverage-6590/report.json'
    model_file = BASE/'neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'
    a = json.loads(report_file.read_text(encoding='utf-8'))
    assert a['passed'] and a['physicalEpisodes'] == 1 and a['physicalControls'] == 8495
    assert a['modelSha256'] == file_hash(model_file)
    for file, sha in a['sources'].items():
        assert file_hash(ROOT/file) == sha, file
    m = json.loads(json.loads(model_file.read_text(encoding='utf-8'))['payloadJson'])
    assert a['actionTraceSha256'] == m['fullTraceSha256']
    assert all(a['result'][k] == m['expectedResult'][k] for k in a['result'])
    ids = [a['descendingNodes'].index(i) for i in a['oldReadout128']]
    assert len(ids) == len(set(ids)) == 128
    p = m['projection']
    project = np.array(p['components'])[:, 384:512]/np.array(p['scales'])[None, 384:512]/np.array(p['componentStd'])[:, None]
    assert project.shape == (8, 128) and np.isfinite(project).all()
    def stats(matrix):
        singular = np.linalg.svd(matrix, compute_uv=False)
        return {'singularValues': singular.tolist(),
                'rankRelative1e-6': int(np.sum(singular>singular[0]*1e-6)) if singular[0] else 0}
    records = []
    for s in a['snapshots']:
        assert len(s['sensors']) == 28
        for h in s['horizons']:
            assert len(h['channels']) == 28
            j = np.array([c['jacobian'] for c in h['channels']])
            assert j.shape == (28, len(a['descendingNodes'])) and np.isfinite(j).all()
            for channel, c in enumerate(h['channels']):
                assert c['channel'] == channel and c['actual'] == s['sensors'][channel]
                assert c['probeRange'][0] <= c['actual'] <= c['probeRange'][1]
                assert c['probeRange'][0] < c['probeRange'][1]
                assert math.isclose(c['rmsDerivative'], float(np.sqrt(np.mean(j[channel]**2))), rel_tol=1e-12, abs_tol=1e-15)
            q = j[:, ids]
            records.append({'actualControl': s['control'], 'neuralControls': h['neuralControls'],
                            'all251Descending': stats(j), 'old128Descending': stats(q),
                            'linearPCA8RecentFrameOnly': stats(q@project.T)})
    result = {'passed': True, 'format': 'male-cns-actual-neural-probe-rank-v1',
              'probeReportSha256': file_hash(report_file), 'modelSha256': file_hash(model_file),
              'sourceSha256': file_hash(__file__), 'records': records,
              'boundary': 'Eight local finite-difference matrices at4actually reached states. PCA diagnostic transforms ONLY most-recent128neuronal values, holding earlier history and controller memory/baseline fixed, before final tanh. Rank28 before compression and8after is not proof that omitted directions are needed to drive, that PCA caused the plateau, or that broader inputs will learn better. No physical counterfactual trajectory or optimizer update.'}
    atomic_json(report_file.parent/'rank-verification.json', result)
    print(json.dumps({'passed': True, 'records': [
        {'control': r['actualControl'], 'horizon': r['neuralControls'],
         'rank251': r['all251Descending']['rankRelative1e-6'],
         'rank128': r['old128Descending']['rankRelative1e-6'],
         'rankPCA8': r['linearPCA8RecentFrameOnly']['rankRelative1e-6']} for r in records]}))

if __name__ == '__main__':
    run()
