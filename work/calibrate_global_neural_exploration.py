"""Full-course stochastic exploration; no frozen prefix or action targets."""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['OMP_NUM_THREADS'] = '2'
import json
import subprocess
import time
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash

out = ROOT/'.impeccable/review/learning-ml/v3-global-exploration-calibration-20261024-01'
out.mkdir(exist_ok=False)
files = ['work/calibrate_global_neural_exploration.py','work/recurrent-v3-global-env.cjs','work/neuronal_experiment_io.py',
         'outputs/progress-save.js','package.json',
         '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/report.json',
         '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/zero-only.private.json']
closure = "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
hashes = json.loads(subprocess.check_output([str(NODE),'-e',closure],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
save = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
save_hash = file_hash(save)
assert save_hash == '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
started=time.monotonic()
env=None
try:
    env=Pipe(ROOT/'work/recurrent-v3-global-env.cjs')
    meta=env.metadata
    assert meta['globalPolicy'] and meta['rewardRevision']=='progress-3-local-continuity-private-20261024'
    assert len(meta['genome']['policyWeights'])==202
    atomic_json(out/'metadata.private.json',meta)
    baselines=[]
    for heading in [0,-.0025,.0025]:
        config={'maxTicks':0,'headingOffsetRad':heading}
        baseline=env.request('evaluate',weights=meta['genome']['policyWeights'],configuration=config)
        zero=env.request('episode',configuration={**config,'std':[0,0],'chunkSize':32})
        assert zero['result']==baseline
        if heading==0:
            assert baseline=={k:meta['expected'][k] for k in baseline}
        baselines.append({'headingOffsetRad':heading,'outcome':baseline,'zeroNoiseIdentical':True})
        env.request('clear')
    print('GLOBAL_BASELINE '+json.dumps(baselines),flush=True)
    trials=[]
    for name,std in [('small',[.0015,.04]),('medium',[.003,.08]),('broad',[.006,.14])]:
        exploration={'format':'global-constant-ar1-v1','direction':[0.]*65,'threshold':0,'rho':.9,'floor':std,'ceiling':std}
        records=[]
        for lane,heading in enumerate([0,.0025]):
            seed=20261024+lane*104729
            for sign in [1,-1]:
                episode=env.request('episode',configuration={'weights':meta['genome']['policyWeights'],'seed':seed,'sign':sign,
                    'headingOffsetRad':heading,'exploration':exploration,'std':std,'safetyCost':2000,'chunkSize':32,'maxTicks':0})
                rows=[r for c in episode['chunks'] for r in c['rows']]
                assert not episode['result']['censored'] and all(r['sigma']==std and r['noiseGate']==0 for r in rows)
                active=[r for r in rows if r['active']]
                assert any(r['action']!=r['mean'] for r in active[:10])
                assert all(not(r['commands'][1]>0 and r['commands'][2]>0) for r in active)
                atomic_json(out/f'{name}-lane{lane}-sign{sign}.private.json',episode)
                records.append({k:episode[k] for k in ['seed','sign','headingOffsetRad','result','controls','trainingReward','actionTraceSha256']})
                print('GLOBAL_EXPLORATION_CASE '+json.dumps({'level':name,**records[-1],'wallSeconds':time.monotonic()-started}),flush=True)
                env.request('clear')
        progress=[r['result']['bestProgress'] for r in records]
        trial={'name':name,'std':std,'exploration':exploration,'episodes':records,'safeCount':sum(r['result']['safe'] for r in records),
               'medianProgress':float(np.median(progress)),'minimumProgress':min(progress),'meanProgress':float(np.mean(progress))}
        trials.append(trial)
    eligible=[t for t in trials if t['safeCount'] and t['medianProgress']>=.7*baselines[0]['outcome']['bestProgress']]
    selected=max(eligible,key=lambda t:t['medianProgress']) if eligible else None
    report={'format':'private-global-neural-exploration-calibration-v1','passed':True,'learningSucceeded':False,'created':None,
            'baselines':baselines,'trials':trials,'selected':selected,'parentSha256':meta['parentSha256'],'sourceHashes':hashes,
            'originalSaveSha256':save_hash,'wallSeconds':time.monotonic()-started,
            'boundary':'Actual native from-line episodes with explicit corrected geometry revision. Constant nonzero AR1 variance across the complete episode, no route/clock/context gate. This calibrates sampling, not trained deterministic improvement. Largest median physical progress among levels with at least one safe episode and median>=70percent of native canonical baseline; no held-out scenario evaluated.'}
    import datetime
    report['created']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    assert file_hash(save)==save_hash and all(file_hash(ROOT/f)==digest for f,digest in hashes.items())
    atomic_json(out/'report.json',report)
    if selected:
        atomic_json(out/'selected-exploration.private.json',selected['exploration'])
    print('GLOBAL_EXPLORATION_RESULT '+json.dumps({'passed':True,'selected':selected['name'] if selected else None,
        'trials':[{k:t[k] for k in ['name','std','safeCount','medianProgress','minimumProgress','meanProgress']} for t in trials],
        'report':str(out/'report.json'),'sha256':file_hash(out/'report.json')}),flush=True)
except BaseException as error:
    atomic_json(out/'failure.json',{'error':repr(error),'boundary':'Failed preflight is not completed training.'})
    raise
finally:
    if env:
        env.close()
