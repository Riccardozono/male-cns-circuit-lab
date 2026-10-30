"""Time-blocked offline sensory probe; NEVER produces a driving controller."""
import os
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
import hashlib
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash


def fit_predict(train, test, targets):
    mean = train.mean(axis=0)
    scale = np.maximum(train.std(axis=0), .02)
    x, z = (train-mean)/scale, (test-mean)/scale
    _, singular, axes = np.linalg.svd(x, full_matrices=False)
    count = min(24, int(np.count_nonzero(singular > 1e-8)))
    if count < 1:
        raise RuntimeError('No variable actual neuronal features')
    axes = axes[:count]
    component_scale = np.maximum(singular[:count]/np.sqrt(len(train)), .01)
    a, b = (x @ axes.T)/component_scale, (z @ axes.T)/component_scale
    centre = targets.mean(axis=0)
    weights = np.linalg.solve(a.T@a + .01*np.eye(count), a.T@(targets-centre))
    return b@weights+centre


def main():
    directory = ROOT / '.impeccable/review/neural-sacl/projected-sensory-information'
    files = [directory / f'{name}.json' for name in ['baseline', 'sac-final']]
    data = [json.loads(f.read_text(encoding='utf-8')) for f in files]
    if any(d['format'] != 'male-cns-actual-neuronal-sensory-audit' or d.get('collectionRevision') != 'precontrol-aligned-v2' or d['overlap'] for d in data):
        raise RuntimeError('Actual complete data required')
    if data[0]['sensorNames'] != data[1]['sensorNames'] or data[0]['additionalReadoutIndices'] != data[1]['additionalReadoutIndices']:
        raise RuntimeError('Readout or target definition differs')
    # Same pre-branch trajectory is not two independent episodes of evidence.
    unique = {}
    for episode in data:
        for row in episode['rows']:
            key = hashlib.sha256(json.dumps([row['observation'],row['additionalNeuronalHistory'],row['sensors']],separators=(',',':')).encode()).hexdigest()
            unique.setdefault(key, row)
    rows = sorted(unique.values(), key=lambda r: r['seconds'])
    old = np.asarray([r['observation'] for r in rows], dtype=np.float64)
    extra = np.asarray([r['additionalNeuronalHistory'] for r in rows], dtype=np.float64)
    y = np.asarray([r['sensors'] for r in rows], dtype=np.float64)
    seconds = np.asarray([r['seconds'] for r in rows], dtype=np.float64)
    if old.shape[1] != 516 or extra.shape[1] != 4*123 or y.shape[1] != 28 or not np.isfinite(y).all():
        raise RuntimeError('Actual fixed dimensions required')
    folds = np.minimum(4, ((seconds-seconds.min())/(seconds.max()-seconds.min()+1e-9)*5).astype(int))
    predictions = {}
    fold_sizes = []
    for label, features in [('old128',old),('all251',np.concatenate([old,extra],axis=1))]:
        predicted = np.full_like(y,np.nan)
        for fold in range(5):
            test = folds == fold
            low, high = seconds[test].min(), seconds[test].max()
            train = (seconds < low-2) | (seconds > high+2)
            if not test.any() or train.sum() < 30:
                raise RuntimeError('Insufficient blocked held-out samples')
            predicted[test] = fit_predict(features[train],features[test],y[train])
            if label == 'old128':
                fold_sizes.append({'fold':fold,'test':int(test.sum()),'train':int(train.sum()),'testSeconds':[float(low),float(high)]})
        predictions[label] = predicted
    metrics = []
    for j,name in enumerate(data[0]['sensorNames']):
        variance = float(np.var(y[:,j]))
        metric = {'sensor':name,'actualStd':float(np.sqrt(variance)),'variable':variance>1e-10}
        for label,predicted in predictions.items():
            mse = float(np.mean((predicted[:,j]-y[:,j])**2))
            metric[label] = {'rmse':float(np.sqrt(mse)),'r2':1-mse/variance if variance>1e-10 else None}
        metrics.append(metric)
    report = {'passed':True,'format':'male-cns-offline-sensory-information-probe','schema':1,
              'sourceFiles':{str(f.relative_to(ROOT)):file_hash(f) for f in files},'probeSourceSha256':file_hash(__file__),
              'rawSamples':sum(len(d['rows']) for d in data),'uniqueActualSamples':len(rows),'folds':fold_sizes,
              'oldNeurons':128,'extendedNeurons':251,'additionalBiologicalNodes':0,'oldInputColumns':516,'extendedInputColumns':1008,
              'method':{'pcaComponents':24,'ridge':.01,'neuralScaleFloor':.02,'fitting':'training fold only','embargoSeconds':2,'holdout':'five contiguous simulation-time blocks across both rollouts; identical prefix rows deduplicated'},
              'metrics':metrics,'boundary':'Offline sensory reconstruction on two deterministic V3/Monza trajectories only, not action targets or controller training. Predictors are never installed or fed into the agents. R2 is not driving accuracy or causal evidence; negative R2 means worse than the pooled-target mean. Does not prove full observability, new-seed generalization, learning gains or completed laps.'}
    atomic_json(directory/'report.json',report)
    print('SENSORY_INFORMATION_PROBE '+json.dumps({'passed':True,'uniqueActualSamples':len(rows),'physical':metrics[11:],'folds':fold_sizes}),flush=True)


if __name__=='__main__':
    main()
