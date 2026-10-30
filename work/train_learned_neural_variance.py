"""Private native-V3 mean/variance reward-gradient study on the user's GPU.

Joint332 likelihood gradients, complete from-line physical evaluations, and a
first-batch frozen-variance control. No teacher, route input or frozen prefix.
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
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from recurrent_v3_policy_gradient import make_advantages, natural_direction
from recurrent_v3_learned_variance_gradient import gradient


def aggregate(rows):
    if not rows or any(r['censored'] for r in rows):
        raise ValueError('Complete physical outcomes required')
    return {'allSafe':all(r['safe'] for r in rows),'minimumLaps':min(r['laps'] for r in rows),
            'minimumProgress':min(r['bestProgress'] for r in rows),'meanProgress':float(np.mean([r['bestProgress'] for r in rows])),
            'meanFitness':float(np.mean([r['fitness'] for r in rows]))}


def safe_rank(value):
    return value['minimumLaps'],value['minimumProgress'] if value['minimumLaps']<2 else value['meanFitness'],value['meanFitness']


def noise_profile(episodes):
    groups={'all':[],'firstHalf':[],'lastQuarter':[]};braking=0;gas_probes=0
    for e in episodes:
        rows=[r for c in e['chunks'] for r in c['rows']]
        for j,row in enumerate(rows):
            groups['all'].append(row['sigma'])
            if j<len(rows)/2:groups['firstHalf'].append(row['sigma'])
            if j>=len(rows)*.75:groups['lastQuarter'].append(row['sigma'])
            if row['mean'][1]<-.06:
                braking+=1;gas_probes+=row['commands'][1]>.005
    return {'sigma':{name:{'minimum':np.min(values,axis=0).tolist(),'maximum':np.max(values,axis=0).tolist(),
                           'mean':np.mean(values,axis=0).tolist()} for name,values in groups.items()},
            'brakingContexts':braking,'gasProbesDuringBraking':gas_probes}


def run(tag,updates,device,resume=None):
    if not tag.replace('-','').isalnum() or not 1<=updates<=16:
        raise ValueError('Scoped bounded study required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False)
    preflight_path=ROOT/'.impeccable/review/learning-ml/v3-learned-variance-preflight-20261024-02/report.json'
    preflight=json.loads(preflight_path.read_text())
    if not preflight['passed'] or preflight['fisherShape']!=[332,332] or not preflight['initialDeterministicIdentity']:
        raise ValueError('Verified native/CUDA mean-and-variance preflight required')
    files=['work/train_learned_neural_variance.py','work/recurrent-v3-learned-variance-env.cjs','work/learned_neural_exploration.py',
           'work/recurrent_v3_learned_variance_gradient.py','work/recurrent_v3_policy_gradient.py','work/neural_exploration_ar1.py',
           'work/differentiable_v3_reservoir.py','work/neuronal_experiment_io.py','work/verify_learned_neural_variance.py',
           'outputs/progress-save.js','package.json',str(preflight_path.relative_to(ROOT)),
           '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/zero-only.private.json',
           '.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/report.json']
    closure="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',closure],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    original=Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save');original_hash=file_hash(original)
    assert original_hash=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
    settings={'episodesPerUpdate':8,'trainingOffsets':[0,-.0025,.0025],'validationOffsets':[-.005,.005],
              'testOffsets':[-.004375,.004375],'steps':[.003,.01,.03,.1,.3,1.],'chunkControls':32,'gaeLambda':1.,
              'researchUnsafeTerminalCost':2000,'maximumNativeConditionalKL':.03,'fisherDamping':.1,
              'minimumResearchProgressFraction':.2,'device':device,'maxSimulatedTicks':None,'learnedCoefficients':332,
              'firstBatchFrozenVarianceControl':True,'varianceScales':1.,'frozenPrefix':False}
    initial_exploration={'format':'learned-neural-log-sigma-v1','rho':.9,'floor':[.0001,.005],'ceiling':[.08,.5],
                         'initial':[.0015,.04],'weights':[0.]*130}
    settings['initialExploration']=initial_exploration
    env=None;events=[];start_index=0;started=time.monotonic()
    def progress(phase,**extra):
        value={'phase':phase,'completedUpdates':len(events),'environmentPid':env.process.pid if env else None,
               'wallSeconds':time.monotonic()-started,**extra}
        atomic_json(out/'progress.json',value);print('LEARNED_VARIANCE_TRAIN '+json.dumps(value),flush=True)
    try:
        env=Pipe(ROOT/'work/recurrent-v3-learned-variance-env.cjs');meta=env.metadata
        assert meta['learnedVariance'] and meta['varianceCoefficients']==130
        atomic_json(out/'metadata.private.json',meta)
        current=meta['genome']['policyWeights'][:];config=copy.deepcopy(initial_exploration)
        def evaluate(weights):
            rows=[{'headingOffsetRad':h,'result':env.request('evaluate',weights=weights,configuration={'maxTicks':0,'headingOffsetRad':h})} for h in settings['trainingOffsets']]
            return rows,aggregate([r['result'] for r in rows])
        baseline,baseline_summary=evaluate(current)
        assert baseline[0]['result']=={k:meta['expected'][k] for k in baseline[0]['result']}
        best={'weights':current[:],'exploration':copy.deepcopy(config),'outcomes':baseline,'aggregate':baseline_summary,'source':'native-parent'}
        if resume:
            checkpoint_file=Path(resume).resolve()
            if not checkpoint_file.is_relative_to(ROOT):raise ValueError('Scoped resume only')
            checkpoint=json.loads(checkpoint_file.read_text())
            if checkpoint['format']!='private-learned-neural-variance-checkpoint-v1' or checkpoint['sourceHashes']!=hashes or checkpoint['settings']!=settings or checkpoint['rootParentSha256']!=meta['parentSha256']:
                raise ValueError('No silent source, parameter or configuration migration')
            current=checkpoint['currentGenome']['policyWeights'][:];config=checkpoint['currentExploration'];best=checkpoint['bestSafe'];start_index=checkpoint['nextUpdate']
            assert evaluate(best['weights'])[0]==best['outcomes']
        atomic_json(out/'identity.json',{'sourceHashes':hashes,'parentSha256':meta['parentSha256'],'settings':settings,'baseline':baseline,'baselineAggregate':baseline_summary,'startingUpdateIndex':start_index})
        for file in files:
            if file.startswith('work/'):(out/Path(file).name).write_bytes((ROOT/file).read_bytes())
        progress('baseline-verified',baselineAggregate=baseline_summary)
        for index in range(start_index,start_index+updates):
            env.request('clear');episodes=[]
            for lane,heading in enumerate([0,-.0025,.0025,0]):
                seed=20261025+index*1000003+lane*104729
                for sign in [1,-1]:
                    progress('physical-episode',update=index+1,lane=lane,sign=sign)
                    episode=env.request('episode',configuration={'weights':current,'exploration':config,'seed':seed,'sign':sign,
                        'headingOffsetRad':heading,'std':config['initial'],'chunkSize':32,'safetyCost':2000,'maxTicks':0})
                    episodes.append(episode);atomic_json(out/f'update-{index+1:02}-episode-{len(episodes):02}.private.json',episode)
                    progress('episode-finished',update=index+1,episode=len(episodes),result=episode['result'])
            advantages,advantage_metrics=make_advantages(episodes,gae_lambda=1.)
            actor_meta={**meta,'genome':{**meta['genome'],'policyWeights':current}}
            def chunk_done(chunks,transitions,error):
                if chunks%32==0:progress('cuda-gradient',update=index+1,chunks=chunks,transitions=transitions,maximumNativeMeanError=error)
            g,metrics=gradient(actor_meta,episodes,advantages,config,chunk_done,device=device)
            fisher=np.asarray(metrics.pop('chunkEmpiricalFisher'))
            delta,natural_metrics=natural_direction({**actor_meta,'scales':meta['scales']+[1.]*130},g,fisher,.1)
            directions=[('joint332',delta)]
            if index==0:
                fixed,fixed_metrics=natural_direction(actor_meta,g[:202],fisher[:202,:202],.1)
                directions.append(('frozen-variance-control',np.concatenate([fixed,np.zeros(130)])))
            atomic_json(out/f'update-{index+1:02}-gradient.private.json',{'gradient':g.tolist(),'fisher':fisher.tolist(),
                        'directions':{name:d.tolist() for name,d in directions},'metrics':metrics,'naturalMetrics':natural_metrics})
            initial=env.request('rescore',weights=current,advantages=advantages,configuration={'exploration':config})
            assert initial['meanGaussianKL']==0
            candidates=[]
            for arm,direction in directions:
                for step in settings['steps']:
                    weights=np.clip(np.asarray(current)+step*direction[:202],-8,8).tolist()
                    candidate_config={**config,'weights':np.clip(np.asarray(config['weights'])+step*direction[202:],-8,8).tolist()}
                    screen=env.request('rescore',weights=weights,advantages=advantages,configuration={'exploration':candidate_config})
                    candidate={'arm':arm,'step':step,'weights':weights,'exploration':candidate_config,'screen':screen}
                    if screen['meanGaussianKL']<=.03 and screen['meanClippedSurrogate']>initial['meanClippedSurrogate']+1e-10:
                        outcomes,summary=evaluate(weights);candidate.update({'outcomes':outcomes,'aggregate':summary})
                        if summary['allSafe'] and safe_rank(summary)>safe_rank(best['aggregate']):
                            best={'weights':weights[:],'exploration':copy.deepcopy(candidate_config),'outcomes':outcomes,'aggregate':summary,'source':f'update{index+1}:{arm}:step{step}'}
                    candidates.append(candidate);progress('candidate-finished',update=index+1,arm=arm,step=step,screen=screen,aggregate=candidate.get('aggregate'))
            eligible=[c for c in candidates if c['arm']=='joint332' and c.get('aggregate') and c['aggregate']['minimumProgress']>=baseline_summary['minimumProgress']*.2]
            accepted=max(eligible,key=lambda c:c['screen']['meanClippedSurrogate']) if eligible else None
            if accepted:current=accepted['weights'][:];config=copy.deepcopy(accepted['exploration'])
            event={'update':index+1,'transitions':len(advantages),'advantageMetrics':advantage_metrics,'gradientMetrics':metrics,
                   'noiseProfile':noise_profile(episodes),'candidates':candidates,'acceptedStep':accepted['step'] if accepted else None,
                   'acceptedAggregate':accepted['aggregate'] if accepted else None,'bestSafe':best['aggregate'],
                   'episodes':[{k:e[k] for k in ['seed','sign','headingOffsetRad','result','controls','trainingReward','actionTraceSha256']} for e in episodes]}
            events.append(event);atomic_json(out/f'update-{index+1:02}.json',event)
            atomic_json(out/'checkpoint.private.json',{'format':'private-learned-neural-variance-checkpoint-v1','nextUpdate':index+1,
                        'currentGenome':{**meta['genome'],'policyWeights':current},'currentExploration':config,'bestSafe':best,
                        'settings':settings,'sourceHashes':hashes,'rootParentSha256':meta['parentSha256'],'revision':meta['rewardRevision'],
                        'boundary':'Private research332, not an app save. Variance coefficients are artificial readout weights, not anatomical neurons. Research-current may collide; safe champion is separate.'})
            progress('update-finished',update=index+1,acceptedStep=event['acceptedStep'],acceptedAggregate=event['acceptedAggregate'],bestSafe=best['aggregate'])
            if best['aggregate']['minimumLaps']>=2:break
        proofs,proof_summary=evaluate(best['weights'])
        assert proofs==best['outcomes'] and proof_summary==best['aggregate']
        assert all(file_hash(ROOT/f)==digest for f,digest in hashes.items()) and file_hash(original)==original_hash
        report={'format':'private-learned-neural-variance-training-v1','passed':True,'learningSucceeded':best['aggregate']['allSafe'] and best['aggregate']['minimumLaps']>=2,
                'updatesCompleted':len(events),'startingUpdateIndex':start_index,'trainingControls':sum(e['transitions'] for e in events),
                'baseline':baseline,'baselineAggregate':baseline_summary,'bestSafe':best,'finalResearchGenome':{**meta['genome'],'policyWeights':current},
                'finalResearchExploration':config,'settings':settings,'events':events,'sourceHashes':hashes,'originalSaveSha256':original_hash,
                'nativeProofs':proofs,'wallSeconds':time.monotonic()-started,
                'boundary':'Native202 recurrent mean plus learned130 neural log-variance readout. Complete from-line body trajectories; no route, teacher or frozen prefix. Monte Carlo returns with a neural value baseline (lambda1), chunk32 credit, empirical chunk Fisher and gain-cast STE. First-batch frozen-variance control shares data and objective only; not a multi-update causal A/B. Physical starts are not policy inputs. No app deployment; validation/test not used by trainer.'}
        atomic_json(out/'report.json',report);progress('finished',passed=True,learningSucceeded=report['learningSucceeded'],bestSafe=best['aggregate'])
    except BaseException as error:
        atomic_json(out/'failure.json',{'error':repr(error),'updatesCompleted':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--tag',required=True);parser.add_argument('--updates',type=int,default=3)
    parser.add_argument('--device',choices=['cpu','cuda:0'],default='cuda:0');parser.add_argument('--resume');args=parser.parse_args()
    run(args.tag,args.updates,args.device,args.resume)
