"""Complete native episodes, common actual origin, reward-only retained learning."""
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
from neural_retained_balanced import BalancedRetainedActor,conditional,applied,RHO
from neural_feedback_ar1 import conditional_kl
from episodic_neural_advantage import advantages
from neuronal_experiment_io import ROOT,NODE,Pipe,atomic_json,file_hash


def run(tag,updates=8,resume=None):
    if not tag.replace('-','').isalnum() or not 1<=updates<=128:raise ValueError('Scoped complete-episode study required')
    torch.set_num_threads(2);torch.set_float32_matmul_precision('highest');torch.manual_seed(102261025)
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);ref=out.parent/'neural-feedback-retention-proof-20261025-01'
    proof=json.loads((ref/'report.json').read_text());bankfile=ref/'successful-neural-reference.private.npy';conf=ref/'consolidation.private.json';basisfile=ref/'basis.private.json'
    assert proof['passed'] and proof['fullFirstLapBodyAndNeuronsExact'] and file_hash(bankfile)==proof['referenceSha256'] and file_hash(conf)==proof['configurationSha256']
    files=['work/train_neural_retained_episodic.py','work/episodic_neural_advantage.py','work/neural_retained_balanced.py','work/neural_retained_exploration_v2.py',
           'work/neural_retained_exploration.py','work/neural_feedback_retention.py','work/neural_feedback_kernel.py','work/neural_feedback_ar1.py','work/neural_feedback_ppo.py',
           'work/neuronal_experiment_io.py','work/neural-feedback-retention-training-world.cjs','package.json','outputs/progress-save.js',
           *[str(p.relative_to(ROOT)) for p in [ref/'report.json',bankfile,conf,basisfile]]]
    js="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',js],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    bank=np.load(bankfile,allow_pickle=False);basis=json.loads(basisfile.read_text());configuration=json.loads(conf.read_text())
    actor=BalancedRetainedActor(basis,bank,configuration).to('cuda:0')
    optimizer=torch.optim.Adam([{'params':[actor.layers[-1].steering],'lr':.0075},{'params':[actor.layers[-1].pedal],'lr':.0075},{'params':[actor.log_std],'lr':.001}])
    settings={'episodesPerUpdate':4,'gamma':1.,'baseline':'other independent complete episodes, same actual origin, future return at matching relative step',
              'trainingTermination':'native only, no local time horizon','additionalStallTrainingCost':18.,'nativeRewardRevision':'progress-5-crash-safety-experiment',
              'sourceReferenceSha256':proof['referenceSha256'],'consolidationSha256':proof['configurationSha256'],'initialStd':[.25,.25],
              'rho':list(RHO),'epochs':8,'meanKL':.01,'growthPerPhase':8,'noveltyGain':16,'initialRadiusMultiplier':2,'featureCapacity':512,
              'actorLearningRates':[.0075,.0075,.001],'fullEvaluationLimit':None}
    env=None;events=[];episodes=[];start_index=0;started=time.monotonic();t=lambda x:torch.tensor(x,dtype=torch.float32,device='cuda:0')
    def progress(phase,**extra):
        item={'phase':phase,'environmentPid':env.process.pid if env else None,'wallSeconds':time.monotonic()-started,'updatesCompleted':len(events),**extra}
        atomic_json(out/'progress.json',item);print('EPISODIC_NEURAL '+json.dumps(item),flush=True)
    try:
        env=Pipe(ROOT/'work/neural-feedback-retention-training-world.cjs',initialization={'configuration':{'horizonControls':200}});meta=env.metadata
        assert meta['parentSha256']==proof['parentSha256'] and meta['firstLapBodySequenceSha256']==proof['firstLapBodySequenceSha256']
        atomic_json(out/'metadata.private.json',meta);baseline={'progress':meta['baseline']['bestProgress'],'laps':1,'reason':meta['baseline']['reason'],'safe':True,'fullFromLine':True}
        best=baseline.copy();best_actor=copy.deepcopy(actor.state_dict());best_source='zero-residual-parent'
        if resume:
            f=Path(resume).resolve();assert f.is_relative_to(ROOT);d=json.loads(f.read_text());assert d['format']=='private-neural-retained-episodic-checkpoint-v1' and d['settings']==settings and d['sourceHashes']==hashes
            tensor=f.parent/d['tensorFile'];assert file_hash(tensor)==d['tensorSha256'];v=torch.load(tensor,map_location='cuda:0',weights_only=True)
            actor.load_state_dict(v['actor']);optimizer.load_state_dict(v['actorOptimizer']);best_actor=v['bestActor'];best=d['best'];best_source=d['bestSource'];start_index=d['nextUpdate']
            torch.set_rng_state(v['cpuRng'].cpu());torch.cuda.set_rng_state(v['cudaRng'].cpu())
        def evaluate(mode='observed-lap-boundary'):
            obs=env.request('reset',configuration={'mode':mode})['observation'];controls=0;states=[];digest=__import__('hashlib').sha256();prefix=None
            while True:
                states.append(obs)
                with torch.no_grad():action=actor.deterministic(t([obs]))[0].cpu().tolist()
                state=env.request('step',action=action);controls+=1;obs=state['observation']
                if mode=='from-line' and controls<=meta['firstLapControls']:digest.update((state['info']['bodyFrameSha256']+'\n').encode())
                if mode=='from-line' and controls==meta['firstLapControls']:prefix=digest.hexdigest()==meta['firstLapBodySequenceSha256'];assert prefix
                if controls%2048==0:progress('evaluation-running',mode=mode,controls=controls,info=state['info'])
                if state['terminated']:break
                assert not state['truncated']
            return {**state['info'],'controls':controls,'fullFromLine':mode=='from-line','firstLapBodyAndNeuronsExact':prefix},states
        for p in files:
            if p.startswith('work/'):(out/Path(p).name).write_bytes((ROOT/p).read_bytes())
        progress('baseline-verified',baseline=baseline,settings=settings)
        for index in range(start_index,start_index+updates):
            batch={k:[] for k in ['obs','prevObs','prevLatent','continuation','latent','oldlog','center','std','active','rewards','nativeRewards']}
            reward_sequences=[];lengths=[]
            for episode in range(4):
                obs=env.request('reset',configuration={'mode':'observed-lap-boundary'})['observation'];px=obs;pz=[0.,0.];wasactive=False;rewards=[];native_sum=0.;controls=0
                while True:
                    with torch.no_grad():
                        x=t([obs]);gate=actor.consolidation(x);active=bool(gate[0]>0);mask=float(active and wasactive)
                        if active:
                            dist=conditional(actor,x,t([px]),t([pz]),t([mask]));z=dist.sample();latent=z[0].cpu().tolist();action=applied(actor,x,z,gate)[0].cpu().tolist()
                            logp=float(dist.log_prob(z).sum());center=dist.loc[0].cpu().tolist();sd=dist.scale[0].cpu().tolist()
                        else:latent=[0.,0.];action=[0.,0.];logp=0.;center=[0.,0.];sd=[1.,1.]
                    state=env.request('step',action=action);controls+=1;native_sum+=state['reward'];extra=18. if state['terminated'] and state['info']['reason'] in ['ferma / senza progresso','troppo lenta / senza progresso'] else 0.
                    reward=state['reward']-extra;rewards.append(reward)
                    row={'obs':obs,'prevObs':px,'prevLatent':pz,'continuation':mask,'latent':latent,'oldlog':logp,'center':center,'std':sd,'active':active,'rewards':reward,'nativeRewards':state['reward']}
                    for k,v in row.items():batch[k].append(v)
                    px=obs;pz=latent;wasactive=active;obs=state['observation']
                    if controls%256==0:progress('complete-episode-rollout',update=index+1,episode=episode+1,controls=controls,info=state['info'])
                    assert not state['truncated']
                    if state['terminated']:break
                reward_sequences.append(rewards);lengths.append(controls)
                episodes.append({'update':index+1,'episode':episode+1,'controls':controls,'usedForTraining':True,'origin':'actual completed-lap snapshot',
                                 'nativeFutureReward':native_sum,'trainingFutureReward':sum(rewards),'additionalStallCost':extra,**state['info']})
            av,ret=advantages(reward_sequences);adv=np.concatenate(av);returns=np.concatenate(ret);ids=np.asarray(batch['active'],dtype=bool);assert ids.sum()>5
            x=t(np.asarray(batch['obs'])[ids]);px=t(np.asarray(batch['prevObs'])[ids]);pz=t(np.asarray(batch['prevLatent'])[ids]);mask=t(np.asarray(batch['continuation'])[ids])
            z=t(np.asarray(batch['latent'])[ids]);oldlog=t(np.asarray(batch['oldlog'])[ids]);oldcenter=t(np.asarray(batch['center'])[ids]);oldstd=t(np.asarray(batch['std'])[ids])
            aa=t((adv[ids]-adv[ids].mean())/(adv[ids].std()+1e-8));losses=[]
            with torch.no_grad():likelihood_error=float((conditional(actor,x,px,pz,mask).log_prob(z).sum(-1)-oldlog).abs().max())
            assert likelihood_error<.001
            if index==start_index:torch.save({'actor':actor.state_dict(),'batch':batch,'advantages':torch.from_numpy(adv),'returns':torch.from_numpy(returns),'episodeLengths':lengths},out/'actual-rollout.private.pt')
            for epoch in range(8):
                dist=conditional(actor,x,px,pz,mask);ratio=(dist.log_prob(z).sum(-1)-oldlog).exp();loss=-torch.minimum(ratio*aa,ratio.clamp(.8,1.2)*aa).mean()
                before=copy.deepcopy(actor.state_dict());beforeopt=copy.deepcopy(optimizer.state_dict());optimizer.zero_grad();loss.backward();torch.nn.utils.clip_grad_norm_(actor.parameters(),1.);optimizer.step();proposal=copy.deepcopy(actor.state_dict())
                for fraction in [1.,.5,.25,.125,.0625,.03125,.015625,0.]:
                    actor.load_state_dict({k:before[k]+fraction*(proposal[k]-before[k]) for k in before})
                    with torch.no_grad():kl=float(conditional_kl(oldcenter,oldstd,conditional(actor,x,px,pz,mask)).mean())
                    if np.isfinite(kl) and kl<=.0100001:break
                if fraction==0.:optimizer.load_state_dict(beforeopt)
                losses.append({'epoch':epoch+1,'loss':float(loss.detach()),'acceptedFraction':fraction,'postMeanKL':kl})
                if fraction==0.:break
            growth=actor.grow(x,8);progress('suffix-evaluation',update=index+1);suffix,seen=evaluate();full=None
            if suffix['safe'] and (suffix['laps'],suffix['progress'])>(best['laps'],best['progress']):
                progress('full-evaluation',update=index+1);full,_=evaluate('from-line')
                assert all(full[k]==suffix[k] for k in ['progress','laps','reason','bodyFrameSha256'])
                best=full;best_actor=copy.deepcopy(actor.state_dict());best_source=f'learned-update-{index+1}'
            evaluation_growth=actor.grow(t(seen),8);event={'update':index+1,'controls':sum(lengths),'episodeLengths':lengths,'likelihoodReplayMaxError':likelihood_error,
                'losses':losses,'growth':growth,'evaluationGrowth':evaluation_growth,'suffix':suffix,'full':full,'best':best,'bestSource':best_source}
            events.append(event);atomic_json(out/f'update-{index+1:03}.json',event);pt=out/'checkpoint.private.pt';pending=out/'checkpoint.pending.pt'
            torch.save({'actor':actor.state_dict(),'actorOptimizer':optimizer.state_dict(),'bestActor':best_actor,'cpuRng':torch.get_rng_state(),'cudaRng':torch.cuda.get_rng_state()},pending);os.replace(pending,pt)
            atomic_json(out/'checkpoint.private.json',{'format':'private-neural-retained-episodic-checkpoint-v1','nextUpdate':index+1,'tensorFile':pt.name,'tensorSha256':file_hash(pt),
                        'settings':settings,'sourceHashes':hashes,'best':best,'bestSource':best_source,'boundary':'New private training objective, native physics/rewards preserved in logs and validation. No ordinary-save or app compatibility claimed. Complete episodes start at a proven real prefix, not a fake completed lap.'})
            progress('update-finished',update=index+1,suffix=suffix,full=full,best=best)
            if best['laps']>=2:break
        atomic_json(out/'episodes.private.json',episodes);assert all(file_hash(ROOT/p)==h for p,h in hashes.items())
        report={'format':'private-neural-retained-episodic-training-v1','passed':True,'learningSucceeded':best['laps']>=2,'approvedForApp':False,'updatesCompleted':len(events),
                'startingUpdateIndex':start_index,'actualTrainingControls':sum(e['controls'] for e in events),'completedEpisodes':len(episodes),'baseline':baseline,
                'best':best,'bestSource':best_source,'events':events,'settings':settings,'sourceHashes':hashes,'parentSha256':meta['parentSha256'],
                'checkpointSha256':file_hash(out/'checkpoint.private.json'),'cuda':env.request('stats'),'wallSeconds':time.monotonic()-started,
                'boundary':'No artificial time truncation in training or evaluation. Undiscounted complete reward-to-go, independent leave-one-other-episode baseline at common real origin; no critic or temporal input to actor. Stall training-only debit1800native points brings its base failure cost to collision3200; native reward separately retained and full validation unchanged. Reference contains neural experience only. Only full from-line safe improvements update best; inherited snapshots or stochastic two-lap training outcomes never prove a full completed lap.'}
        atomic_json(out/'report.json',report);progress('finished',learningSucceeded=report['learningSucceeded'],best=best)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error),'updatesCompleted':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);p.add_argument('--updates',type=int,default=8);p.add_argument('--resume');a=p.parse_args();run(a.tag,a.updates,a.resume)
