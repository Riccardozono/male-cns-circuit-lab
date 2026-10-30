"""Check the cache against native finite differences and the real GPU graph."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import json
import subprocess
import time
from pathlib import Path
import numpy as np
import torch
from neuronal_experiment_io import ROOT,NODE,atomic_json,file_hash
from recurrent_v3_learned_variance_gradient import gradient
from cached_neural_actor import CachedActor


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped diagnostic required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False)
    source=out.parent/'v3-learned-variance-preflight-20261024-02'
    meta=json.loads((source/'metadata.private.json').read_text());episode=json.loads((source/'episode.private.json').read_text())
    selected=[episode['chunks'][0],episode['chunks'][-3],episode['chunks'][-1]];mini={**episode,'chunks':selected}
    n=sum(len(c['rows']) for c in selected);config=episode['exploration'];torch.set_num_threads(2)
    started=time.perf_counter();reference,metrics=gradient(meta,[mini],[1.]*n,config,device='cuda:0',estimate_fisher=False)
    torch.cuda.synchronize();reference_seconds=time.perf_counter()-started
    actor=CachedActor(meta,[mini],config,boundary='recorded-chunk')
    value,kl=actor.objective([1.]*n,clipped=False)
    (-value).backward();actual=-np.concatenate([actor.motor.grad.detach().cpu().numpy(),actor.variance.grad.detach().cpu().numpy()])
    expected=np.concatenate([reference[72:202],reference[202:]])
    error=float(np.max(np.abs(actual-expected)));assert error < 1e-9
    maximum_mean=float((actor.distribution()[0].detach()-actor.old_mean).abs().max())
    assert maximum_mean<1e-12 and abs(float(kl.detach()))<1e-12
    timings=[]
    for _ in range(12):
        actor.motor.grad=None;actor.variance.grad=None;torch.cuda.synchronize();started=time.perf_counter()
        loss,_=actor.objective([1.]*n,clipped=False);(-loss).backward();torch.cuda.synchronize();timings.append(time.perf_counter()-started)
    code=r"""
const fs=require('fs'),X=require('./work/learned-neural-exploration.cjs');const dir=process.argv[1],m=JSON.parse(fs.readFileSync(dir+'/metadata.private.json')),e=JSON.parse(fs.readFileSync(dir+'/episode.private.json')),
 chunks=[e.chunks[0],e.chunks.at(-3),e.chunks.at(-1)],count=chunks.reduce((s,c)=>s+c.rows.length,0);
function objective(index,delta){const w=m.genome.policyWeights.slice(72),config=structuredClone(e.exploration);if(index<130)w[index]+=delta;else config.weights[index-130]+=delta;let total=0;
 for(const chunk of chunks){let previous=chunk.previousPolicyState;for(const r of chunk.rows){const mean=w.slice(-2);for(let j=0;j<64;j++)for(let a=0;a<2;a++)mean[a]+=r.features[j]*w[2*j+a]/8;
 const sigma=X.scale(r.features,config).sigma,d=X.conditional(mean,sigma,previous,config.rho);if(r.active)total+=X.logp(r.action,d.mean,d.std);previous={mean,sigma,action:r.action};}}
 return total/count;}
process.stdout.write(JSON.stringify([0,1,128,129,130,131,258,259].map(index=>({index,numeric:(objective(index,1e-6)-objective(index,-1e-6))/2e-6}))));
"""
    checks=json.loads(subprocess.check_output([str(NODE),'-e',code,str(source)],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    for row in checks:
        row['analytic']=float(actual[row['index']]);row['error']=abs(row['numeric']-row['analytic']);assert row['error']<1e-5
    full=CachedActor(meta,[episode],config,boundary='full-episode');value,full_kl=full.objective([1.]*episode['controls'])
    assert abs(float(full_kl.detach()))<1e-12 and abs(float(value.detach())-1)<1e-12
    rejected=False
    try:CachedActor({**meta,'genome':{**meta['genome'],'policyWeights':[meta['genome']['policyWeights'][0]+.001]+meta['genome']['policyWeights'][1:]}},[mini],config)
    except ValueError:rejected=True
    assert rejected
    report={'passed':True,'learningSucceeded':False,'actualCapturedControls':n,'fullEpisodeControls':episode['controls'],
            'gpuName':torch.cuda.get_device_name(0),'maximumNativeConditionalMeanError':maximum_mean,'referenceGradientMaxError':error,
            'nativeFiniteDifferences':checks,'changedEncoderRejected':rejected,'fullEpisodeInitialKL':float(full_kl.detach()),
            'microbenchmark':{'referenceFirstCallSeconds':reference_seconds,'cachedMedianSeconds':float(np.median(timings)),
                              'boundary':'First recurrent graph call versus warm cached actor calls on82records. Setup/warmup differ; not an app speedup or learning-speed claim.'},
            'sourceSha256':file_hash(Path(__file__)),'actorSourceSha256':file_hash(ROOT/'work/cached_neural_actor.py'),
            'episodeSha256':file_hash(source/'episode.private.json'),
            'boundary':'Only130 motor plus130 variance coefficients can change; first72 encoder/gain coefficients frozen exactly. Native graph remains active in new body episodes. Recorded-chunk reference derivative and full-episode on-policy KL checked; not a learned lap.'}
    atomic_json(out/'report.json',report);(out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes());print(json.dumps(report),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);args=parser.parse_args();run(args.tag)
