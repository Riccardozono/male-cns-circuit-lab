"""PPO feedback readout on genuine MaleCNS neuronal observations.

The frozen neuronal parent remains in every physical step. This model learns an
unrestricted motor residual; observations never contain pose, route, lap or time.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import copy
import json
import subprocess
import time
from pathlib import Path
import numpy as np
import torch
from torch import nn
from neuronal_experiment_io import ROOT,NODE,Pipe,atomic_json,file_hash


class Actor(nn.Module):
    def __init__(self):
        super().__init__();self.layers=nn.Sequential(nn.Linear(518,128),nn.Tanh(),nn.Linear(128,64),nn.Tanh(),nn.Linear(64,2))
        self.log_std=nn.Parameter(torch.tensor(np.log([.015,.06]),dtype=torch.float32))
        for layer in self.layers:
            if isinstance(layer,nn.Linear):nn.init.orthogonal_(layer.weight,2**.5);nn.init.zeros_(layer.bias)
        nn.init.zeros_(self.layers[-1].weight)
    def distribution(self,obs):return torch.distributions.Normal(self.layers(obs),self.log_std.clamp(-6,-.5).exp())
    def deterministic(self,obs):return torch.tanh(self.layers(obs))


class Critic(nn.Module):
    def __init__(self):
        super().__init__();self.layers=nn.Sequential(nn.Linear(518,128),nn.Tanh(),nn.Linear(128,64),nn.Tanh(),nn.Linear(64,1))
        for layer in self.layers:
            if isinstance(layer,nn.Linear):nn.init.orthogonal_(layer.weight,1.);nn.init.zeros_(layer.bias)
    def forward(self,obs):return self.layers(obs).squeeze(-1)


def compute_gae(rewards,values,next_values,terminated,truncated,gamma=.99,lam=.95):
    advantages=np.zeros(len(rewards),dtype=np.float32);carry=0.
    for j in reversed(range(len(rewards))):
        delta=rewards[j]+gamma*next_values[j]*(not terminated[j])-values[j]
        carry=delta+gamma*lam*carry*(not(terminated[j] or truncated[j]));advantages[j]=carry
    return advantages,advantages+np.asarray(values,dtype=np.float32)


def result_rank(r):return r['laps'],r['progress']
def safe(r):return r['reason'] not in ['urto','fuori pista','progresso non valido']


def run(tag,updates,rollout_steps=512,device='cuda:0',resume=None):
    if not tag.replace('-','').isalnum() or not 1<=updates<=256 or rollout_steps not in [256,512,1024,2048]:raise ValueError('Scoped bounded feedback study required')
    torch.set_num_threads(2);torch.set_float32_matmul_precision('highest');torch.manual_seed(94261025)
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);prefile=out.parent/'neural-feedback-world-preflight-20261025-01/report.json'
    pre=json.loads(prefile.read_text());assert pre['passed']
    files=['work/neural_feedback_ppo.py','work/neuronal_experiment_io.py','work/neural-feedback-world.cjs','work/neural-feedback-live.cjs',
           'work/verify_neural_feedback_world.py','package.json','outputs/progress-save.js',str(prefile.relative_to(ROOT)),
           '.impeccable/review/learning-ml/statehead-reward-native-proof-20261025-01/report.json',
           '.impeccable/review/learning-ml/statehead-reward-native-proof-20261025-01/candidate.malecns-statehead.json']
    code="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',code],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    assert all(file_hash(ROOT/f)==h for f,h in pre['sourceHashes'].items())
    settings={'device':device,'rolloutSteps':rollout_steps,'localHorizonControls':200,'gamma':.99,'gaeLambda':.95,'epochs':4,'minibatch':256,
              'actorLearningRate':3e-4,'criticLearningRate':1e-3,'clipRatio':.2,'targetKL':.02,'entropyCoefficient':.001,
              'coldTrainingResetProbability':.1,'validationSnapshotIndices':[2,10,18,26],'architecture':[518,128,64,2],
              'initialResidualStd':[.015,.06],'maximumFullEvaluationSimulatedTicks':None,'evaluationEveryUpdates':8}
    env=None;events=[];start_index=0;started=time.monotonic();rng=np.random.default_rng(94261025);recent_episodes=[]
    actor=Actor().to(device);critic=Critic().to(device);actor_optimizer=torch.optim.Adam(actor.parameters(),lr=3e-4);critic_optimizer=torch.optim.Adam(critic.parameters(),lr=1e-3)
    best_state=copy.deepcopy(actor.state_dict());best_result=None
    def tensor(x):return torch.tensor(x,dtype=torch.float32,device=device)
    def progress(phase,**extra):
        v={'phase':phase,'environmentPid':env.process.pid if env else None,'completedUpdates':len(events),'wallSeconds':time.monotonic()-started,**extra}
        atomic_json(out/'progress.json',v);print('NEURAL_FEEDBACK_PPO '+json.dumps(v),flush=True)
    try:
        env=Pipe(ROOT/'work/neural-feedback-world.cjs',initialization={'configuration':{'horizonControls':200,'seed':94261025}});meta=env.metadata
        assert meta['parentSha256']==pre['parentSha256'] and meta['sourceHashes']==pre['sourceHashes']
        atomic_json(out/'metadata.private.json',meta)
        training_indices=[j for j in range(len(meta['snapshots'])) if j not in settings['validationSnapshotIndices']]
        def reset_training():
            if rng.random()<.1:return env.request('reset',configuration={'mode':'cold-training','headingKickRad':float(rng.uniform(-.01,.01))})['observation']
            return env.request('reset',configuration={'mode':'local','snapshotIndex':int(rng.choice(training_indices)),'headingKickRad':float(rng.uniform(-.01,.01))})['observation']
        def evaluate(model,mode='from-line',index=None,kick=0.):
            cfg={'mode':mode,'headingKickRad':kick}
            if index is not None:cfg['snapshotIndex']=index
            state=env.request('reset',configuration=cfg);obs=state['observation'];controls=0;reward=0.
            while True:
                with torch.no_grad():action=model.deterministic(tensor([obs]))[0].cpu().tolist()
                state=env.request('step',action=action);controls+=1;reward+=state['reward'];obs=state['observation']
                if controls%2048==0:progress('evaluation-running',controls=controls,info=state['info'])
                if state['terminated'] or state['truncated']:break
            return {**state['info'],'controls':controls,'reward':reward,'terminated':state['terminated'],'truncated':state['truncated']}
        baseline={'progress':meta['baseline']['bestProgress'],'laps':meta['baseline']['laps'],'reason':meta['baseline']['reason'],'terminated':True,'truncated':False}
        best_result=baseline.copy()
        if resume:
            f=Path(resume).resolve();assert f.is_relative_to(ROOT);descriptor=json.loads(f.read_text())
            if descriptor['format']!='private-neural-feedback-ppo-checkpoint-v1' or descriptor['settings']!=settings or descriptor['sourceHashes']!=hashes or descriptor['parentSha256']!=meta['parentSha256']:raise ValueError('No silent feedback model or parent migration')
            pt=f.parent/descriptor['tensorFile'];assert file_hash(pt)==descriptor['tensorSha256']
            saved=torch.load(pt,map_location=device,weights_only=True);actor.load_state_dict(saved['actor']);critic.load_state_dict(saved['critic']);actor_optimizer.load_state_dict(saved['actorOptimizer']);critic_optimizer.load_state_dict(saved['criticOptimizer'])
            best_state=saved['bestActor'];best_result=descriptor['bestResult'];rng.bit_generator.state=descriptor['numpyRng'];torch.set_rng_state(saved['torchCpuRng'].cpu())
            if device.startswith('cuda'):torch.cuda.set_rng_state(saved['torchCudaRng'].cpu())
            start_index=descriptor['nextUpdate']
        else:
            with torch.no_grad():assert torch.count_nonzero(actor.deterministic(tensor([meta['normalization']['mean']]))).item()==0
        for f in files:
            if f.startswith('work/'):(out/Path(f).name).write_bytes((ROOT/f).read_bytes())
        progress('baseline-verified',baseline=baseline,neurons=meta['neurons'],readoutArchitecture=settings['architecture'])
        obs=reset_training();episode_reward=0.;episode_controls=0
        for index in range(start_index,start_index+updates):
            batch={k:[] for k in ['obs','actions','logp','values','rewards','nextValues','terminated','truncated']}
            for j in range(rollout_steps):
                with torch.no_grad():
                    x=tensor([obs]);distribution=actor.distribution(x);z=distribution.sample();logp=distribution.log_prob(z).sum(-1);value=critic(x)
                state=env.request('step',action=torch.tanh(z)[0].cpu().tolist());new_obs=state['observation']
                with torch.no_grad():next_value=float(critic(tensor([new_obs]))[0]) if not state['terminated'] else 0.
                for key,val in [('obs',obs),('actions',z[0].cpu().tolist()),('logp',float(logp[0])),('values',float(value[0])),('rewards',state['reward']),
                                ('nextValues',next_value),('terminated',state['terminated']),('truncated',state['truncated'])]:batch[key].append(val)
                episode_reward+=state['reward'];episode_controls+=1;obs=new_obs
                if state['terminated'] or state['truncated']:
                    recent_episodes.append({'update':index+1,'controls':episode_controls,'reward':episode_reward,**state['info'],'terminated':state['terminated'],'truncated':state['truncated']})
                    episode_reward=0.;episode_controls=0;obs=reset_training()
                if (j+1)%128==0:progress('physical-rollout',update=index+1,controls=j+1,episodes=len(recent_episodes))
            adv,returns=compute_gae(batch['rewards'],batch['values'],batch['nextValues'],batch['terminated'],batch['truncated'])
            adv=(adv-adv.mean())/(adv.std()+1e-8);x=tensor(batch['obs']);actions=tensor(batch['actions']);oldlog=tensor(batch['logp']);advantages=tensor(adv);targets=tensor(returns)
            if index in [0,2]:
                torch.save({'actor':{k:v.detach().cpu().clone() for k,v in actor.state_dict().items()},'observations':x.cpu(),'actions':actions.cpu(),
                            'oldLogProb':oldlog.cpu(),'advantages':advantages.cpu(),'targets':targets.cpu(),'parentSha256':meta['parentSha256']},out/f'rollout-{index+1:03}.private.pt')
            losses=[];started_opt=time.perf_counter()
            for epoch in range(4):
                permutation=rng.permutation(rollout_steps)
                stop=False
                for start in range(0,rollout_steps,256):
                    ids=torch.tensor(permutation[start:start+256],dtype=torch.int64,device=device);distribution=actor.distribution(x[ids]);newlog=distribution.log_prob(actions[ids]).sum(-1)
                    logratio=newlog-oldlog[ids];ratio=logratio.exp();surrogate=torch.minimum(ratio*advantages[ids],ratio.clamp(.8,1.2)*advantages[ids]);entropy=distribution.entropy().sum(-1).mean()
                    actor_loss=-surrogate.mean()-.001*entropy;actor_optimizer.zero_grad();actor_loss.backward();torch.nn.utils.clip_grad_norm_(actor.parameters(),.5);actor_optimizer.step()
                    value_loss=torch.nn.functional.smooth_l1_loss(critic(x[ids]),targets[ids],beta=10.);critic_optimizer.zero_grad();value_loss.backward();torch.nn.utils.clip_grad_norm_(critic.parameters(),5.);critic_optimizer.step()
                    kl=float(((ratio-1)-logratio).mean().detach());losses.append({'epoch':epoch+1,'actorLoss':float(actor_loss.detach()),'criticLoss':float(value_loss.detach()),'approximateKL':kl})
                    if kl>.02:stop=True;break
                if stop:break
            if device.startswith('cuda'):torch.cuda.synchronize()
            optimization_seconds=time.perf_counter()-started_opt
            evaluation=None
            if (index+1)%8==0 or index==start_index+updates-1:
                progress('full-evaluation',update=index+1);evaluation=evaluate(actor)
                if safe(evaluation) and evaluation['laps']>=baseline['laps'] and result_rank(evaluation)>result_rank(best_result):best_result=evaluation;best_state=copy.deepcopy(actor.state_dict())
                obs=reset_training();episode_reward=0.;episode_controls=0
            event={'update':index+1,'controls':rollout_steps,'completedLocalEpisodes':len(recent_episodes),'optimizerSeconds':optimization_seconds,
                   'losses':losses,'residualStd':actor.log_std.detach().clamp(-6,-.5).exp().cpu().tolist(),'evaluation':evaluation,'bestResult':best_result}
            events.append(event);atomic_json(out/f'update-{index+1:03}.json',event)
            tensor_file=out/'checkpoint.private.pt';pending=tensor_file.with_suffix('.pending.pt')
            torch.save({'actor':actor.state_dict(),'critic':critic.state_dict(),'actorOptimizer':actor_optimizer.state_dict(),'criticOptimizer':critic_optimizer.state_dict(),'bestActor':best_state,
                        'torchCpuRng':torch.get_rng_state(),'torchCudaRng':torch.cuda.get_rng_state() if device.startswith('cuda') else torch.get_rng_state()},pending);os.replace(pending,tensor_file)
            atomic_json(out/'checkpoint.private.json',{'format':'private-neural-feedback-ppo-checkpoint-v1','nextUpdate':index+1,'settings':settings,'sourceHashes':hashes,
                        'parentSha256':meta['parentSha256'],'tensorFile':tensor_file.name,'tensorSha256':file_hash(tensor_file),'bestResult':best_result,'numpyRng':rng.bit_generator.state,
                        'boundary':'Own real local resets have0inherited progress/laps and bootstrapped truncations. Full from-line evaluation only validates laps. Resume restores networks/optimizers/RNG but starts a new body episode, not bitwise body continuation. Private format, not ordinary5.6save.'})
            progress('update-finished',update=index+1,evaluation=evaluation,bestResult=best_result)
            if best_result['laps']>=2:break
        local_validation=[]
        for j in settings['validationSnapshotIndices']:local_validation.append({'snapshotIndex':j,'result':evaluate(actor,'local',j,.005 if j%2 else -.005)})
        atomic_json(out/'local-episodes.private.json',recent_episodes)
        assert all(file_hash(ROOT/f)==h for f,h in hashes.items())
        report={'format':'private-neural-feedback-ppo-training-v1','passed':True,'learningSucceeded':best_result['laps']>=2 and safe(best_result),'approvedForApp':False,
                'updatesCompleted':len(events),'startingUpdateIndex':start_index,'trainingControls':len(events)*rollout_steps,'baseline':baseline,'bestResult':best_result,
                'settings':settings,'events':events,'localValidation':local_validation,'completedLocalEpisodes':len(recent_episodes),'parentSha256':meta['parentSha256'],
                'sourceHashes':hashes,'checkpointSha256':file_hash(out/'checkpoint.private.json'),'cuda':env.request('stats'),'wallSeconds':time.monotonic()-started,
                'boundary':'Global518-to128-to64-to2 nonlinear residual on actual MaleCNS neuronal history/own commands, no old late gate, pose, route or teacher labels. Local randomization and local horizons are training only, with true termination versus critic-bootstrapped truncation. Candidate full evaluations are uncapped from-line; local validation does not count as laps. Initial zero readout preserves independently verified parent; reported best may remain zero parent. New policy requires independent restore/runtime and generalization verification before app use.'}
        atomic_json(out/'report.json',report);progress('finished',passed=True,learningSucceeded=report['learningSucceeded'],bestResult=best_result)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error),'completedUpdates':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);p.add_argument('--updates',type=int,default=32);p.add_argument('--rollout',type=int,default=512)
    p.add_argument('--device',choices=['cpu','cuda:0'],default='cuda:0');p.add_argument('--resume');a=p.parse_args();run(a.tag,a.updates,a.rollout,a.device,a.resume)
