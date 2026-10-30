"""Unsupervised late neural contrast; never fits desired driving actions."""
import importlib.util
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

spec = importlib.util.spec_from_file_location('prefix_fit', ROOT/'work/fit-prefix-constrained-readout.py')
fit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fit)
source = ROOT/'.impeccable/review/learning-ml/v3-neural-context-bank-observations-20261024-01/observations.private.json'
data = json.loads(source.read_text())
assert data['passed'] and data['zeroHeadIdenticalControls'] == len(data['observations'])
features = np.array([r['features'] for r in data['observations']], dtype=np.float64)
design = np.column_stack([features/np.sqrt(features.shape[1]), np.ones(len(features))])
prefix_count = int(len(features)*.8)
target_start = int(len(features)*.9)
vector = fit.direction(design[:prefix_count], design[target_start:].mean(axis=0), 1e-6)
response = design@vector
threshold = float(response[:prefix_count].max()+.05)
assert -1 < threshold < .9 and np.max(np.abs(vector)) < 1e6
gate = np.clip((response-threshold)/(1-threshold), 0, 1)
gate = gate*gate*(3-2*gate)
assert not np.any(gate[:prefix_count]) and np.any(gate>.1)
first = int(np.flatnonzero(gate>.1)[0])
context = {'format':'neural-context-gate-v1','direction':vector.tolist(),'threshold':threshold,
           'rho':0,'floor':[.00001,.00005],'ceiling':[.3,.35]}
out = ROOT/'.impeccable/review/learning-ml/v3-neural-context-bank-calibration-20261024-01'
out.mkdir(exist_ok=False)
report = {'format':'private-neural-context-bank-calibration-v1','passed':True,'learningSucceeded':False,
          'observationsSha256':file_hash(source),'config':context,'prefixCount':prefix_count,'targetCount':len(features)-target_start,
          'firstGateAbove01Control':first,'firstGateAbove01ProgressM':data['observations'][first]['progressM'],
          'profile':[{'control':i,'progressM':r['progressM'],'speedMps':r['speedMps'],'response':float(response[i]),'gate':float(gate[i])}
                     for i,r in enumerate(data['observations'])],
          'sourceHashes':{str(p.relative_to(ROOT)):file_hash(p) for p in [Path(__file__),ROOT/'work/fit-prefix-constrained-readout.py',ROOT/'work/neuronal_experiment_io.py']},
          'boundary':'First80percent versus last10percent of actual recorded neural controls, no action labels. The gate reads only 64 neural features during execution; progress/control index are calibration annotations. Sigma/rho fields satisfy the shared gate validator and are not used for action noise in this decoder.'}
atomic_json(out/'report.json',report)
atomic_json(out/'config.private.json',context)
(out/'calibrator-at-run.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'passed':True,'prefixCount':prefix_count,'threshold':threshold,'firstGateAbove01Control':first,
                  'firstGateAbove01ProgressM':report['firstGateAbove01ProgressM'],'report':str(out/'report.json')}))
