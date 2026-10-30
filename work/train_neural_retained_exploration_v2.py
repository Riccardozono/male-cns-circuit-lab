"""Broader reward-only plasticity, exact retention of known successful states."""
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
from neural_feedback_ppo import Critic,compute_gae
from neural_feedback_ar1 import conditional_kl
from neural_retained_exploration_v2 import AdaptiveRetainedActorV2,conditional,applied,RHO
from neuronal_experiment_io import ROOT,NODE,Pipe,atomic_json,file_hash


def run(tag,updates=8,resume=None):
    if not tag.replace('-','').isalnum() or not 1<=updates<=64:raise ValueError('Scoped bounded retained learning required')
    torch.set_num_threads(2);torch.set_float32_matmul_precision('highest');torch.manual_seed(101261025)
    device='cuda:0';out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False)
    proofdir=out.parent/'neural-feedback-retention-proof-20261025-01';proof=json.loads((proofdir/'report.json').read_text())
    assert proof['passed'] and proof['fullFirstLapBodyAndNeuronsExact']
    bankfile=proofdir/'successful-neural-reference.private.npy';configfile=proofdir/'consolidation.private.json';basisfile=proofdir/'basis.private.json'
    assert file_hash(bankfile)==proof['referenceSha256'] and file_hash(configfile)==proof['configurationSha256']
    assert all(file_hash(ROOT/f)==h for f,h in {**proof['worldSourceHashes'],**proof['pythonSourceHashes']}.items())
    files=['work/train_neural_retained_exploration_v2.py','work/neural_retained_exploration_v2.py','work/neural_retained_exploration.py','work/neural_feedback_retention.py',
           'work/neural_feedback_kernel.py','work/neural_feedback_ppo.py','work/neural_feedback_ar1.py','work/neuronal_experiment_io.py',
           'work/neural-feedback-retention-training-world.cjs','work/neural-feedback-live.cjs','package.json','outputs/progress-save.js',
           *[str(f.relative_to(ROOT)) for f in [proofdir/'report.json',bankfile,configfile,basisfile]]]
    code="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',code],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    bank=np.load(bankfile,allow_pickle=False);basis=json.loads(basisfile.read_text());configuration=json.loads(configfile.read_text())
    actor=AdaptiveRetainedActorV2(basis,bank,configuration).to(device);critic=Critic().to(device)
    actor_opt=torch.optim.Adam([{'params':[actor.layers[-1].steering],'lr':.0003},{'params':[actor.layers[-1].pedal],'lr':.0075},{'params':[actor.log_std],'lr':.001}])
    critic_opt=torch.optim.Adam(critic.parameters(),lr=.001);rng=np.random.default_rng(101261025);env=None;events=[];episodes=[];started=time.monotonic();start_index=0
    settings={'rolloutControls':1024,'horizonControls':200,'gamma':.995,'gaeLambda':1.,'epochs':8,'clipRatio':.2,'postUpdateMeanKL':.01,
              'initialStd':[.01,.25],'rho':list(RHO),'steeringLearningRate':.0003,'pedalLearningRate':.0075,'stdLearningRate':.001,
              'featureCapacity':512,'maximumFeatureGrowthPerUpdate':8,'noveltyGain':16,'initialRadiusMultiplier':2,'grownRadiusMultiplier':2.5,'trainingReset':'half actual completed-lap boundary, half own post-lap snapshots',
              'sourceReferenceSha256':proof['referenceSha256'],'consolidationSha256':proof['configurationSha256'],'fullEvaluationLimit':None}
    t=lambda x:torch.tensor(x,dtype=torch.float32,device=device)
    def progress(phase,**extra):
        item={'phase':phase,'environmentPid':env.process.pid if env else None,'wallSeconds':time.monotonic()-started,'updatesCompleted':len(events),**extra}
        atomic_json(out/'progress.json',item);print('RETAINED_RL_V2 '+json.dumps(item),flush=True)
    try:
        env=Pipe(ROOT/'work/neural-feedback-retention-training-world.cjs',initialization={'configuration':{'horizonControls':200}})
        meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        assert meta['parentSha256']==proof['parentSha256'] and meta['firstLapControls']==proof['firstLapControls'] and meta['firstLapBodySequenceSha256']==proof['firstLapBodySequenceSha256']
        post_lap=[i for i,s in enumerate(meta['snapshots']) if s['laps']>=1]
        assert post_lap and meta['lapBoundary']['laps']==1
        def reset_training():
            cfg={'mode':'boundary-training'} if rng.random()<.5 else {'mode':'local','snapshotIndex':int(rng.choice(post_lap)),'headingKickRad':0.}
            return env.request('reset',configuration=cfg)['observation'],cfg
        evaluation_observations=[]
        def evaluate(mode='observed-lap-boundary'):
            obs=env.request('reset',configuration={'mode':mode})['observation'];controls=0;reward=0.;digest=__import__('hashlib').sha256();prefix_exact=None
            while True:
                evaluation_observations.append(obs)
                with torch.no_grad():action=actor.deterministic(t([obs]))[0].cpu().tolist()
                state=env.request('step',action=action);controls+=1;reward+=state['reward'];obs=state['observation']
                if mode=='from-line' and controls<=meta['firstLapControls']:digest.update((state['info']['bodyFrameSha256']+'\n').encode())
                if mode=='from-line' and controls==meta['firstLapControls']:prefix_exact=digest.hexdigest()==meta['firstLapBodySequenceSha256'];assert prefix_exact
                if controls%2048==0:progress('evaluation-running',mode=mode,controls=controls,info=state['info'])
                if state['terminated'] or state['truncated']:break
            return {**state['info'],'controls':controls,'futureReward':reward,'terminated':state['terminated'],'truncated':state['truncated'],'fullFromLine':mode=='from-line','firstLapBodyAndNeuronsExact':prefix_exact}
        baseline={'progress':meta['baseline']['bestProgress'],'laps':1,'reason':meta['baseline']['reason'],'safe':True,'fullFromLine':True}
        best=baseline.copy();best_actor=copy.deepcopy(actor.state_dict());best_source='zero-residual-parent'
        if resume:
            f=Path(resume).resolve();assert f.is_relative_to(ROOT);d=json.loads(f.read_text())
            if d['format']!='private-neural-retained-exploration-checkpoint-v2' or d['sourceHashes']!=hashes or d['settings']!=settings:raise ValueError('Explicit matching retained checkpoint/source identity required')
            pt=f.parent/d['tensorFile'];assert file_hash(pt)==d['tensorSha256'];v=torch.load(pt,map_location=device,weights_only=True)
            actor.load_state_dict(v['actor']);critic.load_state_dict(v['critic']);actor_opt.load_state_dict(v['actorOptimizer']);critic_opt.load_state_dict(v['criticOptimizer'])
            best_actor=v['bestActor'];best=d['best'];best_source=d['bestSource'];start_index=d['nextUpdate'];rng.bit_generator.state=d['numpyRng'];torch.set_rng_state(v['cpuRng'].cpu());torch.cuda.set_rng_state(v['cudaRng'].cpu())
        for file in files:
            if file.startswith('work/'):(out/Path(file).name).write_bytes((ROOT/file).read_bytes())
        progress('baseline-verified',baseline=baseline,referenceRows=len(bank),trainableParameters=sum(p.numel() for p in actor.parameters()))
        for index in range(start_index,start_index+updates):
            batch={k:[] for k in ['obs','prevObs','prevLatent','continuation','latent','oldlog','center','std','active','rewards','value','nextValue','terminated','truncated']}
            obs,cfg=reset_training();px=obs;pz=[0.,0.];previous_active=False;episode_controls=0;episode_reward=0.
            for j in range(1024):
                with torch.no_grad():
                    x=t([obs]);gate=actor.consolidation(x);active=bool(gate[0]>0);mask=float(previous_active and active)
                    if active:
                        dist=conditional(actor,x,t([px]),t([pz]),t([mask]));z=dist.sample();latent=z[0].cpu().tolist()
                        action=applied(actor,x,z,gate)[0].cpu().tolist();oldlog=float(dist.log_prob(z).sum());center=dist.loc[0].cpu().tolist();sd=dist.scale[0].cpu().tolist()
                    else:latent=[0.,0.];action=[0.,0.];oldlog=0.;center=[0.,0.];sd=[1.,1.]
                    value=float(critic(x)[0])
                state=env.request('step',action=action);newobs=state['observation']
                with torch.no_grad():nextvalue=0. if state['terminated'] else float(critic(t([newobs]))[0])
                row={'obs':obs,'prevObs':px,'prevLatent':pz,'continuation':mask,'latent':latent,'oldlog':oldlog,'center':center,'std':sd,'active':active,
                     'rewards':state['reward'],'value':value,'nextValue':nextvalue,'terminated':state['terminated'],'truncated':state['truncated']}
                for k,v in row.items():batch[k].append(v)
                px=obs;pz=latent;previous_active=active;obs=newobs;episode_controls+=1;episode_reward+=state['reward']
                if state['terminated'] or state['truncated']:
                    episodes.append({'update':index+1,'reset':cfg,'controls':episode_controls,'futureReward':episode_reward,**state['info'],'terminated':state['terminated'],'truncated':state['truncated']})
                    obs,cfg=reset_training();px=obs;pz=[0.,0.];previous_active=False;episode_controls=0;episode_reward=0.
                if (j+1)%256==0:progress('actual-rollout',update=index+1,controls=j+1,activeControls=sum(batch['active']))
            adv,returns=compute_gae(batch['rewards'],batch['value'],batch['nextValue'],batch['terminated'],batch['truncated'],gamma=.995,lam=1.)
            allx=t(batch['obs']);targets=t(returns);ids=np.asarray(batch['active'],dtype=bool);assert ids.sum()>5
            x=t(np.asarray(batch['obs'])[ids]);px=t(np.asarray(batch['prevObs'])[ids]);pz=t(np.asarray(batch['prevLatent'])[ids]);mask=t(np.asarray(batch['continuation'])[ids])
            latent=t(np.asarray(batch['latent'])[ids]);oldlog=t(np.asarray(batch['oldlog'])[ids]);oldcenter=t(np.asarray(batch['center'])[ids]);oldstd=t(np.asarray(batch['std'])[ids])
            advantage=t((adv[ids]-adv[ids].mean())/(adv[ids].std()+1e-8))
            with torch.no_grad():likelihood_error=float((conditional(actor,x,px,pz,mask).log_prob(latent).sum(-1)-oldlog).abs().max())
            assert likelihood_error<.001
            if index==start_index:torch.save({'actor':actor.state_dict(),'batch':batch,'advantages':adv,'returns':returns},out/'actual-rollout.private.pt')
            losses=[]
            for epoch in range(8):
                dist=conditional(actor,x,px,pz,mask);ratio=(dist.log_prob(latent).sum(-1)-oldlog).exp()
                loss=-torch.minimum(ratio*advantage,ratio.clamp(.8,1.2)*advantage).mean()
                before=copy.deepcopy(actor.state_dict());beforeopt=copy.deepcopy(actor_opt.state_dict());actor_opt.zero_grad();loss.backward();torch.nn.utils.clip_grad_norm_(actor.parameters(),1.);actor_opt.step();proposal=copy.deepcopy(actor.state_dict())
                for fraction in [1.,.5,.25,.125,.0625,.03125,.015625,0.]:
                    # Floating buffers are identical during optimization.
                    candidate={k:before[k]+fraction*(proposal[k]-before[k]) for k in before}
                    actor.load_state_dict(candidate)
                    with torch.no_grad():kl=float(conditional_kl(oldcenter,oldstd,conditional(actor,x,px,pz,mask)).mean())
                    if np.isfinite(kl) and kl<=.0100001:break
                if fraction==0.:actor_opt.load_state_dict(beforeopt)
                losses.append({'epoch':epoch+1,'loss':float(loss.detach()),'acceptedFraction':fraction,'postMeanKL':kl})
                if fraction==0.:break
            for _ in range(4):
                value_loss=torch.nn.functional.smooth_l1_loss(critic(allx),targets,beta=10.);critic_opt.zero_grad();value_loss.backward();torch.nn.utils.clip_grad_norm_(critic.parameters(),5.);critic_opt.step()
            growth=actor.grow(x,maximum=8)
            evaluation_observations.clear()
            progress('suffix-evaluation',update=index+1);suffix=evaluate();full=None
            if suffix['safe'] and (suffix['laps'],suffix['progress'])>(best['laps'],best['progress']):
                progress('full-evaluation',update=index+1);full=evaluate('from-line')
                assert full['progress']==suffix['progress'] and full['laps']==suffix['laps'] and full['reason']==suffix['reason']
                best=full;best_actor=copy.deepcopy(actor.state_dict());best_source=f'learned-update-{index+1}'
            evaluation_growth=actor.grow(t(evaluation_observations),maximum=8) if evaluation_observations else None
            event={'update':index+1,'controls':1024,'activeControls':int(ids.sum()),'completedEpisodes':len(episodes),'likelihoodReplayMaxError':likelihood_error,
                   'losses':losses,'growth':growth,'evaluationGrowth':evaluation_growth,'suffix':suffix,'full':full,'best':best,'bestSource':best_source}
            events.append(event);atomic_json(out/f'update-{index+1:03}.json',event)
            pt=out/'checkpoint.private.pt';pending=out/'checkpoint.pending.pt'
            torch.save({'actor':actor.state_dict(),'critic':critic.state_dict(),'actorOptimizer':actor_opt.state_dict(),'criticOptimizer':critic_opt.state_dict(),
                        'bestActor':best_actor,'cpuRng':torch.get_rng_state(),'cudaRng':torch.cuda.get_rng_state()},pending);os.replace(pending,pt)
            atomic_json(out/'checkpoint.private.json',{'format':'private-neural-retained-exploration-checkpoint-v2','nextUpdate':index+1,'tensorFile':pt.name,'tensorSha256':file_hash(pt),
                        'settings':settings,'sourceHashes':hashes,'best':best,'bestSource':best_source,'numpyRng':rng.bit_generator.state,
                        'boundary':'Private adaptive neural-feature policy; frozen successful-experience reference only, no target actions. Local/suffix progress is inherited explicitly; best requires full from-line confirmation. Resume starts another body episode.'})
            progress('update-finished',update=index+1,suffix=suffix,full=full,best=best,enabledFeatures=growth['enabledFeatures'])
            if best['laps']>=2:break
        atomic_json(out/'episodes.private.json',episodes);assert all(file_hash(ROOT/f)==h for f,h in hashes.items())
        report={'format':'private-neural-retained-exploration-training-v2','passed':True,'learningSucceeded':best['laps']>=2,'approvedForApp':False,
                'updatesCompleted':len(events),'startingUpdateIndex':start_index,'actualTrainingControls':1024*len(events),'completedEpisodes':len(episodes),
                'baseline':baseline,'best':best,'bestSource':best_source,'events':events,'settings':settings,'sourceHashes':hashes,'parentSha256':meta['parentSha256'],
                'checkpointSha256':file_hash(out/'checkpoint.private.json'),'cuda':env.request('stats'),'wallSeconds':time.monotonic()-started,
                'boundary':'Broader stochastic exploration only at novel neural experience; known first-lap observations imply exact0 residual for all parameters. Causal gate uses518neural/own-command signals, never position/lap/time. Own physical snapshot resets preserve native rewards and report inheritance. Suffix searches reuse a proven invariant actual prefix; only full from-line confirmations can update best. New zero-weight feature centers come only from actual newly observed states and are checked not to change the current mean. No action teacher, no new anatomical neurons, no ordinary-save compatibility or app approval.'}
        atomic_json(out/'report.json',report);progress('finished',learningSucceeded=report['learningSucceeded'],best=best)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error),'completedUpdates':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);p.add_argument('--updates',type=int,default=8);p.add_argument('--resume');a=p.parse_args();run(a.tag,a.updates,a.resume)
