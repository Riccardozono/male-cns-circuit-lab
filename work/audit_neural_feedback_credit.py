"""Attribute the first real gradient to cold versus moving reset episodes."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import copy
import json
from pathlib import Path
import torch
from neural_feedback_ar1 import Actor,conditional
from neuronal_experiment_io import ROOT,atomic_json,file_hash


def main():
    torch.set_num_threads(2)
    run=ROOT/'.impeccable/review/learning-ml/neural-feedback-ar1-ppo32-20261025-01'
    out=run.parent/'neural-feedback-gradient-credit-20261025-01';out.mkdir(exist_ok=False)
    saved=torch.load(run/'actual-rollout.private.pt',map_location='cpu',weights_only=True);batch=saved['batch']
    episodes=[e for e in json.loads((run/'local-episodes.private.json').read_text()) if e['update']==1]
    probe_file=run.parent/'neural-feedback-ar1-preflight-20261025-01/real-transitions.private.pt'
    probe=torch.load(probe_file,map_location='cpu',weights_only=True)['observations'][:1].double()
    actor=Actor().double();actor.load_state_dict(saved['actor']);parameters=list(actor.parameters())
    t=lambda v:torch.tensor(v,dtype=torch.float64)
    x=t(batch['obs']);px=t(batch['prevObs']);pz=t(batch['prevActions']);mask=t(batch['continuation']);z=t(batch['actions']);oldlog=t(batch['logp']);adv=saved['advantages'].double()
    groups={'cold':[],'local':[],'unfinished':[]};start=0
    for episode in episodes:
        end=start+episode['controls'];group='cold' if episode['reset']['mode']=='cold-training' else 'local'
        groups[group].extend(range(start,end));assert batch['terminated'][end-1] or batch['truncated'][end-1];start=end
    groups['unfinished']=list(range(start,len(x)))
    def flatten_grad(value):
        gs=torch.autograd.grad(value,parameters,allow_unused=True)
        return torch.cat([(g if g is not None else torch.zeros_like(p)).flatten() for g,p in zip(gs,parameters)])
    sensitivity=flatten_grad(actor.layers(probe)[0,1]);results=[];gradients={}
    for name,ids in [('all',list(range(len(x)))),*groups.items()]:
        ids=torch.tensor(ids,dtype=torch.int64)
        dist=conditional(actor,x[ids],px[ids],pz[ids],mask[ids]);ratio=(dist.log_prob(z[ids]).sum(-1)-oldlog[ids]).exp()
        objective=(ratio*adv[ids]).sum()/len(x);gradient=flatten_grad(objective);gradients[name]=gradient
        predicted=float(torch.dot(sensitivity,gradient))
        clone=copy.deepcopy(actor);offset=0;epsilon=1e-6
        with torch.no_grad():
            for p in clone.parameters():
                size=p.numel();p.add_(epsilon*gradient[offset:offset+size].reshape_as(p));offset+=size
            actual=float((clone.layers(probe)[0,1]-actor.layers(probe)[0,1])/epsilon)
        assert abs(actual-predicted)<1e-6
        # Actual first full-batch Adam step is a diagnostic, not the trainer's
        # shuffled minibatch sequence, and not a driving result.
        clone=copy.deepcopy(actor);optimizer=torch.optim.Adam(clone.parameters(),lr=3e-5)
        dist=conditional(clone,x[ids],px[ids],pz[ids],mask[ids]);loss=-(((dist.log_prob(z[ids]).sum(-1)-oldlog[ids]).exp())*adv[ids]).sum()/len(x)
        optimizer.zero_grad();loss.backward();torch.nn.utils.clip_grad_norm_(clone.parameters(),.5);optimizer.step()
        with torch.no_grad():adam_delta=float(clone.layers(probe)[0,1]-actor.layers(probe)[0,1])
        results.append({'group':name,'actualControls':len(ids),'directionalColdPedalDerivative':predicted,'finiteDifference':actual,'diagnosticAdamColdPedalChange':adam_delta})
    decomposition=float((gradients['all']-sum(gradients[name] for name in groups)).abs().max());assert decomposition<1e-10
    report={'format':'private-neural-feedback-gradient-credit-audit-v1','passed':True,'learningSucceeded':False,'results':results,
            'gradientDecompositionMaxError':decomposition,'sourceSha256':file_hash(Path(__file__)),
            'actualRolloutSha256':file_hash(run/'actual-rollout.private.pt'),'episodeLogSha256':file_hash(run/'local-episodes.private.json'),
            'probeSha256':file_hash(probe_file),'boundary':'First actual training rollout only. SGD directional derivatives and a full-batch Adam diagnostic explain update interference; they are not the actual shuffled optimizer path, a causal attribution of all32updates, or proof of a better driver. Probe is the physically observed initial neuronal state, not a desired action.'}
    atomic_json(out/'report.json',report);print(json.dumps(report),flush=True)


if __name__=='__main__':main()
