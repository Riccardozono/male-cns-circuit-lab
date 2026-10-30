"""Report variation in actual actor observations; no causal learning claim."""
import argparse
import json
import numpy as np
from neuronal_experiment_io import ROOT, file_hash, atomic_json

def audit(tag):
    if not tag.replace('-', '').isalnum():
        raise ValueError('Bounded study name required')
    out = ROOT/'.impeccable/review/neural-sacl'/tag
    files = sorted(out.glob('rollout-*.json'))
    if not files:
        raise ValueError('Actual recorded rollouts required')
    rows = [r for file in files for r in json.loads(file.read_text(encoding='utf-8'))['rows']]
    x = np.array([r['x'] for r in rows])
    assert x.ndim == 2 and x.shape[1] == 13 and np.isfinite(x).all() and np.abs(x).max() <= 1
    singular = np.linalg.svd(x-x.mean(0), compute_uv=False)
    report = {'format': 'male-cns-actual-ppo-feature-audit-v1', 'actualRows': len(rows),
              'rolloutSha256': {f.name: file_hash(f) for f in files},
              'featureStd': x.std(0).tolist(), 'nearSaturationFraction': (abs(x)>.99).mean(0).tolist(),
              'singularValues': singular.tolist(),
              'effectiveCenteredRankTolerance1e-6': int(np.sum(singular>singular[0]*1e-6)) if singular[0] else 0,
              'terminalSteps': sum(r['done'] for r in rows),
              'boundary': 'Variation/rank of these actually visited neuronal/controller inputs only. Full rank does not prove adequate sensory information, causality, learned driving or generalization. The bias feature is intentionally constant.'}
    atomic_json(out/'feature-audit.json', report)
    print(json.dumps({k: v for k, v in report.items() if k != 'rolloutSha256'}))

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('tag')
    audit(p.parse_args().tag)
