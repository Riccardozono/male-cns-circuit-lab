"""Actual CUDA world, compact feature locality and conditional-gradient checks."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import copy
import json
from pathlib import Path
import numpy as np
import torch
from neural_feedback_kernel import KernelActor,fit_basis
from neural_feedback_ar1 import conditional
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped local policy proof required')
    torch.set_num_threads(2);torch.manual_seed(99261025)
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        env=Pipe(ROOT/'work/neural-feedback-kernel-world.cjs',initialization={'configuration':{'horizonControls':80}});meta=env.metadata
        atomic_json(out/'metadata.private.json',meta);basis=fit_basis(meta['neuralBasisSamples']);atomic_json(out/'basis.private.json',basis)
        actor=KernelActor(basis).double().to('cuda:0');t=lambda v:torch.tensor(v,dtype=torch.float64,device='cuda:0')
        samples=t(meta['neuralBasisSamples'])
        with torch.no_grad():
            features=actor.layers[0](samples);active=(features>0).sum(1)
            assert active.min()>0 and torch.count_nonzero(actor.deterministic(samples))==0
            r=torch.sqrt(((samples[:,None,:]-actor.layers[0].centers[None,:,:])**2).mean(2))/actor.layers[0].radii
            expected=(1-r).clamp_min(0).pow(4)*(4*r+1);expected/=expected.sum(1,keepdim=True).clamp_min(1)
            feature_error=float((features-expected).abs().max());assert feature_error<2e-6
        checks=[env.request('check-continuation',configuration={'snapshotIndex':j,'steps':20}) for j in [0,16,34]]
        assert all(c['preserveActualContext']['bodyAndBrainExact'] and c['preserveActualContext']['rewardsExact'] for c in checks)
        rows=[]
        with torch.no_grad():actor.layers[-1].weight.normal_(0,.0003)
        for configuration in [{'mode':'cold-training','headingKickRad':0.},{'mode':'local','snapshotIndex':33,'headingKickRad':0.}]:
            obs=env.request('reset',configuration=configuration)['observation'];px=obs;pz=[0.,0.];mask=0.
            for _ in range(40):
                with torch.no_grad():d=conditional(actor,t([obs]),t([px]),t([pz]),t([mask]));z=d.sample()[0]
                rows.append((obs,px,pz,mask,z.cpu().tolist()))
                state=env.request('step',action=torch.tanh(z).cpu().tolist());px=obs;pz=z.cpu().tolist();mask=1.;obs=state['observation']
                if state['terminated'] or state['truncated']:break
        x=t([r[0] for r in rows]);px=t([r[1] for r in rows]);pz=t([r[2] for r in rows]);mask=t([r[3] for r in rows]);z=t([r[4] for r in rows])
        with torch.no_grad():oldlog=conditional(actor,x,px,pz,mask).log_prob(z).sum(-1).detach()
        advantage=torch.linspace(-1,1,len(rows),dtype=torch.float64,device='cuda:0')
        def loss():return -((conditional(actor,x,px,pz,mask).log_prob(z).sum(-1)-oldlog).exp()*advantage).mean()
        loss().backward();finites=[]
        with torch.no_grad():strong=actor.layers[0](x).sum(0).argsort(descending=True)[:3].cpu().tolist()
        for axis,j in [(0,strong[0]),(1,strong[0]),(1,strong[1])]:
            p=actor.layers[-1].weight;old=float(p.detach()[axis,j]);analytic=float(p.grad[axis,j]);epsilon=1e-6
            with torch.no_grad():p[axis,j]=old+epsilon;plus=float(loss());p[axis,j]=old-epsilon;minus=float(loss());p[axis,j]=old
            numeric=(plus-minus)/(2*epsilon);assert abs(numeric-analytic)<2e-6
            finites.append({'axis':axis,'kernel':j,'analytic':analytic,'numeric':numeric,'absoluteError':abs(numeric-analytic)})
        with torch.no_grad():
            original=actor.layers(x).clone();actor.layers[-1].weight[0,strong[0]]+=.01;modified=actor.layers(x)
            unaffected=actor.layers[0](x)[:,strong[0]]==0
            assert unaffected.any() and torch.equal(original[unaffected],modified[unaffected])
        report={'format':'private-neural-feedback-local-kernel-proof-v1','passed':True,'learningSucceeded':False,'actualTransitions':len(rows),
                'basisSamples':len(samples),'kernelCount':basis['centerCount'],'actorTrainableParameters':sum(p.numel() for p in actor.parameters()),
                'minimumActiveFeatures':int(active.min()),'medianActiveFeatures':float(active.double().median()),'maximumActiveFeatures':int(active.max()),
                'featureMaxError':feature_error,'finiteDifferences':finites,'observedRowsExactlyUnaffectedByOneKernelUpdate':int(unaffected.sum()),
                'continuationChecks':checks,'parentSha256':meta['parentSha256'],'worldSourceHashes':meta['sourceHashes'],
                'pythonSourceHashes':{f:file_hash(ROOT/f) for f in ['work/neural_feedback_kernel.py','work/verify_neural_feedback_kernel.py','work/neural_feedback_ar1.py','work/neural_feedback_ppo.py']},
                'basisSha256':file_hash(out/'basis.private.json'),'cuda':env.request('stats'),
                'boundary':'Actual neuronal prototype selection is unsupervised and has no desired action/route/time labels. Local zero support gives exact noninterference on checked neural vectors, not a guarantee that physical trajectories or other basis updates remain unchanged. Zero weights preserve verified parent; no newly learned two laps.'}
        assert report['cuda']['gpuCalls']>0 and report['cuda']['cpuFallbacks']==0
        atomic_json(out/'report.json',report);print('LOCAL_KERNEL_PROOF '+json.dumps({k:v for k,v in report.items() if k not in ['pythonSourceHashes','worldSourceHashes','cuda','continuationChecks']}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);run(p.parse_args().tag)
