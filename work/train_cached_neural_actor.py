"""Fast private PPO-style actor updates with the native reservoir frozen.

Every new physical rollout still executes the actual MaleCNS graph. Recorded
features are reused only for motor/variance optimization and likelihood checks.
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
from recurrent_v3_policy_gradient import make_advantages
from train_learned_neural_variance import aggregate,safe_rank,noise_profile
from cached_neural_actor import CachedActor


def optimize(actor,advantages,state,epochs=16):
    parameters=[actor.motor,actor.variance];base=torch.cat([p.detach() for p in parameters]).clone()
    m=actor.tensor(state['m']);v=actor.tensor(state['v']);t=state['t'];history=[];best=base.clone();best_score=-float('inf')
    rates=actor.tensor(actor.exploration['initial']*65+[1.]*130)*.02
    def set_parameters(vector):
        with torch.no_grad():actor.motor.copy_(vector[:130]);actor.variance.copy_(vector[130:])
    a=actor.tensor(advantages)
    for epoch in range(epochs):
        for p in parameters:p.grad=None
        objective,old_kl=actor.objective(a);(-objective).backward()
        g=-torch.cat([p.grad for p in parameters]);t+=1;m=.9*m+.1*g;v=.999*v+.001*g*g
        delta=rates*(m/(1-.9**t))/((v/(1-.999**t)).sqrt()+1e-8)
        previous=torch.cat([p.detach() for p in parameters]).clone();accepted=None
        for fraction in [1.,.5,.25,.125,.0625]:
            proposal=(previous+fraction*delta).clamp(-8,8);set_parameters(proposal)
            with torch.no_grad():score,kl=actor.objective(a)
            if float(kl)<=.02 and float(score)>=float(objective.detach())-1e-12:
                accepted={'epoch':epoch+1,'fraction':fraction,'score':float(score),'kl':float(kl),'gradientNorm':float(g.norm())}
                if float(score)>best_score:best_score=float(score);best=proposal.clone()
                break
        if accepted is None:set_parameters(previous);break
        history.append(accepted)
    set_parameters(best if history else base)
    return {'m':m.detach().cpu().tolist(),'v':v.detach().cpu().tolist(),'t':t},history


def run(tag,updates,device='cuda:0',resume=None):
    if not tag.replace('-','').isalnum() or not 1<=updates<=32:raise ValueError('Scoped bounded run required')
    torch.set_num_threads(2);out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False)
    proof_path=ROOT/'.impeccable/review/learning-ml/v3-cached-actor-preflight-20261025-02/report.json'
    proof=json.loads(proof_path.read_text());assert proof['passed'] and proof['actorSourceSha256']==file_hash(ROOT/'work/cached_neural_actor.py')
    files=['work/train_cached_neural_actor.py','work/cached_neural_actor.py','work/learned_neural_exploration.py','work/neural_exploration_ar1.py',
           'work/recurrent_v3_policy_gradient.py','work/differentiable_v3_reservoir.py','work/train_learned_neural_variance.py',
           'work/recurrent_v3_learned_variance_gradient.py','work/neuronal_experiment_io.py','work/recurrent-v3-learned-variance-env.cjs',
           'work/verify_cached_neural_actor.py','outputs/progress-save.js','package.json',str(proof_path.relative_to(ROOT)),
           '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/zero-only.private.json',
           '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/report.json']
    code="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',code],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    config={'format':'learned-neural-log-sigma-v1','rho':.9,'floor':[.0001,.005],'ceiling':[.08,.5],
            'initial':[.003,.08],'weights':[0.]*130}
    settings={'device':device,'episodesPerUpdate':8,'trainingOffsets':[0,-.0025,.0025],'validationOffsets':[-.005,.005],
              'testOffsets':[-.004375,.004375],'initialExploration':copy.deepcopy(config),'optimizer':'full-batch-clipped-surrogate-Adam-vector-rates',
              'epochs':16,'learningRateFactor':.02,'maximumConditionalKL':.02,'candidateFractions':[1.,.3,.1],
              'gaeLambda':1.,'researchUnsafeTerminalCost':2000,'frozenNativePrefixCoefficients':72,'trainableCoefficients':260,
              'ar1GradientBoundary':'full-episode','maxSimulatedTicks':None}
    env=None;events=[];started=time.monotonic();start_index=0
    state={'m':[0.]*260,'v':[0.]*260,'t':0}
    def progress(phase,**extra):
        value={'phase':phase,'environmentPid':env.process.pid if env else None,'completedUpdates':len(events),
               'wallSeconds':time.monotonic()-started,**extra};atomic_json(out/'progress.json',value);print('CACHED_ACTOR_TRAIN '+json.dumps(value),flush=True)
    try:
        env=Pipe(ROOT/'work/recurrent-v3-learned-variance-env.cjs');meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        current=meta['genome']['policyWeights'][:];prefix=current[:72]
        def evaluate(weights):
            rows=[{'headingOffsetRad':h,'result':env.request('evaluate',weights=weights,configuration={'maxTicks':0,'headingOffsetRad':h})} for h in settings['trainingOffsets']]
            return rows,aggregate([r['result'] for r in rows])
        baseline,base_summary=evaluate(current);assert baseline[0]['result']=={k:meta['expected'][k] for k in baseline[0]['result']}
        best={'weights':current[:],'exploration':copy.deepcopy(config),'outcomes':baseline,'aggregate':base_summary,'source':'native-parent'}
        if resume:
            f=Path(resume).resolve();assert f.is_relative_to(ROOT);saved=json.loads(f.read_text())
            if saved['format']!='private-cached-neural-actor-checkpoint-v1' or saved['settings']!=settings or saved['sourceHashes']!=hashes or saved['rootParentSha256']!=meta['parentSha256']:raise ValueError('No silent cached-actor migration')
            current=saved['currentGenome']['policyWeights'];config=saved['currentExploration'];best=saved['bestSafe'];state=saved['optimizerState'];start_index=saved['nextUpdate']
            assert current[:72]==prefix and evaluate(best['weights'])[0]==best['outcomes']
        atomic_json(out/'identity.json',{'settings':settings,'sourceHashes':hashes,'parentSha256':meta['parentSha256'],'baseline':baseline,'baselineAggregate':base_summary,'startingUpdateIndex':start_index})
        for file in files:
            if file.startswith('work/'):(out/Path(file).name).write_bytes((ROOT/file).read_bytes())
        progress('baseline-verified',baselineAggregate=base_summary)
        for index in range(start_index,start_index+updates):
            env.request('clear');episodes=[]
            for lane,heading in enumerate([0,-.0025,.0025,0]):
                seed=90261025+index*1000003+lane*104729
                for sign in [1,-1]:
                    e=env.request('episode',configuration={'weights':current,'exploration':config,'seed':seed,'sign':sign,'headingOffsetRad':heading,'std':config['initial'],'safetyCost':2000,'maxTicks':0})
                    episodes.append(e);atomic_json(out/f'update-{index+1:02}-episode-{len(episodes):02}.private.json',e)
                    progress('episode-finished',update=index+1,episode=len(episodes),result=e['result'])
            advantages,advantage_metrics=make_advantages(episodes,gae_lambda=1.)
            actor=CachedActor({**meta,'genome':{**meta['genome'],'policyWeights':current}},episodes,config,device=device)
            before,initial_kl=actor.objective(advantages);assert abs(float(initial_kl.detach()))<1e-12
            update_started=time.perf_counter();state,history=optimize(actor,advantages,state,16)
            torch.cuda.synchronize() if device.startswith('cuda') else None
            optimizer_seconds=time.perf_counter()-update_started
            optimized=actor.native_weights();optimized_config=actor.exploration_config()
            score,kl=actor.objective(advantages)
            native=env.request('rescore',weights=optimized,advantages=advantages,configuration={'exploration':optimized_config})
            assert abs(native['meanGaussianKL']-float(kl.detach()))<1e-9 and abs(native['meanClippedSurrogate']-float(score.detach()))<1e-9
            assert native['neuronalHistoryMode']=='recorded-exact-frozen-adapter' and optimized[:72]==prefix
            candidates=[]
            for fraction in settings['candidateFractions']:
                weights=(np.asarray(current)+fraction*(np.asarray(optimized)-current)).tolist()
                candidate_config={**config,'weights':(np.asarray(config['weights'])+fraction*(np.asarray(optimized_config['weights'])-config['weights'])).tolist()}
                screen=env.request('rescore',weights=weights,advantages=advantages,configuration={'exploration':candidate_config})
                candidate={'fraction':fraction,'weights':weights,'exploration':candidate_config,'screen':screen}
                if screen['meanGaussianKL']<=.02+1e-12 and screen['meanClippedSurrogate']>float(before.detach())+1e-10:
                    outcomes,summary=evaluate(weights);candidate.update({'outcomes':outcomes,'aggregate':summary})
                    if summary['allSafe'] and safe_rank(summary)>safe_rank(best['aggregate']):best={'weights':weights[:],'exploration':copy.deepcopy(candidate_config),'outcomes':outcomes,'aggregate':summary,'source':f'update{index+1}:fraction{fraction}'}
                candidates.append(candidate);progress('candidate-finished',update=index+1,fraction=fraction,aggregate=candidate.get('aggregate'))
            eligible=[c for c in candidates if c.get('aggregate') and c['aggregate']['minimumProgress']>=base_summary['minimumProgress']*.2]
            accepted=max(eligible,key=lambda c:c['screen']['meanClippedSurrogate']) if eligible else None
            if accepted:current=accepted['weights'][:];config=copy.deepcopy(accepted['exploration'])
            assert current[:72]==prefix
            event={'update':index+1,'transitions':len(advantages),'optimizerSeconds':optimizer_seconds,'optimizerEpochs':history,
                   'nativeScreen':native,'advantageMetrics':advantage_metrics,'noiseProfile':noise_profile(episodes),'candidates':candidates,
                   'acceptedFraction':accepted['fraction'] if accepted else None,'acceptedAggregate':accepted.get('aggregate') if accepted else None,'bestSafe':best['aggregate'],
                   'episodes':[{k:e[k] for k in ['seed','sign','headingOffsetRad','result','controls','trainingReward','actionTraceSha256']} for e in episodes]}
            events.append(event);atomic_json(out/f'update-{index+1:02}.json',event)
            atomic_json(out/'checkpoint.private.json',{'format':'private-cached-neural-actor-checkpoint-v1','nextUpdate':index+1,
                        'currentGenome':{**meta['genome'],'policyWeights':current},'currentExploration':config,'bestSafe':best,'optimizerState':state,
                        'settings':settings,'sourceHashes':hashes,'rootParentSha256':meta['parentSha256'],'revision':meta['rewardRevision'],
                        'boundary':'Private motor130/variance130 PPO-style actor, native encoder72 fixed. New physical episodes run actual MaleCNS. Not an ordinary app save; current may regress and safe champion is separate.'})
            progress('update-finished',update=index+1,optimizerSeconds=optimizer_seconds,bestSafe=best['aggregate'])
            if best['aggregate']['minimumLaps']>=2:break
        proofs,summary=evaluate(best['weights']);assert proofs==best['outcomes'] and summary==best['aggregate']
        original=Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save');original_hash=file_hash(original)
        assert original_hash=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3' and all(file_hash(ROOT/f)==digest for f,digest in hashes.items())
        report={'format':'private-cached-neural-actor-training-v1','passed':True,'learningSucceeded':summary['allSafe'] and summary['minimumLaps']>=2,
                'updatesCompleted':len(events),'startingUpdateIndex':start_index,'trainingControls':sum(e['transitions'] for e in events),
                'baseline':baseline,'baselineAggregate':base_summary,'bestSafe':best,'finalResearchGenome':{**meta['genome'],'policyWeights':current},
                'finalResearchExploration':config,'settings':settings,'events':events,'sourceHashes':hashes,'nativeProofs':proofs,
                'originalSaveSha256':original_hash,'wallSeconds':time.monotonic()-started,
                'boundary':'Native reservoir still controls every fresh physical episode. Cached feature optimization is exact only for fixed72 prefix. Motor130 and variance130 updated via clipped Gaussian AR1 objective on full episodes,16 Adam epochs with KL/backtracking. Medium initial exploration differs from prior whole202 study, so no causal speed-to-learning comparison. No teacher/route, no app deployment; held-out offsets excluded.'}
        atomic_json(out/'report.json',report);progress('finished',passed=True,learningSucceeded=report['learningSucceeded'],bestSafe=summary)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error),'updatesCompleted':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);parser.add_argument('--updates',type=int,default=6)
    parser.add_argument('--device',choices=['cpu','cuda:0'],default='cuda:0');parser.add_argument('--resume');a=parser.parse_args();run(a.tag,a.updates,a.device,a.resume)
