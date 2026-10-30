"""Whole-course recurrent policy gradients on the native 202-parameter V3.

No protected prefix, outer context heads, route inputs or desired action labels.
The current research policy may regress; the all-domain safe champion is separate.
"""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import json
import subprocess
import time
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from recurrent_v3_policy_gradient import make_advantages, gradient, natural_direction


def aggregate(rows):
    if not rows or any(r['censored'] for r in rows):
        raise ValueError('Complete physical domain outcomes required')
    return {'allSafe':all(r['safe'] for r in rows),'minimumLaps':min(r['laps'] for r in rows),
            'minimumProgress':min(r['bestProgress'] for r in rows),'meanProgress':float(np.mean([r['bestProgress'] for r in rows])),
            'meanFitness':float(np.mean([r['fitness'] for r in rows]))}


def safe_rank(a):
    return (a['minimumLaps'],a['minimumProgress'] if a['minimumLaps']<2 else a['meanFitness'],a['meanFitness'])


def run(tag,updates,device='cuda:0',resume=None):
    if not tag.replace('-','').isalnum() or not 1<=updates<=32:
        raise ValueError('Bounded named global study required')
    out=ROOT/'.impeccable/review/learning-ml'/tag
    out.mkdir(exist_ok=False)
    calibration_dir=ROOT/'.impeccable/review/learning-ml/v3-global-exploration-calibration-20261024-01'
    config_file=calibration_dir/'selected-exploration.private.json'
    calibration=json.loads((calibration_dir/'report.json').read_text())
    config=json.loads(config_file.read_text())
    preflight_file=ROOT/'.impeccable/review/learning-ml/v3-global-gradient-preflight-20261024-01/report.json'
    preflight=json.loads(preflight_file.read_text())
    if not calibration['passed'] or not preflight['passed'] or config!=calibration['selected']['exploration'] or any(config['direction']) or config['floor']!=config['ceiling']:
        raise ValueError('Verified whole-course exploration required')
    files=['work/train_global_neural_policy.py','work/recurrent-v3-global-env.cjs','work/recurrent_v3_policy_gradient.py',
           'work/differentiable_v3_reservoir.py','work/neural_exploration_ar1.py','work/neuronal_experiment_io.py',
           'work/verify_global_neural_gradient.py','outputs/progress-save.js','package.json',str(config_file.relative_to(ROOT)),
           str((calibration_dir/'report.json').relative_to(ROOT)),str(preflight_file.relative_to(ROOT)),
           '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/zero-only.private.json',
           '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/report.json']
    closure="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',closure],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    save=Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
    save_hash=file_hash(save)
    assert save_hash=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
    env=None;events=[];start_index=0;started=time.monotonic()
    settings={'updatesRequested':updates,'episodesPerUpdate':8,'chunkControls':32,'device':device,
              'trainingOffsets':[0,-.0025,.0025],'validationOffsets':[-.005,.005],'testOffsets':[-.00375,.00375],
              'exploration':config,'researchUnsafeTerminalCost':2000,'gaeLambda':.95,'gamma':1.,'fisherDamping':.1,
              'steps':[.003,.01,.03,.1,.3,1.],'maximumNativeConditionalKL':.03,
              'minimumResearchProgressFraction':.2,'maxSimulatedTicks':None,'learnedCoefficients':202,'frozenPrefix':False}
    def progress(phase,**extra):
        value={'phase':phase,'completedUpdates':len(events),'nextGlobalUpdate':start_index+len(events)+1,
               'environmentPid':env.process.pid if env else None,'wallSeconds':time.monotonic()-started,**extra}
        atomic_json(out/'progress.json',value)
        print('GLOBAL_TRAIN '+json.dumps(value),flush=True)
    try:
        env=Pipe(ROOT/'work/recurrent-v3-global-env.cjs')
        meta=env.metadata
        assert meta['globalPolicy'] and meta['rewardRevision']=='progress-3-local-continuity-private-20261024'
        atomic_json(out/'metadata.private.json',meta)
        current=meta['genome']['policyWeights'][:]
        def evaluate(weights):
            rows=[]
            for heading in settings['trainingOffsets']:
                result=env.request('evaluate',weights=weights,configuration={'maxTicks':0,'headingOffsetRad':heading})
                rows.append({'headingOffsetRad':heading,'result':result})
            return rows,aggregate([r['result'] for r in rows])
        baseline,baseline_summary=evaluate(current)
        assert baseline[0]['result']=={k:meta['expected'][k] for k in baseline[0]['result']}
        best={'weights':current[:],'outcomes':baseline,'aggregate':baseline_summary,'source':'native-global-parent'}
        if resume:
            checkpoint_file=Path(resume).resolve()
            if not checkpoint_file.is_relative_to(ROOT):
                raise ValueError('Only scoped private checkpoints may be resumed')
            checkpoint=json.loads(checkpoint_file.read_text())
            if checkpoint['format']!='private-global-neural-policy-checkpoint-v1' or checkpoint['rootParentSha256']!=meta['parentSha256'] or checkpoint['sourceHashes']!=hashes:
                raise ValueError('No silent source/model migration')
            old_settings={k:v for k,v in checkpoint['settings'].items() if k!='updatesRequested'}
            if old_settings!={k:v for k,v in settings.items() if k!='updatesRequested'}:
                raise ValueError('Exploration/domain/optimizer identity changed')
            current=checkpoint['currentGenome']['policyWeights'][:]
            best=checkpoint['bestSafe']
            start_index=checkpoint['nextUpdate']
            reproduced,_=evaluate(best['weights'])
            assert reproduced==best['outcomes']
        atomic_json(out/'identity.json',{'settings':settings,'sourceHashes':hashes,'parentSha256':meta['parentSha256'],
                    'baseline':baseline,'baselineAggregate':baseline_summary,'startingUpdateIndex':start_index})
        for file in files:
            if file.startswith('work/'):
                (out/Path(file).name).write_bytes((ROOT/file).read_bytes())
        progress('baseline-verified',baselineAggregate=baseline_summary,currentParent=meta['parentSha256'])
        for index in range(start_index,start_index+updates):
            env.request('clear')
            episodes=[]
            for lane,heading in enumerate([0,-.0025,.0025,0]):
                seed=20261024+index*1000003+lane*104729
                for sign in [1,-1]:
                    progress('full-course-episode',update=index+1,lane=lane,headingOffsetRad=heading,seed=seed,sign=sign)
                    episode=env.request('episode',configuration={'weights':current,'seed':seed,'sign':sign,'headingOffsetRad':heading,
                        'exploration':config,'std':config['floor'],'chunkSize':settings['chunkControls'],
                        'safetyCost':settings['researchUnsafeTerminalCost'],'maxTicks':0})
                    if episode['result']['censored']:
                        raise ValueError('No censored learning terminal')
                    episodes.append(episode)
                    atomic_json(out/f'update-{index+1:02}-episode-{len(episodes):02}.private.json',episode)
                    progress('episode-finished',update=index+1,episode=len(episodes),result=episode['result'],trainingReward=episode['trainingReward'])
            advantages,advantage_metrics=make_advantages(episodes,gae_lambda=settings['gaeLambda'])
            actor_meta={**meta,'genome':{**meta['genome'],'policyWeights':current}}
            def chunks_done(chunks,transitions,error):
                if chunks%32==0:
                    progress('recurrent-gradient',update=index+1,device=device,chunks=chunks,transitions=transitions,maximumNativeMeanError=error)
            direction,metrics=gradient(actor_meta,episodes,advantages,chunks_done,device=device,estimate_fisher=True)
            fisher=metrics.pop('chunkEmpiricalFisher')
            delta,natural_metrics=natural_direction(actor_meta,direction,fisher,settings['fisherDamping'])
            atomic_json(out/f'update-{index+1:02}-gradient.private.json',{'gradient':direction.tolist(),'fisher':fisher,
                        'naturalDirection':delta.tolist(),'metrics':metrics,'naturalMetrics':natural_metrics})
            initial=env.request('rescore',weights=current,advantages=advantages)
            assert initial['meanGaussianKL']==0
            candidates=[]
            for step in settings['steps']:
                weights=np.clip(np.asarray(current)+step*delta,-8,8).tolist()
                progress('native-history-screen',update=index+1,step=step)
                screen=env.request('rescore',weights=weights,advantages=advantages)
                candidate={'step':step,'weights':weights,'screen':screen}
                if screen['meanGaussianKL']<=settings['maximumNativeConditionalKL'] and screen['meanClippedSurrogate']>initial['meanClippedSurrogate']+1e-10:
                    outcomes,summary=evaluate(weights)
                    candidate.update({'outcomes':outcomes,'aggregate':summary})
                    if summary['allSafe'] and safe_rank(summary)>safe_rank(best['aggregate']):
                        best={'weights':weights[:],'outcomes':outcomes,'aggregate':summary,'source':f'update{index+1}:step{step}'}
                candidates.append(candidate)
                progress('candidate-finished',update=index+1,step=step,screen=screen,aggregate=candidate.get('aggregate'))
            eligible=[c for c in candidates if c.get('aggregate') and c['aggregate']['minimumProgress']>=baseline_summary['minimumProgress']*settings['minimumResearchProgressFraction']]
            accepted=max(eligible,key=lambda c:c['screen']['meanClippedSurrogate']) if eligible else None
            if accepted:
                current=accepted['weights'][:]
            event={'update':index+1,'transitions':len(advantages),'advantageMetrics':advantage_metrics,'gradientMetrics':metrics,'naturalMetrics':natural_metrics,
                   'episodes':[{k:e[k] for k in ['seed','sign','headingOffsetRad','result','controls','trainingReward','actionTraceSha256']} for e in episodes],
                   'candidates':candidates,'acceptedStep':accepted['step'] if accepted else None,
                   'acceptedAggregate':accepted['aggregate'] if accepted else None,'bestSafe':best['aggregate']}
            events.append(event)
            atomic_json(out/f'update-{index+1:02}.json',event)
            atomic_json(out/'checkpoint.private.json',{'format':'private-global-neural-policy-checkpoint-v1','nextUpdate':index+1,
                        'currentGenome':{**meta['genome'],'policyWeights':current},'bestSafe':best,'settings':settings,
                        'rootParentSha256':meta['parentSha256'],'sourceHashes':hashes,'revision':meta['rewardRevision'],
                        'boundary':'Private whole-course RL checkpoint, not an app save. Research current may be unsafe or weaker; all-domain safe champion remains separate.'})
            progress('update-finished',update=index+1,acceptedStep=event['acceptedStep'],acceptedAggregate=event['acceptedAggregate'],bestSafe=best['aggregate'])
            if best['aggregate']['minimumLaps']>=2:
                break
        proofs,proof_summary=evaluate(best['weights'])
        assert proofs==best['outcomes'] and proof_summary==best['aggregate']
        assert file_hash(save)==save_hash and all(file_hash(ROOT/f)==digest for f,digest in hashes.items())
        report={'format':'private-global-neural-policy-training-v1','passed':True,
                'learningSucceeded':best['aggregate']['allSafe'] and best['aggregate']['minimumLaps']>=2,
                'singleStartImproved':best['aggregate']['minimumProgress']>baseline_summary['minimumProgress']+1,
                'baseline':baseline,'baselineAggregate':baseline_summary,'settings':settings,'updatesCompleted':len(events),
                'startingUpdateIndex':start_index,'trainingControls':sum(e['transitions'] for e in events),'bestSafe':best,
                'finalResearchGenome':{**meta['genome'],'policyWeights':current},'nativeProofs':proofs,'events':events,
                'sourceHashes':hashes,'originalSaveSha256':save_hash,'wallSeconds':time.monotonic()-started,
                'boundary':'Same V3 anatomy, all202parameters can adapt throughout the episode. Native zero-only parent near795m, not the distinct935m context decoder. Constant correlated action exploration, physical start perturbations not policy inputs, no frozen prefix or teacher. Corrected private geometry revision and no app deployment. Truncated recurrent gradient/chunk Fisher and gain-quantization STE remain approximations. Validation/test offsets not evaluated by trainer.'}
        atomic_json(out/'report.json',report)
        progress('finished',passed=True,learningSucceeded=report['learningSucceeded'],bestSafe=best['aggregate'],report=str(out/'report.json'))
    except BaseException as error:
        atomic_json(out/'failure.json',{'error':repr(error),'updatesCompleted':len(events)})
        raise
    finally:
        if env:
            env.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--tag',required=True)
    parser.add_argument('--updates',type=int,default=4)
    parser.add_argument('--device',choices=['cpu','cuda:0'],default='cuda:0')
    parser.add_argument('--resume')
    args=parser.parse_args()
    run(args.tag,args.updates,args.device,args.resume)
