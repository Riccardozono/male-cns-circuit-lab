"""Real sampled transitions, conditional likelihoods, and gradient regression."""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['OMP_NUM_THREADS'] = '2'
import argparse
import copy
import json
from pathlib import Path
import numpy as np
import torch
from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash
from neural_feedback_ar1 import Actor, conditional, conditional_kl, compute_gae


def run(tag):
    if not tag.replace('-', '').isalnum():
        raise ValueError('Scoped AR1 verification required')
    torch.set_num_threads(2); torch.manual_seed(97261025)
    out = ROOT / '.impeccable/review/learning-ml' / tag; out.mkdir(exist_ok=False)
    env = None
    try:
        env = Pipe(ROOT/'work/neural-feedback-world-v2.cjs', initialization={'configuration': {'horizonControls': 80}})
        meta = env.metadata; atomic_json(out/'metadata.private.json', meta)
        actor = Actor().double().to('cuda:0')
        # Nonzero final weights exercise gradients of BOTH hidden neural means.
        with torch.no_grad():
            actor.layers[-1].weight.normal_(0., .0003)
        tensor = lambda x: torch.tensor(x, dtype=torch.float64, device='cuda:0')
        rows = []; paired = []
        for cfg in [{'mode': 'cold-training', 'headingKickRad': 0.},
                    {'mode': 'local', 'snapshotIndex': 31, 'headingKickRad': 0.}]:
            obs = env.request('reset', configuration=cfg)['observation']; prev_obs=obs; prev_z=[0., 0.]; continuing=0.
            for step in range(64):
                with torch.no_grad():
                    d = conditional(actor, tensor([obs]), tensor([prev_obs]), tensor([prev_z]), tensor([continuing]))
                    z=d.sample()[0]; logp=float(d.log_prob(z).sum()); mu=actor.layers(tensor([obs]))[0].cpu().numpy()
                    prev_mu=actor.layers(tensor([prev_obs]))[0].cpu().numpy(); sd=actor.log_std.exp().cpu().numpy()
                rho=np.asarray([0., .95])*continuing; center=mu+rho*(np.asarray(prev_z)-prev_mu); scale=sd*np.sqrt(1-rho*rho)
                actual=z.cpu().tolist(); expected=float(np.sum(-.5*((np.asarray(actual)-center)/scale)**2-np.log(scale)-.5*np.log(2*np.pi)))
                paired.append(abs(logp-expected)); rows.append((obs,prev_obs,prev_z,continuing,actual,logp))
                state=env.request('step', action=torch.tanh(z).cpu().tolist())
                prev_obs=obs;prev_z=actual;continuing=1.;obs=state['observation']
                if state['terminated'] or state['truncated']:break
        x=tensor([r[0] for r in rows]); px=tensor([r[1] for r in rows]); pz=tensor([r[2] for r in rows]); mask=tensor([r[3] for r in rows]); z=tensor([r[4] for r in rows])
        oldlog=tensor([r[5] for r in rows]); advantages=torch.linspace(-.9,1.1,len(rows),dtype=torch.float64,device='cuda:0')
        def objective():return -(((conditional(actor,x,px,pz,mask).log_prob(z).sum(-1)-oldlog).exp())*advantages).mean()
        loss=objective();loss.backward(); derivatives=[]
        for name,index in [('layers.0.weight',(0,0)),('layers.2.weight',(2,3)),('layers.4.weight',(0,5)),('layers.4.weight',(1,7)),('layers.4.bias',(1,)),('log_std',(1,))]:
            p=dict(actor.named_parameters())[name]; analytic=float(p.grad[index]); old=float(p.detach()[index]); epsilon=1e-6
            with torch.no_grad():p[index]=old+epsilon; plus=float(objective());p[index]=old-epsilon;minus=float(objective());p[index]=old
            numeric=(plus-minus)/(2*epsilon); error=abs(numeric-analytic);assert error<2e-6
            derivatives.append({'parameter':name,'index':index,'analytic':analytic,'finiteDifference':numeric,'absoluteError':error})
        with torch.no_grad():
            dist=conditional(actor,x,px,pz,mask); original_center=dist.loc.clone(); original_std=dist.scale.clone()
            assert float(conditional_kl(original_center,original_std,dist).abs().max())<1e-12
            # Episode boundary erases all latent history, including huge values.
            zeros=torch.zeros_like(mask); a=conditional(actor,x,px,pz,zeros); b=conditional(actor,x,px*13,pz+999,zeros)
            assert torch.equal(a.loc,b.loc) and torch.equal(a.scale,b.scale)
            changed=copy.deepcopy(actor);changed.layers[-1].bias[1]+=.003
            assert float(conditional_kl(original_center,original_std,conditional(changed,x,px,pz,mask)).mean())>0
        cpu=copy.deepcopy(actor).cpu(); cpu.zero_grad();cpu_loss=-((conditional(cpu,x.cpu(),px.cpu(),pz.cpu(),mask.cpu()).log_prob(z.cpu()).sum(-1)-oldlog.cpu()).exp()*advantages.cpu()).mean();cpu_loss.backward()
        gradient_error=max(float((p.grad.cpu()-q.grad).abs().max()) for p,q in zip(actor.parameters(),cpu.parameters()))
        assert gradient_error<1e-7 and max(paired)<1e-10
        a,r=compute_gae([.5,.5],[0,0],[10,10],[False,True],[True,False],gamma=.9,lam=1.)
        assert np.allclose(r,[9.5,.5])
        torch.save({'actor':{k:v.cpu() for k,v in actor.state_dict().items()},'observations':x.cpu(),'previousObservations':px.cpu(),
                    'previousActions':pz.cpu(),'continuation':mask.cpu(),'actions':z.cpu(),'oldLogProb':oldlog.cpu()},out/'real-transitions.private.pt')
        files=['work/neural_feedback_ar1.py','work/neural_feedback_ppo.py','work/neuronal_experiment_io.py','work/verify_neural_feedback_ar1.py']
        report={'format':'private-neural-feedback-ar1-proof-v1','passed':True,'learningSucceeded':False,'actualTransitions':len(rows),
                'numpyLikelihoodMaxError':max(paired),'finiteDifferences':derivatives,'cpuCudaGradientMaxError':gradient_error,
                'episodeResetClearsNoise':True,'bootstrapAndTerminationSeparated':True,'parentSha256':meta['parentSha256'],
                'worldSourceHashes':meta['sourceHashes'],'pythonSourceHashes':{f:file_hash(ROOT/f) for f in files},'cuda':env.request('stats'),
                'boundary':'128 or fewer real transitions validate likelihoods/derivatives and reset boundaries, not improved driving. Finite-difference advantage vector is a numerical test only, never training rewards.'}
        atomic_json(out/'report.json',report);print('AR1_PROOF '+json.dumps({k:v for k,v in report.items() if k not in ['worldSourceHashes','pythonSourceHashes','cuda']}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);run(parser.parse_args().tag)
