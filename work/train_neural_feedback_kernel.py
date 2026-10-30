"""Private compact neural-feature PPO with preserved native reset context.

All labels are rewards from actual driving. Local resets are captured OWN
states with relative reported progress/laps, and cannot establish a full from-line lap.
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
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from neural_feedback_ar1 import Critic, conditional, conditional_kl, compute_gae, RHO
from neural_feedback_multitask import update_actor
from neural_feedback_kernel import KernelActor,fit_basis


def run(tag,updates=32,rollout_steps=1024,resume=None):
    if not tag.replace('-','').isalnum() or not 1<=updates<=128 or rollout_steps not in [512,1024,2048]:
        raise ValueError('Scoped bounded training required')
    torch.set_num_threads(2);torch.set_float32_matmul_precision('highest');torch.manual_seed(98261025)
    device='cuda:0';out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False)
    prefile=out.parent/'neural-feedback-kernel-preflight-20261025-01/report.json'
    resetfile=out.parent/'neural-feedback-reset-proof-20261025-01/report.json'
    pre=json.loads(prefile.read_text());resetproof=json.loads(resetfile.read_text())
    multiprefile=out.parent/'neural-feedback-multitask-preflight-20261025-01/report.json'
    multipre=json.loads(multiprefile.read_text());assert multipre['passed']
    contextfile=out.parent/'neural-feedback-reward-context-proof-20261025-01/report.json'
    contextproof=json.loads(contextfile.read_text());assert contextproof['passed']
    assert all(file_hash(ROOT/f)==h for f,h in contextproof['sourceHashes'].items())
    assert all(file_hash(ROOT/f)==h for f,h in multipre['sourceHashes'].items())
    assert pre['passed'] and resetproof['passed']
    files=['work/train_neural_feedback_kernel.py','work/neural_feedback_kernel.py','work/verify_neural_feedback_kernel.py','work/verify_neural_feedback_reward_context.py',str(contextfile.relative_to(ROOT)),'work/neural_feedback_multitask.py','work/verify_neural_feedback_multitask.py',str(multiprefile.relative_to(ROOT)),'work/neural_feedback_ar1.py','work/neural_feedback_ppo.py',
           'work/neuronal_experiment_io.py','work/neural-feedback-kernel-world.cjs','work/neural-feedback-live.cjs',
           'work/verify_neural_feedback_ar1.py','work/verify_neural_feedback_resets.py','package.json','outputs/progress-save.js',
           str(prefile.relative_to(ROOT)),str(resetfile.relative_to(ROOT)),
           '.impeccable/review/learning-ml/statehead-reward-native-proof-20261025-01/report.json',
           '.impeccable/review/learning-ml/statehead-reward-native-proof-20261025-01/candidate.malecns-statehead.json']
    code="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',code],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    assert all(file_hash(ROOT/f)==h for f,h in {**pre['worldSourceHashes'],**pre['pythonSourceHashes']}.items())
    settings={'device':device,'rolloutSteps':rollout_steps,'localHorizonControls':200,'gamma':.995,'gaeLambda':1.,
              'epochs':4,'minibatch':256,'actorOptimizer':'scaled common-gradient with checked group surrogates','criticLearningRate':1e-3,'clipRatio':.2,
              'postUpdateConditionalMeanKL':.01,'entropyCoefficient':0.,'coldResetSchedule':'one cold, one uniform, two last-eight own-snapshot resets per four resets',
              'validationSnapshotIndices':[2,10,18,26],'architecture':'518 actual observations /96 local kernels /2 motors','initialStd':[.003,.06],
              'rho':list(RHO),'evaluationEveryUpdates':8,'fullEvaluationLimit':None,'resetBodyEachRollout':True,'preserveNativeRewardContext':True}
    actor=None;critic=Critic().to(device)
    critic_opt=torch.optim.Adam(critic.parameters(),lr=settings['criticLearningRate'])
    rng=np.random.default_rng(98261025);env=None;events=[];episodes=[];start_index=0;started=time.monotonic()
    tensor=lambda x:torch.tensor(x,dtype=torch.float32,device=device)
    def progress(phase,**extra):
        item={'phase':phase,'environmentPid':env.process.pid if env else None,'wallSeconds':time.monotonic()-started,'completedUpdates':len(events),**extra}
        atomic_json(out/'progress.json',item);print('FEEDBACK_KERNEL '+json.dumps(item),flush=True)
    try:
        env=Pipe(ROOT/'work/neural-feedback-kernel-world.cjs',initialization={'configuration':{'horizonControls':200,'seed':98261025}})
        meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        assert meta['parentSha256']==pre['parentSha256'] and meta['sourceHashes']==pre['worldSourceHashes']
        basis=fit_basis(meta['neuralBasisSamples']);atomic_json(out/'basis.private.json',basis)
        assert file_hash(out/'basis.private.json')==pre['basisSha256']
        settings['basisSha256']=pre['basisSha256'];actor=KernelActor(basis).to(device)
        training_indices=[i for i in range(len(meta['snapshots'])) if i not in settings['validationSnapshotIndices']]
        tail_indices=[i for i in training_indices if i>=len(meta['snapshots'])-8]
        reset_counter=0
        def reset_training():
            nonlocal reset_counter
            reset_counter+=1
            if reset_counter%4==1:cfg={'mode':'cold-training','headingKickRad':float(rng.uniform(-.01,.01))}
            else:cfg={'mode':'local','snapshotIndex':int(rng.choice(training_indices if reset_counter%4==2 else tail_indices)),'headingKickRad':float(rng.uniform(-.01,.01))}
            return env.request('reset',configuration=cfg)['observation'],cfg
        def evaluate(model,mode='from-line',index=None,kick=0.):
            cfg={'mode':mode,'headingKickRad':kick}
            if index is not None:cfg['snapshotIndex']=index
            obs=env.request('reset',configuration=cfg)['observation'];controls=0;reward=0.
            while True:
                with torch.no_grad():action=model.deterministic(tensor([obs]))[0].cpu().tolist()
                state=env.request('step',action=action);controls+=1;reward+=state['reward'];obs=state['observation']
                if controls%2048==0:progress('full-evaluation-running',controls=controls,info=state['info'])
                if state['terminated'] or state['truncated']:break
            return {**state['info'],'controls':controls,'reward':reward,'terminated':state['terminated'],'truncated':state['truncated']}
        baseline={'progress':meta['baseline']['bestProgress'],'laps':meta['baseline']['laps'],'reason':meta['baseline']['reason'],'terminated':True,'truncated':False}
        best_result=baseline.copy();best_actor=copy.deepcopy(actor.state_dict());best_source='initial-zero-residual-parent'
        if resume:
            f=Path(resume).resolve();assert f.is_relative_to(ROOT);desc=json.loads(f.read_text())
            if desc['format']!='private-neural-feedback-kernel-checkpoint-v1' or desc['settings']!=settings or desc['sourceHashes']!=hashes or desc['parentSha256']!=meta['parentSha256']:
                raise ValueError('Explicit matching AR1 model/source/reset identity required')
            pt=f.parent/desc['tensorFile'];assert file_hash(pt)==desc['tensorSha256']
            saved=torch.load(pt,map_location=device,weights_only=True);actor.load_state_dict(saved['actor']);critic.load_state_dict(saved['critic'])
            critic_opt.load_state_dict(saved['criticOptimizer']);best_actor=saved['bestActor']
            best_result=desc['bestResult'];best_source=desc['bestSource'];start_index=desc['nextUpdate'];rng.bit_generator.state=desc['numpyRng']
            torch.set_rng_state(saved['torchCpuRng'].cpu());torch.cuda.set_rng_state(saved['torchCudaRng'].cpu())
        for f in files:
            if f.startswith('work/'):(out/Path(f).name).write_bytes((ROOT/f).read_bytes())
        progress('baseline-verified',baseline=baseline,neurons=meta['neurons'],edges=meta['edges'])
        for index in range(start_index,start_index+updates):
            obs,cfg=reset_training();previous_obs=obs;previous_z=[0.,0.];continuing=0.;episode_reward=0.;episode_controls=0
            batch={key:[] for key in ['obs','prevObs','prevActions','continuation','actions','logp','centers','std','cold','values','rewards','nextValues','terminated','truncated']}
            for j in range(rollout_steps):
                with torch.no_grad():
                    x=tensor([obs]);dist=conditional(actor,x,tensor([previous_obs]),tensor([previous_z]),tensor([continuing]))
                    z=dist.sample();logp=dist.log_prob(z).sum(-1);value=critic(x)
                latent=z[0].cpu().tolist();state=env.request('step',action=torch.tanh(z)[0].cpu().tolist());new_obs=state['observation']
                with torch.no_grad():next_value=float(critic(tensor([new_obs]))[0]) if not state['terminated'] else 0.
                row={'obs':obs,'prevObs':previous_obs,'prevActions':previous_z,'continuation':continuing,'actions':latent,
                     'logp':float(logp[0]),'centers':dist.loc[0].cpu().tolist(),'std':dist.scale[0].cpu().tolist(),
                     'cold':cfg['mode']=='cold-training','values':float(value[0]),'rewards':state['reward'],'nextValues':next_value,'terminated':state['terminated'],'truncated':state['truncated']}
                for key,val in row.items():batch[key].append(val)
                previous_obs=obs;previous_z=latent;continuing=1.;obs=new_obs;episode_reward+=state['reward'];episode_controls+=1
                if state['terminated'] or state['truncated']:
                    episodes.append({'update':index+1,'reset':cfg,'controls':episode_controls,'reward':episode_reward,**state['info'],
                                     'terminated':state['terminated'],'truncated':state['truncated']})
                    obs,cfg=reset_training();previous_obs=obs;previous_z=[0.,0.];continuing=0.;episode_reward=0.;episode_controls=0
                if (j+1)%256==0:progress('actual-rollout',update=index+1,controls=j+1,completedEpisodes=len(episodes))
            adv,returns=compute_gae(batch['rewards'],batch['values'],batch['nextValues'],batch['terminated'],batch['truncated'],gamma=.995,lam=1.)
            advantages=tensor((adv-adv.mean())/(adv.std()+1e-8));targets=tensor(returns);x=tensor(batch['obs']);px=tensor(batch['prevObs'])
            pz=tensor(batch['prevActions']);mask=tensor(batch['continuation']);actions=tensor(batch['actions']);oldlog=tensor(batch['logp'])
            oldcenter=tensor(batch['centers']);oldstd=tensor(batch['std']);losses=[];actor_enabled=True;rejections=0
            if index==start_index:
                torch.save({'actor':{k:v.detach().cpu().clone() for k,v in actor.state_dict().items()},'batch':batch,'advantages':advantages.cpu(),'targets':targets.cpu()},out/'actual-rollout.private.pt')
            losses=update_actor(actor,x,px,pz,mask,actions,oldlog,oldcenter,oldstd,advantages,tensor(batch['cold']).bool())
            rejections=sum(r['acceptedFraction']==0 for r in losses)
            critic_losses=[]
            for epoch in range(4):
                permutation=rng.permutation(rollout_steps)
                for offset in range(0,rollout_steps,256):
                    ids=torch.tensor(permutation[offset:offset+256],device=device,dtype=torch.int64)
                    critic_loss=torch.nn.functional.smooth_l1_loss(critic(x[ids]),targets[ids],beta=10.)
                    critic_opt.zero_grad();critic_loss.backward();torch.nn.utils.clip_grad_norm_(critic.parameters(),5.);critic_opt.step()
                    critic_losses.append(float(critic_loss.detach()))
            with torch.no_grad():final_kl=float(conditional_kl(oldcenter,oldstd,conditional(actor,x,px,pz,mask)).mean())
            assert np.isfinite(final_kl) and final_kl<=.0100001
            evaluation=None
            if (index+1)%8==0 or index==start_index+updates-1:
                progress('full-evaluation',update=index+1);evaluation=evaluate(actor)
                if evaluation['safe'] and (evaluation['laps'],evaluation['progress'])>(best_result['laps'],best_result['progress']):
                    best_result=evaluation;best_actor=copy.deepcopy(actor.state_dict());best_source=f'learned-update-{index+1}'
            event={'update':index+1,'trainingControls':rollout_steps,'completedLocalEpisodes':len(episodes),'interruptedBodyControlsAtRolloutEnd':episode_controls,
                   'postUpdateMeanConditionalKL':final_kl,'actorRejections':rejections,'losses':losses,'criticLosses':critic_losses,'coldTrainingControls':sum(batch['cold']),'evaluation':evaluation,'bestResult':best_result,'bestSource':best_source,
                   'residualStd':actor.log_std.detach().clamp(-6,-.5).exp().cpu().tolist()}
            events.append(event);atomic_json(out/f'update-{index+1:03}.json',event)
            pt=out/'checkpoint.private.pt';pending=out/'checkpoint.pending.pt'
            torch.save({'actor':actor.state_dict(),'critic':critic.state_dict(),'criticOptimizer':critic_opt.state_dict(),
                        'bestActor':best_actor,'torchCpuRng':torch.get_rng_state(),'torchCudaRng':torch.cuda.get_rng_state()},pending);os.replace(pending,pt)
            atomic_json(out/'checkpoint.private.json',{'format':'private-neural-feedback-kernel-checkpoint-v1','settings':settings,'sourceHashes':hashes,
                        'parentSha256':meta['parentSha256'],'nextUpdate':index+1,'tensorFile':pt.name,'tensorSha256':file_hash(pt),'numpyRng':rng.bit_generator.state,
                        'bestResult':best_result,'bestSource':best_source,'boundary':'Private actual-neural residual, separate from app5.6 saves. Resume restarts the body as every rollout does; no free progress. No actor or critic labels from a teacher.'})
            progress('update-finished',update=index+1,evaluation=evaluation,bestResult=best_result,meanKL=final_kl)
            if best_result['laps']>=2:break
        validation=[{'snapshotIndex':i,'result':evaluate(actor,'local',i,-.005)} for i in settings['validationSnapshotIndices']]
        atomic_json(out/'local-episodes.private.json',episodes)
        assert all(file_hash(ROOT/f)==h for f,h in hashes.items())
        report={'format':'private-neural-feedback-kernel-training-v1','passed':True,'learningSucceeded':best_result['laps']>=2,'approvedForApp':False,
                'updatesCompleted':len(events),'startingUpdateIndex':start_index,'trainingControls':len(events)*rollout_steps,'completedLocalEpisodes':len(episodes),
                'baseline':baseline,'bestResult':best_result,'bestSource':best_source,'events':events,'validation':validation,'settings':settings,
                'parentSha256':meta['parentSha256'],'sourceHashes':hashes,'checkpointSha256':file_hash(out/'checkpoint.private.json'),
                'cuda':env.request('stats'),'wallSeconds':time.monotonic()-started,
                'boundary':'Unsupervised compact kernels of actually observed neural vectors, no global motor bias; tail-biased OWN reset curriculum without policy reset labels; exact actual local body/brain/reward/termination context; training metrics subtract the restored anchor and never validate full from-line laps; AR1pedal likelihood differentiates both neural means, with resets at episode/rollout boundaries. GAE lambda1 and bootstrapped truncations. Cold and moving-reset labels affect gradient aggregation only, never policy inputs. A common gradient and backtracking protect BOTH measured clipped surrogates and per-group conditional KL. This does not guarantee physical driving or full-history stability. No route/time/lap inputs. Local validation resets are excluded from training reset indices, but normalization and overlapping trajectories prevent claiming globally unseen validation. Full uncapped from-line evaluation is the lap criterion. Best may be the unchanged zero parent; independent restore/runtime proof still required.'}
        atomic_json(out/'report.json',report);progress('finished',learningSucceeded=report['learningSucceeded'],bestResult=best_result,bestSource=best_source)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error),'completedUpdates':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);p.add_argument('--updates',type=int,default=32)
    p.add_argument('--rollout',type=int,default=1024);p.add_argument('--resume');args=p.parse_args();run(args.tag,args.updates,args.rollout,args.resume)
