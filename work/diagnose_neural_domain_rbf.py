"""Compact neural neighbourhood diagnostic; no motor weights or driving labels."""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['OMP_NUM_THREADS'] = '2'
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

source = ROOT/'.impeccable/review/learning-ml/v3-neural-domain-wide-observations-20261024-01'
manifest = json.loads((source/'report.json').read_text())
train_file = source/'training.private.json'
data = json.loads(train_file.read_text())
assert manifest['passed'] and file_hash(train_file) == manifest['trainingSha256']
out = ROOT/'.impeccable/review/learning-ml/v3-neural-domain-rbf-diagnostic-20261024-01'
out.mkdir(exist_ok=False)
models = []
for name,key in [('current64','oldFeatures'),('descending251','features')]:
    domains = [np.array([r[key] for r in d['observations']],dtype=np.float64) for d in data['domains']]
    prefix = np.concatenate([d[:int(len(d)*.8)] for d in domains])
    candidates = np.concatenate([d[int(len(d)*.9):] for d in domains])
    references = [{'headingOffsetRad':d['headingOffsetRad'],'control':i} for d in data['domains']
                  for i in range(int(len(d['observations'])*.9),len(d['observations']))]
    n = prefix.shape[1]
    squared = (candidates*candidates).sum(axis=1)[:,None]+(prefix*prefix).sum(axis=1)[None,:]-2*candidates@prefix.T
    distances = np.sqrt(np.maximum(0,squared)/n).min(axis=1)
    novelty = distances.copy()
    centres = []
    for _ in range(8):
        index = int(np.argmax(novelty))
        if novelty[index] < 1e-8:
            break
        values = candidates[index].copy()
        # Actual observed medoid, never an invented neural/vehicle state.
        minimum_prefix = float(np.sqrt(np.mean((prefix-values)**2,axis=1)).min())
        radius = .95*minimum_prefix
        assert radius > 0
        centres.append({'values':values.tolist(),'radius':radius,'sourceObservation':references[index]})
        novelty = np.minimum(novelty,np.sqrt(np.mean((candidates-values)**2,axis=1)))
        novelty[index] = 0
    assert centres
    def activations(rows):
        columns=[]
        for centre in centres:
            r=np.sqrt(np.mean((rows-np.array(centre['values']))**2,axis=1))/centre['radius']
            columns.append(np.where(r>=1,0,(1-r)**4*(4*r+1)))
        return np.stack(columns,axis=1)
    assert not np.any(activations(prefix))
    models.append({'name':name,'featureKey':key,'neurons':n,'centres':centres,'protectedSamples':len(prefix)})
# No validation row participates in centre choice, radius or centre count.
validation_file = source/'validation.private.json'
assert file_hash(validation_file) == manifest['validationSha256']
validation = json.loads(validation_file.read_text())
profiles=[]
for model in models:
    for split,domains in [('training',data['domains']),('validation-only-after-fit',validation['domains'])]:
        for domain in domains:
            rows=np.array([r[model['featureKey']] for r in domain['observations']])
            columns=[]
            for centre in model['centres']:
                r=np.sqrt(np.mean((rows-np.array(centre['values']))**2,axis=1))/centre['radius']
                columns.append(np.where(r>=1,0,(1-r)**4*(4*r+1)))
            active=np.stack(columns,axis=1)
            gate=active.max(axis=1)
            first=np.flatnonzero(gate>.1)
            profiles.append({'representation':model['name'],'headingOffsetRad':domain['headingOffsetRad'],'split':split,
                             'positiveControls':int(np.count_nonzero(gate)),'maximumFeature':float(gate.max()),
                             'firstAbove01Control':int(first[0]) if len(first) else None,
                             'firstAbove01ProgressM':domain['observations'][int(first[0])]['progressM'] if len(first) else None,
                             'terminalMeanFeature':float(gate[int(len(gate)*.9):].mean())})
report={'format':'private-neural-domain-compact-rbf-diagnostic-v1','passed':True,'learningSucceeded':False,'representationOnly':True,
        'models':models,'profiles':profiles,'trainingSha256':file_hash(train_file),'validationSha256':file_hash(validation_file),
        'sourceHashes':{str(p.relative_to(ROOT)):file_hash(p) for p in [Path(__file__),ROOT/'work/neuronal_experiment_io.py',ROOT/'work/neural-local-rbf.cjs']},
        'boundary':'Same compact-support formula as existing neural-local-rbf: r>=1 ->0, otherwise (1-r)^4(4r+1). Eight farthest-first actual observations chosen from last10percent of three training starts; radii are0.95nearest protected-prefix distance. All retained-prefix activations are exactly0. Validation inspected only after model selection. No policy action or motor weight generated; coverage does not prove safe driving or learning.'}
atomic_json(out/'report.json',report)
atomic_json(out/'centres.private.json',{'format':'private-neural-domain-rbf-centres-v1','requiresSeparateRuntime':True,'models':models,'nodes251':data['nodes'],'nodes64':data['originalReadoutNodes']})
(out/'diagnostic-at-run.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'passed':True,'representationOnly':True,'models':[{k:v for k,v in m.items() if k!='centres'} for m in models],
                  'validation':[p for p in profiles if p['split'].startswith('validation')],'report':str(out/'report.json')}))
