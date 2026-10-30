"""One neural-only context across several observed starts; no action targets."""
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

source = ROOT/'.impeccable/review/learning-ml/v3-neural-context-domains-20261024-01/training-observations.private.json'
data = json.loads(source.read_text())
assert data['passed']
assert {r['headingOffsetRad'] for r in data['training']} == set(data['trainingOffsets'])
assert not set(data['trainingOffsets']) & set(data['heldOutOffsets'])
designs = [np.column_stack([np.asarray([r['features'] for r in domain['observations']])/8,
                           np.ones(len(domain['observations']))]) for domain in data['training']]
assert all(d.shape[1] == 65 and np.all(np.isfinite(d)) for d in designs)
counts = [int(len(d)*.8) for d in designs]
prefix = np.concatenate([d[:n] for d,n in zip(designs,counts)])
targets = np.stack([d[int(len(d)*.9):].mean(axis=0) for d in designs])
constraints = np.vstack([targets,prefix.mean(axis=0)])
desired = np.r_[np.ones(len(targets)),0.0]
trials = []
selected = None
for ridge in [1e-3,1e-4,1e-5,1e-6]:
    gram = prefix.T@prefix/len(prefix)+ridge*np.eye(prefix.shape[1])
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
    trials.append({'ridge':ridge,'condition':condition,'constraintResidual':residual,'threshold':threshold,'usable':usable,'norm':float(np.linalg.norm(vector))})
    # Largest regularization that keeps all actual retained prefixes inactive.
    # No held-out state, outcome or desired driving action selects this model.
    if usable and selected is None:
        selected = (vector.copy(),threshold,ridge)
out = ROOT/'.impeccable/review/learning-ml/v3-neural-domain-calibration-20261024-01'
out.mkdir(exist_ok=False)
if selected is None:
    atomic_json(out/'report.json',{'passed':False,'trials':trials,'boundary':'No usable shared linear neural contrast; no driving policy or test result fabricated.'})
    raise ValueError('No usable multi-domain contrast')
vector,threshold,ridge = selected
context = {'format':'neural-context-gate-v1','direction':vector.tolist(),'threshold':threshold,
           'rho':0,'floor':[.00001,.00005],'ceiling':[.3,.35]}
profiles = []
for domain,design,n in zip(data['training'],designs,counts):
    response = design@vector
    gate = np.clip((response-threshold)/(1-threshold),0,1)
    gate = gate*gate*(3-2*gate)
    assert not np.any(gate[:n]) and np.any(gate>.1)
    first = int(np.flatnonzero(gate>.1)[0])
    profiles.append({'headingOffsetRad':domain['headingOffsetRad'],'protectedControls':n,'firstGateAbove01Control':first,
                     'firstGateAbove01ProgressM':domain['observations'][first]['progressM'],
                     'positiveGateControls':int(np.count_nonzero(gate)),
                     'profile':[{'control':i,'response':float(response[i]),'gate':float(gate[i])} for i in range(len(gate))]})
report = {'format':'private-multi-domain-neural-calibration-v1','passed':True,'learningSucceeded':False,'context':context,'ridge':ridge,'trials':trials,
          'trainingOffsets':data['trainingOffsets'],'heldOutOffsets':data['heldOutOffsets'],'profiles':profiles,
          'trainingObservationsSha256':file_hash(source),
          'sourceHashes':{str(p.relative_to(ROOT)):file_hash(p) for p in [Path(__file__),ROOT/'work/neuronal_experiment_io.py']},
          'boundary':'Three actual target neural means share unit response and retained-prefix mean has zero response. No desired motor actions or held-out neural states fit the gate. Progress/control indices are diagnostic annotations, absent during driving. This is a context calibration, not successful learning.'}
atomic_json(out/'report.json',report)
atomic_json(out/'config.private.json',context)
(out/'calibrator-at-run.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'passed':True,'ridge':ridge,'threshold':threshold,'profiles':[{k:v for k,v in p.items() if k!='profile'} for p in profiles],
                  'report':str(out/'report.json')}))
