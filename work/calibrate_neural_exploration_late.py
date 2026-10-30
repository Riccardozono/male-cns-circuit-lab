"""A later neural-only exploration contrast, following the early-audit failures."""
import importlib.util
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

spec = importlib.util.spec_from_file_location('prefix_fit', ROOT/'work/fit-prefix-constrained-readout.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
source = ROOT/'.impeccable/review/learning-ml/v3-descending-readout-comparison-20261024-02'
proof = json.loads((source/'report.json').read_text())
data = json.loads((source/'observations.private.json').read_text())
assert proof['passed'] and file_hash(source/'observations.private.json') == proof['integrity']['observationsSha256']
columns = [data['nodes'].index(n) for n in data['oldNodes']]
features = np.array([r['features'] for r in data['observations']])[:, columns]
design = np.column_stack([features/len(columns)**.5, np.ones(len(features))])
prefix = design[:int(len(design)*.85)]
target = design[int(len(design)*.9):].mean(axis=0)
direction = module.direction(prefix, target, 1e-6)
responses = design@direction
threshold = float(responses[:len(prefix)].max()+.05)
assert threshold < .9
config = {'format': 'neural-variance-ar1-v1', 'direction': direction.tolist(), 'threshold': threshold,
          'rho': .9, 'floor': [.00001, .00005], 'ceiling': [.3, .35]}
gate = np.clip((responses-threshold)/(1-threshold), 0, 1); gate = gate*gate*(3-2*gate)
first = int(np.flatnonzero(gate>.1)[0])
out = ROOT/'.impeccable/review/learning-ml/v3-neural-exploration-late-calibration-20261024-01'
out.mkdir(exist_ok=False)
report = {'passed': True, 'learningSucceeded': False, 'config': config, 'parentSha256': data['parentSha256'],
          'prefixSamples': len(prefix), 'targetSamples': len(design)-int(len(design)*.9),
          'firstGateAbove01Control': first, 'firstGateAbove01ProgressM': data['observations'][first]['progressM'],
          'profile': [{'control': i, 'progressM': r['progressM'], 'response': float(responses[i]), 'gate': float(gate[i])} for i, r in enumerate(data['observations'])],
          'integrity': {'observationsSha256': file_hash(source/'observations.private.json'), 'sourceSha256': file_hash(Path(__file__))},
          'boundary': 'Offline contrast first85percent versus last10percent of actual neural controls; progress is diagnostic only, absent at runtime. It changes variance of random innovations, not desired motor actions. Low positive floors preserve absolute-continuous action likelihoods; this is not proof of safe exploration or learning.'}
atomic_json(out/'report.json', report); atomic_json(out/'config.private.json', config)
(out/'calibrator-at-run.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'passed': True, 'prefix': len(prefix), 'threshold': threshold, 'firstControl': first,
                  'firstProgressM': report['firstGateAbove01ProgressM'], 'report': str(out/'report.json')}))
