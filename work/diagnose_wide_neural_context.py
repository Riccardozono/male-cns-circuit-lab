"""Representation diagnostic over existing descending neurons, not a policy."""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['OMP_NUM_THREADS'] = '2'
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

source = ROOT/'.impeccable/review/learning-ml/v3-neural-domain-wide-observations-20261024-01'
training_file = source/'training.private.json'
manifest = json.loads((source/'report.json').read_text())
data = json.loads(training_file.read_text())
old_file = ROOT/'.impeccable/review/learning-ml/v3-neural-domain-calibration-20261024-01/config.private.json'
old_context = json.loads(old_file.read_text())
assert manifest['passed'] and data['passed'] and file_hash(training_file) == manifest['trainingSha256']
assert len(data['nodes']) == 251 and len(set(data['nodes'])) == 251
assert {d['headingOffsetRad'] for d in data['domains']} == set(data['trainingOffsets'])
n = len(data['nodes'])
designs = [np.column_stack([np.array([r['features'] for r in d['observations']])/np.sqrt(n),np.ones(len(d['observations']))]) for d in data['domains']]
counts = [int(len(d)*.8) for d in designs]
prefix = np.concatenate([d[:k] for d,k in zip(designs,counts)])
targets = np.stack([d[int(len(d)*.9):].mean(axis=0) for d in designs])
constraints = np.vstack([targets,prefix.mean(axis=0)])
desired = np.r_[np.ones(len(targets)),0.]
trials = []
selected = None
for ridge in [1e-3,1e-4,1e-5,1e-6]:
    gram = prefix.T@prefix/len(prefix)+ridge*np.eye(n+1)
    inverse = np.linalg.solve(gram,constraints.T)
    small = constraints@inverse
    condition = float(np.linalg.cond(small))
    if condition > 1e13:
        trials.append({'ridge':ridge,'condition':condition,'usable':False})
        continue
    vector = inverse@np.linalg.solve(small,desired)
    residual = float(np.max(np.abs(constraints@vector-desired)))
    threshold = float(np.max(prefix@vector)+.05)
    usable = bool(np.all(np.isfinite(vector)) and np.max(np.abs(vector))<1e6 and residual<1e-6 and -1<threshold<.9)
    trials.append({'ridge':ridge,'condition':condition,'constraintResidual':residual,'threshold':threshold,'norm':float(np.linalg.norm(vector)),'usable':usable})
    if usable and selected is None:
        selected = (vector.copy(),threshold,ridge)
out = ROOT/'.impeccable/review/learning-ml/v3-neural-domain-wide-diagnostic-20261024-01'
out.mkdir(exist_ok=False)
if selected is None:
    atomic_json(out/'report.json',{'passed':False,'trials':trials,'boundary':'No usable shared wide contrast; no policy created or simulated driving gain invented.'})
    raise ValueError('Wide representation did not separate the retained contexts')
vector,threshold,ridge = selected
# Selection above is complete before opening any validation neural row.
validation_file = source/'validation.private.json'
assert file_hash(validation_file) == manifest['validationSha256']
validation = json.loads(validation_file.read_text())
assert not set(data['trainingOffsets']) & {d['headingOffsetRad'] for d in validation['domains']}
def profile(domain, split):
    rows = domain['observations']
    design = np.column_stack([np.array([r['features'] for r in rows])/np.sqrt(n),np.ones(len(rows))])
    old_design = np.column_stack([np.array([r['oldFeatures'] for r in rows])/8,np.ones(len(rows))])
    response = design@vector
    gate = np.clip((response-threshold)/(1-threshold),0,1)
    gate = gate*gate*(3-2*gate)
    old_response = old_design@np.array(old_context['direction'])
    old_gate = np.clip((old_response-old_context['threshold'])/(1-old_context['threshold']),0,1)
    old_gate = old_gate*old_gate*(3-2*old_gate)
    first = np.flatnonzero(gate>.1)
    if split == 'training':
        assert not np.any(gate[:int(len(rows)*.8)]) and len(first)
    return {'headingOffsetRad':domain['headingOffsetRad'],'split':split,'controls':len(rows),
            'old64PositiveControls':int(np.count_nonzero(old_gate)),'wide251PositiveControls':int(np.count_nonzero(gate)),
            'wideMaximumGate':float(gate.max()),'wideFirstAbove01Control':int(first[0]) if len(first) else None,
            'wideFirstAbove01ProgressM':rows[int(first[0])]['progressM'] if len(first) else None,
            'wideTerminalMeanResponse':float(response[int(len(rows)*.9):].mean()),
            'profile':[{'control':i,'response':float(response[i]),'gate':float(gate[i]),'oldGate':float(old_gate[i])} for i in range(len(rows))]}
profiles = [profile(d,'training') for d in data['domains']]+[profile(d,'validation-only-after-fit') for d in validation['domains']]
context = {'format':'neural-context-gate-v1','direction':vector.tolist(),'threshold':threshold,'rho':0,'floor':[.00001,.00005],'ceiling':[.3,.35]}
report = {'format':'private-wide-neural-context-representation-diagnostic-v1','passed':True,'learningSucceeded':False,'representationOnly':True,
          'anatomicalNeurons':data['anatomicalNeurons'],'anatomicalEdges':data['anatomicalEdges'],'currentMotorReadout':len(data['originalReadoutNodes']),
          'wideContextNeurons':n,'nodes':data['nodes'],'bodyIds':data['bodyIds'],'ridge':ridge,'threshold':threshold,'trials':trials,'profiles':profiles,
          'trainingSha256':file_hash(training_file),'validationSha256':file_hash(validation_file),'old64ContextSha256':file_hash(old_file),
          'sourceHashes':{str(p.relative_to(ROOT)):file_hash(p) for p in [Path(__file__),ROOT/'work/neuronal_experiment_io.py']},
          'boundary':'No driving action is generated or changed by this diagnostic. Both readouts use already simulated real descending-neuron activity. Contrast chosen from three training starts only; two previously observed validation starts are evaluated after fitting. More gate coverage is not safe driving or learning success; the 251-feature context is incompatible with the existing 64-feature head runtime.'}
atomic_json(out/'report.json',report)
atomic_json(out/'wide-config.private.json',{'format':'private-wide-neural-context-config-v1','requiresWideFeatureRuntime':True,'nodes':data['nodes'],'bodyIds':data['bodyIds'],'context':context})
(out/'diagnostic-at-run.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'passed':True,'representationOnly':True,'neurons':n,'ridge':ridge,'threshold':threshold,
                  'profiles':[{k:v for k,v in p.items() if k!='profile'} for p in profiles],'report':str(out/'report.json')}))
