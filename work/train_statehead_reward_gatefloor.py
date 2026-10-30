"""Train a migrated neural head with a small, explicitly research-only gate floor.

Every behavior episode and every promotion proof starts at the real start line.
The original gate-zero weights and global best remain archived separately.
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
def promotable_candidates(candidates,current_result):
    # Keep the absolute best as a separate archive. Training may move forward
    # in safe, measured steps, but every promoted policy must beat the current
    # policy on a complete replay from the line.
    return [c for c in candidates if c.get('fullFromLineResult')
            and safe(c['fullFromLineResult']) and rank(c['fullFromLineResult'])>rank(current_result)]


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


def run(tag,updates,device='cuda:0',resume=None,gate_floor=.001,progress_shaping_per_meter=1.0):
    if not tag.replace('-','').isalnum() or not 1<=updates<=32:raise ValueError('Scoped bounded study required')
    if not 0<gate_floor<=.01:raise ValueError('Gate-floor training requires a tested value in(0,0.01]')
    if not 0<=progress_shaping_per_meter<=5:raise ValueError('Bounded progress shaping required')
    torch.set_num_threads(2);out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False)
    base=out.parent;prefile=base/'statehead-reward-preflight-20261025-01/report.json';equivfile=base/'statehead-prefix-equivalence-20261025-01/report.json'
    calibration=base/'statehead-exploration-calibration-20261025-01';pre=json.loads(prefile.read_text());eq=json.loads(equivfile.read_text());cal=json.loads((calibration/'report.json').read_text())
    config=json.loads((calibration/'selected-exploration.private.json').read_text())
    assert pre['passed'] and eq['passed'] and cal['passed'] and eq['prefixControls']==8200 and eq['allContinuationRowsIdentical']
    assert pre['actorSourceSha256']==file_hash(ROOT/'work/statehead_reward_actor.py')
    files=['work/train_statehead_reward_safegate.py','work/train_statehead_reward_gatefloor.py','work/statehead_reward_actor.py','work/learned_neural_exploration.py','work/neuronal_experiment_io.py',
           'work/statehead-reward-env.cjs','work/statehead-reward-gate-env.cjs','work/neural-statehead-gate.cjs','work/neural-statehead-rl-live.cjs','work/verify_statehead_reward_sampler.py',
           'work/verify_statehead_prefix_equivalence.py','work/calibrate_statehead_exploration.py','package.json','outputs/progress-save.js',
           str(prefile.relative_to(ROOT)),str(equivfile.relative_to(ROOT)),str((calibration/'report.json').relative_to(ROOT)),
           str((calibration/'selected-exploration.private.json').relative_to(ROOT)),
           '.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json',
           '.impeccable/review/learning-ml/statehead-best-fresh-replay-20261025-01/report.json']
    code="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',code],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    assert all(file_hash(ROOT/f)==h for f,h in pre['sourceHashes'].items())
    settings={'device':device,'episodesPerUpdate':8,'trainingResetMode':'from-line-gate-floor','gateFloor':gate_floor,'noLapTerminalCost':4000,'progressShapingPerMeter':progress_shaping_per_meter,'epochs':24,'candidateFractions':[.03,.1,.3,1.],
              'initialExploration':copy.deepcopy(config),'meanCoefficients':18,'varianceCoefficients':20,'gamma':1.,'maximumConditionalKL':.02,
              'researchUnsafeTerminalCost':2000,'maxSimulatedTicks':None,'optimizer':'clipped-Gaussian-likelihood-Adam-vector-rates',
              'learningRateFactor':.03,'proofRequiredBeforePromotion':'fresh-full-from-line-under-same-gate-floor'}
    events=[];started=time.monotonic();env=None;start_index=0;state={'m':[0.]*38,'v':[0.]*38,'t':0};trainer_migration=None;settings_migration=None;checkpoint_provenance=None
    def progress(phase,**extra):
        value={'phase':phase,'environmentPid':env.process.pid if env else None,'completedUpdates':len(events),'wallSeconds':time.monotonic()-started,**extra}
        atomic_json(out/'progress.json',value);print('STATEHEAD_REWARD_TRAIN '+json.dumps(value),flush=True)
    try:
        env=Pipe(ROOT/'work/statehead-reward-gate-env.cjs');meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        assert meta['parentSha256']==pre['parentSha256']==eq['parentSha256']
        assert meta['sourceHashes']['work/neural-statehead-rl-live.cjs']==pre['sourceHashes']['work/neural-statehead-rl-live.cjs']
        current=meta['weights'][:];baseline=meta['baseline']['observed'];best={'weights':current[:],'exploration':copy.deepcopy(config),'result':baseline,'fullFromLine':True,'source':'protected-parent'}
        if resume:
            f=Path(resume).resolve();assert f.is_relative_to(ROOT);saved=json.loads(f.read_text())
            if saved['format']!='private-statehead-reward-checkpoint-v1' or saved['rootParentSha256']!=meta['parentSha256']:raise ValueError('No silent state-head migration')
            if saved['settings']!=settings:
                prior_settings=dict(saved['settings']);next_settings=dict(settings)
                prior_mode=prior_settings.pop('trainingResetMode',None);next_mode=next_settings.pop('trainingResetMode',None)
                prior_floor=prior_settings.pop('gateFloor',0);next_floor=next_settings.pop('gateFloor',None)
                prior_no_lap=prior_settings.pop('noLapTerminalCost',0);next_no_lap=next_settings.pop('noLapTerminalCost',None)
                prior_progress_shaping=prior_settings.pop('progressShapingPerMeter',0);next_progress_shaping=next_settings.pop('progressShapingPerMeter',None)
                prior_proof=prior_settings.pop('proofRequiredBeforePromotion',None);next_proof=next_settings.pop('proofRequiredBeforePromotion',None)
                if (prior_mode=='mixed-observed-7800-8200' and next_mode=='from-line-gate-floor' and prior_floor==0 and next_floor==gate_floor
                        and prior_proof=='fresh-full-from-line' and next_proof=='fresh-full-from-line-under-same-gate-floor' and prior_settings==next_settings):
                    settings_migration={'from':prior_mode,'to':next_mode,'fromGateFloor':prior_floor,'toGateFloor':next_floor,
                        'change':'Train antithetic episodes from the start line under the explicitly tested gate floor so early active-neuron states receive policy-gradient experience'}
                elif (prior_mode==next_mode=='from-line-gate-floor' and prior_floor==next_floor==gate_floor and prior_no_lap==0 and next_no_lap==4000
                        and prior_proof==next_proof=='fresh-full-from-line-under-same-gate-floor' and prior_settings==next_settings):
                    settings_migration={'kind':'no-lap-terminal-cost','fromNoLapCost':prior_no_lap,'toNoLapCost':next_no_lap,'gateFloor':gate_floor,
                        'change':'Subtract an explicit terminal reward when a from-line training episode ends without completing a lap; retain the stronger collision cost'}
                elif (prior_mode==next_mode=='from-line-gate-floor' and prior_floor==next_floor==gate_floor and prior_no_lap==next_no_lap==4000
                        and prior_progress_shaping==0 and next_progress_shaping==progress_shaping_per_meter
                        and prior_progress_shaping!=next_progress_shaping
                        and prior_proof==next_proof=='fresh-full-from-line-under-same-gate-floor' and prior_settings==next_settings):
                    settings_migration={'kind':'progress-difference-shaping','fromProgressShapingPerMeter':prior_progress_shaping,
                        'toProgressShapingPerMeter':next_progress_shaping,'noLapTerminalCost':next_no_lap,'gateFloor':gate_floor,
                        'change':'Add a per-meter reward only for new episode high-water progress; keep native rewards and terminal collision/no-lap costs separately recorded'}
                elif (prior_mode==next_mode=='from-line-gate-floor' and prior_floor==.001 and next_floor==.005 and gate_floor==.005
                        and prior_no_lap==next_no_lap==4000 and prior_progress_shaping==next_progress_shaping==progress_shaping_per_meter
                        and prior_proof==next_proof=='fresh-full-from-line-under-same-gate-floor' and prior_settings==next_settings):
                    settings_migration={'kind':'gate-authority-step','fromGateFloor':prior_floor,'toGateFloor':next_floor,
                        'previousPolicyFullResult':None,'noLapTerminalCost':next_no_lap,'progressShapingPerMeter':next_progress_shaping,
                        'change':'Train the unchanged policy under the next isolated authority level; reset optimizer moments and require full physical replay before promotion'}
                else:raise ValueError('Only the explicit mixed-context to from-line gate-floor migration is allowed')
            if saved['sourceHashes']!=hashes:
                prior=dict(saved['sourceHashes']);current_sources=dict(hashes)
                expected_new={'work/train_statehead_reward_gatefloor.py','work/statehead-reward-gate-env.cjs','work/neural-statehead-gate.cjs'}
                missing_new=expected_new-set(prior)
                if missing_new==expected_new:
                    added={key:current_sources.pop(key) for key in expected_new if key in current_sources}
                    if len(added)!=len(expected_new) or prior!=current_sources:
                        raise ValueError('Gate-floor migration source delta does not match the reviewed research files')
                    trainer_migration={'from':'train_statehead_reward_safegate.py','fromSha256':saved['sourceHashes'].get('work/train_statehead_reward_safegate.py'),
                        'to':'train_statehead_reward_gatefloor.py','toSha256':hashes['work/train_statehead_reward_gatefloor.py'],
                        'newGateEnvironmentSha256':hashes['work/statehead-reward-gate-env.cjs'],'newStateHeadSha256':hashes['work/neural-statehead-gate.cjs'],
                        'change':'Keep prior accepted coefficients; add a separately hashed research gate-floor path and train from the start line'}
                else:
                    changed=[key for key in prior.keys()|current_sources.keys() if prior.get(key)!=current_sources.get(key)]
                    if settings_migration and settings_migration.get('kind') in ('no-lap-terminal-cost','progress-difference-shaping'):
                        if set(changed)!={'work/train_statehead_reward_gatefloor.py','work/statehead-reward-gate-env.cjs'}:
                            raise ValueError('No-lap-cost migration source delta is not the reviewed research trainer/environment pair')
                        migration_label='per-meter progress shaping' if settings_migration.get('kind')=='progress-difference-shaping' else 'no-lap terminal cost'
                        destination_label='progress shaping' if settings_migration.get('kind')=='progress-difference-shaping' else 'no-lap terminal cost'
                        trainer_migration={'from':f'gate-floor PPO without {migration_label}','fromTrainerSha256':prior['work/train_statehead_reward_gatefloor.py'],
                            'to':f'gate-floor PPO with {destination_label}','toTrainerSha256':current_sources['work/train_statehead_reward_gatefloor.py'],
                            'fromEnvironmentSha256':prior['work/statehead-reward-gate-env.cjs'],'toEnvironmentSha256':current_sources['work/statehead-reward-gate-env.cjs'],
                            'change':'Keep the prior verified policy and full physical proof gate; record native reward separately from the new bounded distance-difference training reward'}
                    elif settings_migration and settings_migration.get('kind')=='gate-authority-step':
                        if set(changed)!={'work/train_statehead_reward_gatefloor.py'}:
                            raise ValueError('Gate-authority step may change only the reviewed research trainer')
                        trainer_migration={'from':'gate-floor PPO with staged authority 0.001','fromTrainerSha256':prior['work/train_statehead_reward_gatefloor.py'],
                            'to':'gate-floor PPO with staged authority 0.005','toTrainerSha256':current_sources['work/train_statehead_reward_gatefloor.py'],
                            'change':'Verify the saved 0.001 replay, retain its policy and protected gate-zero best, then train and physically prove candidates at 0.005'}
                    elif saved['settings']!=settings or set(changed)!={'work/train_statehead_reward_gatefloor.py'}:
                        raise ValueError('Only the reviewed same-branch candidate-replay trainer update is allowed')
                    else:
                        trainer_migration={'from':'train_statehead_reward_gatefloor.py','fromSha256':prior['work/train_statehead_reward_gatefloor.py'],
                            'to':'train_statehead_reward_gatefloor.py','toSha256':current_sources['work/train_statehead_reward_gatefloor.py'],
                            'change':'Physically replay every PPO-eligible step fraction before promotion; preserve the current gate-floor policy and reset optimizer moments'}
            same_branch=saved['settings']==settings and saved['sourceHashes']==hashes
            checkpoint_provenance={'path':str(f.relative_to(ROOT)),'sha256':file_hash(f),'previousNextUpdate':saved['nextUpdate'],
                'previousGateFloor':saved['settings'].get('gateFloor',0),'previousCurrentFull':saved['currentFull']}
            current=saved['currentWeights'];config=saved['currentExploration']
            current_full=env.request('evaluate',weights=current,configuration={'gateFloor':gate_floor})
            if same_branch:
                assert current_full==saved['currentFull']
                state=saved['optimizerState'];start_index=saved['nextUpdate'];best=saved['bestFull']
                assert env.request('evaluate',weights=best['weights'],configuration={'gateFloor':gate_floor})==best['result']
                protected_original_best=saved.get('protectedOriginalBestGateZero')
            elif settings_migration is None and saved['settings']==settings:
                # Preserve the reviewed policy and its best score across the
                # narrow trainer-only change, but restart Adam after promotion.
                assert current_full==saved['currentFull']
                state={'m':[0.]*38,'v':[0.]*38,'t':0};start_index=saved['nextUpdate'];best=saved['bestFull']
                assert env.request('evaluate',weights=best['weights'],configuration={'gateFloor':gate_floor})==best['result']
                protected_original_best=saved.get('protectedOriginalBestGateZero')
            elif settings_migration and settings_migration.get('kind') in ('no-lap-terminal-cost','progress-difference-shaping'):
                assert current_full==saved['currentFull']
                state={'m':[0.]*38,'v':[0.]*38,'t':0};start_index=saved['nextUpdate'];best=saved['bestFull']
                assert env.request('evaluate',weights=best['weights'],configuration={'gateFloor':gate_floor})==best['result']
                protected_original_best=saved.get('protectedOriginalBestGateZero')
            elif settings_migration and settings_migration.get('kind')=='gate-authority-step':
                prior_floor=settings_migration['fromGateFloor']
                previous_policy_result=env.request('evaluate',weights=current,configuration={'gateFloor':prior_floor})
                assert previous_policy_result==saved['currentFull']
                settings_migration['previousPolicyFullResult']=previous_policy_result
                state={'m':[0.]*38,'v':[0.]*38,'t':0};start_index=saved['nextUpdate']
                best={'weights':current[:],'exploration':copy.deepcopy(config),'result':current_full,'fullFromLine':True,'source':'previous-policy-under-next-authority-level'}
                protected_original_best=saved.get('protectedOriginalBestGateZero')
            else:
                # Gate semantics and training-state distribution changed. Keep
                # accepted coefficients but reset Adam moments and update numbering.
                state={'m':[0.]*38,'v':[0.]*38,'t':0};start_index=0
                best={'weights':current[:],'exploration':copy.deepcopy(config),'result':current_full,'fullFromLine':True,'source':'previous-accepted-weights-under-gate-floor'}
                protected_original_best=saved['bestFull']['result']
        else:
            current_full=env.request('evaluate',weights=current,configuration={'gateFloor':gate_floor})
            best={'weights':current[:],'exploration':copy.deepcopy(config),'result':current_full,'fullFromLine':True,'source':'protected-parent-under-gate-floor'}
            protected_original_best=None
        initial_gate_floor_result=current_full
        atomic_json(out/'identity.json',{'settings':settings,'sourceHashes':hashes,'parentSha256':meta['parentSha256'],'baselineGateZero':baseline,'initialGateFloorResult':initial_gate_floor_result,'startingUpdateIndex':start_index,'checkpointProvenance':checkpoint_provenance})
        for file in files:
            if file.startswith('work/'):(out/Path(file).name).write_bytes((ROOT/file).read_bytes())
        progress('baseline-verified',baseline=baseline)
        for index in range(start_index,start_index+updates):
            env.request('clear');episodes=[]
            for lane in range(4):
                seed=92261025+index*1000003+lane*104729
                reset_mode='from-line'
                for sign in [1,-1]:
                    e=env.request('episode',configuration={'weights':current,'exploration':config,'resetMode':reset_mode,'gateFloor':gate_floor,'seed':seed,'sign':sign,'safetyCost':2000,'noLapCost':settings['noLapTerminalCost'],'progressShapingPerMeter':settings['progressShapingPerMeter']})
                    assert e['fullFromLine'] and e['start']['laps']==0 and e['gateFloor']==gate_floor
                    episodes.append(e);atomic_json(out/f'update-{index+1:02}-episode-{len(episodes):02}.private.json',e)
                    progress('episode-finished',update=index+1,episode=len(episodes),additionalProgress=e['progressAfterReset'],newLaps=e['newLaps'],safe=e['safe'])
            a,adv_metrics=advantages(episodes);actor=StateheadActor(meta,episodes,current,config,device=device)
            before,initial_kl=actor.objective(a);assert abs(float(initial_kl.detach()))<1e-10
            update_start=time.perf_counter();state,history=optimize(actor,a,state,24)
            if device.startswith('cuda'):torch.cuda.synchronize()
            optimizer_seconds=time.perf_counter()-update_start;optimized=actor.native_weights();optimized_config=actor.exploration_config()
            score,kl=actor.objective(a);native=env.request('rescore',weights=optimized,advantages=a,configuration={'exploration':optimized_config})
            assert abs(native['meanGaussianKL']-float(kl.detach()))<1e-8 and abs(native['meanClippedSurrogate']-float(score.detach()))<1e-8
            candidates=[];current_before=current_full
            for fraction in settings['candidateFractions']:
                weights=(np.asarray(current)+fraction*(np.asarray(optimized)-current)).tolist()
                cfg={**config,'weights':(np.asarray(config['weights'])+fraction*(np.asarray(optimized_config['weights'])-config['weights'])).tolist()}
                screen=env.request('rescore',weights=weights,advantages=a,configuration={'exploration':cfg});candidate={'fraction':fraction,'weights':weights,'exploration':cfg,'screen':screen}
                if screen['meanGaussianKL']<=.02+1e-10 and screen['meanClippedSurrogate']>float(before.detach())+1e-10:
                    candidate['surrogateEligible']=True
                candidates.append(candidate);progress('candidate-screened',update=index+1,fraction=fraction,screen=screen,surrogateEligible=candidate.get('surrogateEligible',False))
            surrogate_eligible=[c for c in candidates if c.get('surrogateEligible')]
            for proof_candidate in surrogate_eligible:
                proof_candidate['fullFromLineResult']=env.request('evaluate',weights=proof_candidate['weights'],configuration={'gateFloor':gate_floor})
                progress('full-from-line-proof',update=index+1,fraction=proof_candidate['fraction'],gateFloor=gate_floor,result=proof_candidate['fullFromLineResult'])
            eligible=promotable_candidates(candidates,current_before)
            accepted=max(eligible,key=lambda c:(rank(c['fullFromLineResult']),c['screen']['meanClippedSurrogate'])) if eligible else None
            if accepted:
                current=accepted['weights'][:];config=copy.deepcopy(accepted['exploration']);current_full=accepted['fullFromLineResult']
                if rank(current_full)>rank(best['result']):
                    best={'weights':current[:],'exploration':copy.deepcopy(config),'result':current_full,'fullFromLine':True,'source':f'update{index+1}:fraction{accepted["fraction"]}'}
            event={'update':index+1,'controls':sum(e['controls'] for e in episodes),'activeControls':adv_metrics['active'],'advantageMetrics':adv_metrics,
                   'optimizerSeconds':optimizer_seconds,'optimizerEpochs':history,'nativeScreen':native,'candidates':candidates,
                   'acceptedFraction':accepted['fraction'] if accepted else None,'acceptedResult':accepted.get('continuationResult') if accepted else None,
                   'currentFullBefore':current_before,'currentFullAfter':current_full,'bestFull':best['result'],
                   'episodes':[{k:e[k] for k in ['seed','sign','resetMode','controls','result','start','newLaps','progressAfterReset','trainingReward','safe','traceSha256']} for e in episodes]}
            events.append(event);atomic_json(out/f'update-{index+1:02}.json',event)
            atomic_json(out/'checkpoint.private.json',{'format':'private-statehead-reward-checkpoint-v1','nextUpdate':index+1,'currentWeights':current,'currentFull':current_full,
                        'currentExploration':config,'bestFull':best,'protectedOriginalBestGateZero':protected_original_best,'optimizerState':state,'settings':settings,'sourceHashes':hashes,'rootParentSha256':meta['parentSha256'],
                        'boundary':'Own real-prefix data train only post-reset rewards; current weights advance only after a safe complete fresh from-line replay beats the previously verified current policy. Absolute best, frozen parent and ordinary5.6.0 save remain intact.'})
            progress('update-finished',update=index+1,bestFull=best['result'],acceptedFraction=event['acceptedFraction'])
            if best['result']['laps']>=2:break
        final=env.request('evaluate',weights=best['weights'],configuration={'gateFloor':gate_floor});assert final==best['result']
        final_current_full=env.request('evaluate',weights=current,configuration={'gateFloor':gate_floor});assert final_current_full==current_full
        original=Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save');original_hash=file_hash(original)
        assert original_hash=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3' and all(file_hash(ROOT/f)==h for f,h in hashes.items())
        report={'format':'private-statehead-reward-gate-floor-training-v1','passed':True,'learningSucceeded':safe(final) and final['laps']>=2,
                'approvedForApp':False,'trainerMigration':trainer_migration,'settingsMigration':settings_migration,'trainerSelectionGuard':'safe full-from-line physical improvement over current policy; absolute best preserved separately','updatesCompleted':len(events),'startingUpdateIndex':start_index,'trainingControls':sum(e['controls'] for e in events),
                'activeTrainingControls':sum(e['activeControls'] for e in events),'settings':settings,'baselineGateZero':baseline,'initialGateFloorResult':initial_gate_floor_result,'bestFull':best,'protectedOriginalBestGateZero':protected_original_best,'checkpointProvenance':checkpoint_provenance,'finalResearchWeights':current,
                'finalResearchExploration':config,'finalResearchFullResult':final_current_full,'events':events,'sourceHashes':hashes,'originalSaveSha256':original_hash,
                'cuda':env.request('stats'),'wallSeconds':time.monotonic()-started,
                'boundary':'Research-only gate-floor decoder. Retains original MaleCNS parent and prior accepted18 state-head weights; optional floor applies only when the original radial gate is zero and actual brain activity is present. From-line episodes use a separately logged per-meter new-high-water progress bonus plus an explicit no-lap terminal cost of4000 and collision cost of2000. Four paired antithetic episodes per update start at the real line. Every PPO-eligible fraction is replayed from the line; only safe physical improvements can advance. Prior global best under gate zero is separately archived. No app deployment, save mutation or compatibility bypass.'}
        atomic_json(out/'report.json',report);progress('finished',passed=True,learningSucceeded=report['learningSucceeded'],bestFull=best['result'])
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error),'updatesCompleted':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);p.add_argument('--updates',type=int,default=4)
    p.add_argument('--device',choices=['cpu','cuda:0'],default='cuda:0');p.add_argument('--resume');p.add_argument('--gate-floor',type=float,default=.001);p.add_argument('--progress-shaping-per-meter',type=float,default=1.0);a=p.parse_args();run(a.tag,a.updates,a.device,a.resume,a.gate_floor,a.progress_shaping_per_meter)
