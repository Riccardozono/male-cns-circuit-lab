"""Protected full-trace identity, real-prefix continuation and CUDA gradients."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import json
import subprocess
from pathlib import Path
import numpy as np
import torch
from neuronal_experiment_io import ROOT,NODE,Pipe,atomic_json,file_hash
from statehead_reward_actor import StateheadActor


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped preflight required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False)
    env=None
    try:
        env=Pipe(ROOT/'work/statehead-reward-env.cjs');meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        print('STATEHEAD_PREFLIGHT '+json.dumps({'phase':'full-trace-verified','baseline':meta['baseline']}),flush=True)
        continuations=[]
        for mode in meta['prefixes']:
            a=env.request('evaluate',weights=meta['weights'],configuration={'resetMode':mode})
            b=env.request('evaluate',weights=meta['weights'],configuration={'resetMode':mode})
            assert a==b==meta['originalExpected'];continuations.append({'resetMode':mode,'result':a,'repeatIdentical':True})
        cfg=meta['defaultExploration'];cfg={**cfg,'weights':[.02*np.sin(j*1.3) for j in range(20)]}
        e=env.request('episode',configuration={'weights':meta['weights'],'exploration':cfg,'resetMode':'observed-8200','seed':90261026,'sign':1})
        atomic_json(out/'episode.private.json',e)
        assert not e['fullFromLine'] and e['start']['laps']==1 and abs(e['trainingReward']-(e['nativeRewardAfterReset']-e['extraSafetyCost'])/100)<1e-12
        assert abs(sum(r['rewardNative'] for r in e['rows'])-e['nativeRewardAfterReset'])<1e-8
        torch.set_num_threads(2);actor=StateheadActor(meta,[e],meta['weights'],cfg)
        score,initial_kl=actor.objective([1.]*e['controls']);assert abs(float(score.detach())-1)<1e-10 and abs(float(initial_kl.detach()))<1e-10
        value,_=actor.objective([1.]*e['controls'],clipped=False);(-value).backward()
        g=-np.concatenate([actor.motor.grad.detach().cpu().numpy(),actor.variance.grad.detach().cpu().numpy()])
        maximum_mean=float((actor.distribution()[0].detach()-actor.old_mean).abs().max())
        maximum_std=float((actor.distribution()[1].detach()-actor.old_std).abs().max());assert max(maximum_mean,maximum_std)<1e-12
        code=r"""
const fs=require('fs'),E=require('./work/statehead-reward-env.cjs'),X=require('./work/learned-neural-exploration.cjs');
const d=process.argv[1],m=JSON.parse(fs.readFileSync(d+'/metadata.private.json')),e=JSON.parse(fs.readFileSync(d+'/episode.private.json'));
function objective(index,delta){const w=m.weights.slice(),c=structuredClone(e.exploration);if(index<18)w[index]+=delta;else c.weights[index-18]+=delta;let prior=null,total=0,count=0;
 for(const r of e.rows){const mean=E.mean(r.features,w,m.motorGain),sigma=X.scale(r.features,c).sigma,d=X.conditional(mean,sigma,r.active?prior:null,c.rho);if(r.active){total+=X.logp(r.action,d.mean,d.std);count++;prior={mean,sigma,action:r.action};}else prior=null;}return total/count;}
process.stdout.write(JSON.stringify([0,1,8,16,17,18,19,36,37].map(index=>({index,numeric:(objective(index,1e-6)-objective(index,-1e-6))/2e-6}))));
"""
        checks=json.loads(subprocess.check_output([str(NODE),'-e',code,str(out)],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
        for r in checks:r.update({'analytic':float(g[r['index']]),'error':abs(float(g[r['index']])-r['numeric'])});assert r['error']<1e-5
        native=env.request('rescore',weights=meta['weights'],advantages=[1.]*e['controls'],configuration={'exploration':cfg});assert abs(native['meanGaussianKL'])<1e-12 and abs(native['meanClippedSurrogate']-1)<1e-12
        cuda=env.request('stats');assert cuda['gpuCalls']>0 and cuda['cpuFallbacks']==0
        report={'format':'private-statehead-reward-preflight-v1','passed':True,'learningSucceeded':False,'parentSha256':meta['parentSha256'],
                'fullBaseline':meta['baseline'],'continuations':continuations,'stochasticContinuation':{k:e[k] for k in ['controls','result','start','newLaps','progressAfterReset','trainingReward','nativeRewardAfterReset','extraSafetyCost','fullFromLine']},
                'maximumNativeMeanError':maximum_mean,'maximumNativeStdError':maximum_std,'nativeFiniteDifferences':checks,'cuda':cuda,
                'device':str(actor.motor.device),'gpuName':torch.cuda.get_device_name(0),'sourceSha256':file_hash(Path(__file__)),
                'actorSourceSha256':file_hash(ROOT/'work/statehead_reward_actor.py'),'episodeSha256':file_hash(out/'episode.private.json'),
                'sourceHashes':meta['sourceHashes'],'boundary':'Original protected full8495-control trace reproduced, own real-prefix restarts identical, rewards after reset only.38 trainable head/variance coefficients with true pre-tanh Gaussian likelihood. Numerical likelihood proof, not learned two laps or an ordinary app save.'}
        atomic_json(out/'report.json',report);(out/'verifier-at-run.py').write_bytes(Path(__file__).read_bytes());print('STATEHEAD_PREFLIGHT_FINISHED '+json.dumps(report),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);a=p.parse_args();run(a.tag)
