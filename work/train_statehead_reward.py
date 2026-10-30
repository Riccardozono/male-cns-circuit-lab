"""Train the protected one-lap neural head using rewards and own real states.

Suffixes prune proposals only after the zero-gate prefix equivalence proof.
Every promoted champion is independently driven from the actual start line.
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
from neuronal_experiment_io import ROOT,NODE,Pipe,atomic_json,file_hash
from statehead_reward_actor import StateheadActor,advantages


def safe(result):return result['complete'] and result['reason'] not in ['urto','fuori pista','progresso non valido']
def rank(result):return result['laps'],result['bestProgress'],result['fitness']


def optimize(actor,a,state,epochs):
    params=[actor.motor,actor.variance];base=torch.cat([p.detach() for p in params]).clone();best=base.clone();best_score=-float('inf')
    m=actor.tensor(state['m']);v=actor.tensor(state['v']);t=state['t'];history=[]
    gain=actor.metadata['motorGain'];sigma=actor.exploration['initial']
    rates=actor.tensor([3*sigma[0]/(.2*gain),3*sigma[1]/gain]*9+[1.]*20)*.03
    def assign(vector):
        with torch.no_grad():actor.motor.copy_(vector[:18]);actor.variance.copy_(vector[18:])
    a=actor.tensor(a)
    for epoch in range(epochs):
        for p in params:p.grad=None
        score,_=actor.objective(a);(-score).backward();g=-torch.cat([p.grad for p in params]);t+=1
        m=.9*m+.1*g;v=.999*v+.001*g*g;delta=rates*(m/(1-.9**t))/((v/(1-.999**t)).sqrt()+1e-8)
        before=torch.cat([p.detach() for p in params]).clone();accepted=None
        for fraction in [1.,.5,.25,.125,.0625]:
            proposal=(before+fraction*delta).clamp(-8,8);assign(proposal)
            with torch.no_grad():value,kl=actor.objective(a)
            if float(kl)<=.02 and float(value)>=float(score.detach())-1e-12:
                accepted={'epoch':epoch+1,'fraction':fraction,'score':float(value),'kl':float(kl),'gradientNorm':float(g.norm())}
                if float(value)>best_score:best_score=float(value);best=proposal.clone()
                break
        if accepted is None:assign(before);break
        history.append(accepted)
    assign(best if history else base)
    return {'m':m.detach().cpu().tolist(),'v':v.detach().cpu().tolist(),'t':t},history


def run(tag,updates,device='cuda:0',resume=None):
    if not tag.replace('-','').isalnum() or not 1<=updates<=32:raise ValueError('Scoped bounded study required')
    torch.set_num_threads(2);out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False)
    base=out.parent;prefile=base/'statehead-reward-preflight-20261025-01/report.json';equivfile=base/'statehead-prefix-equivalence-20261025-01/report.json'
    calibration=base/'statehead-exploration-calibration-20261025-01';pre=json.loads(prefile.read_text());eq=json.loads(equivfile.read_text());cal=json.loads((calibration/'report.json').read_text())
    config=json.loads((calibration/'selected-exploration.private.json').read_text())
    assert pre['passed'] and eq['passed'] and cal['passed'] and eq['prefixControls']==8200 and eq['allContinuationRowsIdentical']
    assert pre['actorSourceSha256']==file_hash(ROOT/'work/statehead_reward_actor.py')
    files=['work/train_statehead_reward.py','work/statehead_reward_actor.py','work/learned_neural_exploration.py','work/neuronal_experiment_io.py',
           'work/statehead-reward-env.cjs','work/neural-statehead-rl-live.cjs','work/verify_statehead_reward_sampler.py',
           'work/verify_statehead_prefix_equivalence.py','work/calibrate_statehead_exploration.py','package.json','outputs/progress-save.js',
           str(prefile.relative_to(ROOT)),str(equivfile.relative_to(ROOT)),str((calibration/'report.json').relative_to(ROOT)),
           str((calibration/'selected-exploration.private.json').relative_to(ROOT)),
           '.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json',
           '.impeccable/review/learning-ml/statehead-best-fresh-replay-20261025-01/report.json']
    code="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',code],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    assert all(file_hash(ROOT/f)==h for f,h in pre['sourceHashes'].items())
    settings={'device':device,'episodesPerUpdate':8,'trainingResetMode':'observed-8200','epochs':24,'candidateFractions':[.03,.1,.3,1.],
              'initialExploration':copy.deepcopy(config),'meanCoefficients':18,'varianceCoefficients':20,'gamma':1.,'maximumConditionalKL':.02,
              'researchUnsafeTerminalCost':2000,'maxSimulatedTicks':None,'optimizer':'clipped-Gaussian-likelihood-Adam-vector-rates',
              'learningRateFactor':.03,'proofRequiredBeforePromotion':'fresh-full-from-line'}
    events=[];started=time.monotonic();env=None;start_index=0;state={'m':[0.]*38,'v':[0.]*38,'t':0}
    def progress(phase,**extra):
        value={'phase':phase,'environmentPid':env.process.pid if env else None,'completedUpdates':len(events),'wallSeconds':time.monotonic()-started,**extra}
        atomic_json(out/'progress.json',value);print('STATEHEAD_REWARD_TRAIN '+json.dumps(value),flush=True)
    try:
        env=Pipe(ROOT/'work/statehead-reward-env.cjs');meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        assert meta['parentSha256']==pre['parentSha256']==eq['parentSha256'] and meta['sourceHashes']==pre['sourceHashes']
        current=meta['weights'][:];baseline=meta['baseline']['observed'];best={'weights':current[:],'exploration':copy.deepcopy(config),'result':baseline,'fullFromLine':True,'source':'protected-parent'}
        if resume:
            f=Path(resume).resolve();assert f.is_relative_to(ROOT);saved=json.loads(f.read_text())
            if saved['format']!='private-statehead-reward-checkpoint-v1' or saved['settings']!=settings or saved['sourceHashes']!=hashes or saved['rootParentSha256']!=meta['parentSha256']:raise ValueError('No silent state-head migration')
            current=saved['currentWeights'];config=saved['currentExploration'];best=saved['bestFull'];state=saved['optimizerState'];start_index=saved['nextUpdate']
            assert env.request('evaluate',weights=best['weights'])==best['result']
        atomic_json(out/'identity.json',{'settings':settings,'sourceHashes':hashes,'parentSha256':meta['parentSha256'],'baseline':baseline,'startingUpdateIndex':start_index})
        for file in files:
            if file.startswith('work/'):(out/Path(file).name).write_bytes((ROOT/file).read_bytes())
        progress('baseline-verified',baseline=baseline)
        for index in range(start_index,start_index+updates):
            env.request('clear');episodes=[]
            for lane in range(4):
                seed=92261025+index*1000003+lane*104729
                for sign in [1,-1]:
                    e=env.request('episode',configuration={'weights':current,'exploration':config,'resetMode':'observed-8200','seed':seed,'sign':sign,'safetyCost':2000})
                    assert not e['fullFromLine'] and e['start']['laps']==1
                    episodes.append(e);atomic_json(out/f'update-{index+1:02}-episode-{len(episodes):02}.private.json',e)
                    progress('episode-finished',update=index+1,episode=len(episodes),additionalProgress=e['progressAfterReset'],newLaps=e['newLaps'],safe=e['safe'])
            a,adv_metrics=advantages(episodes);actor=StateheadActor(meta,episodes,current,config,device=device)
            before,initial_kl=actor.objective(a);assert abs(float(initial_kl.detach()))<1e-10
            update_start=time.perf_counter();state,history=optimize(actor,a,state,24)
            if device.startswith('cuda'):torch.cuda.synchronize()
            optimizer_seconds=time.perf_counter()-update_start;optimized=actor.native_weights();optimized_config=actor.exploration_config()
            score,kl=actor.objective(a);native=env.request('rescore',weights=optimized,advantages=a,configuration={'exploration':optimized_config})
            assert abs(native['meanGaussianKL']-float(kl.detach()))<1e-8 and abs(native['meanClippedSurrogate']-float(score.detach()))<1e-8
            candidates=[]
            for fraction in settings['candidateFractions']:
                weights=(np.asarray(current)+fraction*(np.asarray(optimized)-current)).tolist()
                cfg={**config,'weights':(np.asarray(config['weights'])+fraction*(np.asarray(optimized_config['weights'])-config['weights'])).tolist()}
                screen=env.request('rescore',weights=weights,advantages=a,configuration={'exploration':cfg});candidate={'fraction':fraction,'weights':weights,'exploration':cfg,'screen':screen}
                if screen['meanGaussianKL']<=.02+1e-10 and screen['meanClippedSurrogate']>float(before.detach())+1e-10:
                    local=env.request('evaluate',weights=weights,configuration={'resetMode':'observed-8200'});candidate['continuationResult']=local
                    if safe(local) and rank(local)>rank(best['result']):
                        progress('full-from-line-proof',update=index+1,fraction=fraction,continuation=local)
                        full=env.request('evaluate',weights=weights);assert full==local
                        candidate['fullFromLineResult']=full
                        best={'weights':weights[:],'exploration':copy.deepcopy(cfg),'result':full,'fullFromLine':True,'source':f'update{index+1}:fraction{fraction}'}
                candidates.append(candidate);progress('candidate-finished',update=index+1,fraction=fraction,continuation=candidate.get('continuationResult'),bestFull=best['result'])
            eligible=[c for c in candidates if c.get('continuationResult') and c['continuationResult']['laps']>=baseline['laps']]
            accepted=max(eligible,key=lambda c:c['screen']['meanClippedSurrogate']) if eligible else None
            if accepted:current=accepted['weights'][:];config=copy.deepcopy(accepted['exploration'])
            event={'update':index+1,'controls':sum(e['controls'] for e in episodes),'activeControls':adv_metrics['active'],'advantageMetrics':adv_metrics,
                   'optimizerSeconds':optimizer_seconds,'optimizerEpochs':history,'nativeScreen':native,'candidates':candidates,
                   'acceptedFraction':accepted['fraction'] if accepted else None,'acceptedResult':accepted.get('continuationResult') if accepted else None,
                   'bestFull':best['result'],'episodes':[{k:e[k] for k in ['seed','sign','resetMode','controls','result','start','newLaps','progressAfterReset','trainingReward','safe','traceSha256']} for e in episodes]}
            events.append(event);atomic_json(out/f'update-{index+1:02}.json',event)
            atomic_json(out/'checkpoint.private.json',{'format':'private-statehead-reward-checkpoint-v1','nextUpdate':index+1,'currentWeights':current,
                        'currentExploration':config,'bestFull':best,'optimizerState':state,'settings':settings,'sourceHashes':hashes,'rootParentSha256':meta['parentSha256'],
                        'boundary':'Own real-prefix data train only post-reset rewards; every promoted champion has a complete fresh from-line proof. Original frozen parent and ordinary5.6.0 save remain intact. Research-current may collide or regress.'})
            progress('update-finished',update=index+1,bestFull=best['result'],acceptedFraction=event['acceptedFraction'])
            if best['result']['laps']>=2:break
        final=env.request('evaluate',weights=best['weights']);assert final==best['result']
        current_full=env.request('evaluate',weights=current)
        original=Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save');original_hash=file_hash(original)
        assert original_hash=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3' and all(file_hash(ROOT/f)==h for f,h in hashes.items())
        report={'format':'private-statehead-reward-training-v1','passed':True,'learningSucceeded':safe(final) and final['laps']>=2,
                'approvedForApp':False,'updatesCompleted':len(events),'startingUpdateIndex':start_index,'trainingControls':sum(e['controls'] for e in events),
                'activeTrainingControls':sum(e['activeControls'] for e in events),'settings':settings,'baseline':baseline,'bestFull':best,'finalResearchWeights':current,
                'finalResearchExploration':config,'finalResearchFullResult':current_full,'events':events,'sourceHashes':hashes,'originalSaveSha256':original_hash,
                'cuda':env.request('stats'),'wallSeconds':time.monotonic()-started,
                'boundary':'Original one-lap state-head family, not native202/795m.38 trainable coefficients on actual9 neuronal features. Existing zero-gate prefix reuse is proved, not imposed as a new restriction. MonteCarlo neural critic and PPO-style clipped Gaussian objective. All selected champions and final researcher evaluated from line; inherited prefix laps never count as newly learned laps. Private format, no app deployment or source compatibility bypass.'}
        atomic_json(out/'report.json',report);progress('finished',passed=True,learningSucceeded=report['learningSucceeded'],bestFull=best['result'])
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error),'updatesCompleted':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);p.add_argument('--updates',type=int,default=3)
    p.add_argument('--device',choices=['cpu','cuda:0'],default='cuda:0');p.add_argument('--resume');a=p.parse_args();run(a.tag,a.updates,a.device,a.resume)
