"""Rank-based neural motor modulation, real complete drives and preserved experience."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import copy
import hashlib
import json
import subprocess
import time
from pathlib import Path
import numpy as np
import torch
from neural_motor_modulation import MotorModulationActor
from neuronal_experiment_io import ROOT,NODE,Pipe,atomic_json,file_hash


def run(tag,generations=8,resume=None):
    if not tag.replace('-','').isalnum() or not 1<=generations<=128:raise ValueError('Scoped complete population search required')
    torch.set_num_threads(2);torch.set_float32_matmul_precision('highest');torch.manual_seed(103261025)
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);ref=out.parent/'neural-feedback-retention-proof-20261025-01';proof=json.loads((ref/'report.json').read_text())
    bankfile=ref/'successful-neural-reference.private.npy';conf=ref/'consolidation.private.json';basisfile=ref/'basis.private.json'
    assert proof['passed'] and proof['fullFirstLapBodyAndNeuronsExact'] and file_hash(bankfile)==proof['referenceSha256'] and file_hash(conf)==proof['configurationSha256']
    files=['work/train_neural_motor_population.py','work/neural_motor_modulation.py','work/neural_retained_balanced.py','work/neural_retained_exploration_v2.py','work/neural_retained_exploration.py',
           'work/neural_feedback_retention.py','work/neural_feedback_kernel.py','work/neural-motor-modulation-world.cjs','work/neuronal_experiment_io.py',
           'package.json','outputs/progress-save.js',*[str(p.relative_to(ROOT)) for p in [ref/'report.json',bankfile,conf,basisfile]]]
    js="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes=json.loads(subprocess.check_output([str(NODE),'-e',js],cwd=ROOT,text=True,creationflags=subprocess.CREATE_NO_WINDOW))
    bank=np.load(bankfile,allow_pickle=False);basis=json.loads(basisfile.read_text());configuration=json.loads(conf.read_text());actor=MotorModulationActor(basis,bank,configuration).to('cuda:0')
    settings={'population':16,'fieldSteeringStdLevels':[.003,.01,.03,.1,.3,.6],'pedalStdMultiplier':1.5,'meanStep':.3,'diagonalStep':.1,'elite':4,
              'coefficientBound':8.,'motorModulationCoefficients':4,'biasMutationScale':'target field std','gainMutationScale':'4x target field std','additionalStallTrainingCost':18.,'trainingTermination':'native only','featureCapacity':512,'growthPerGeneration':8,
              'sourceReferenceSha256':proof['referenceSha256'],'consolidationSha256':proof['configurationSha256'],'noveltyGain':16,'initialRadiusMultiplier':2,
              'fullEvaluationLimit':None,'selection':'complete native future reward minus extra stall cost; safe best requires full from-line improvement'}
    rng=np.random.default_rng(103261025);mean=np.zeros((2,514),np.float32);diagonal=np.ones((2,514),np.float32);training_best=mean.copy();training_best_score=-float('inf')
    best_genes=mean.copy();best_state=copy.deepcopy(actor.state_dict());env=None;events=[];allcontrols=0;allcases=0;started=time.monotonic();start_index=0
    t=lambda x:torch.tensor(x,dtype=torch.float32,device='cuda:0')
    def progress(phase,**extra):
        v={'phase':phase,'environmentPid':env.process.pid if env else None,'wallSeconds':time.monotonic()-started,'generationsCompleted':len(events),**extra}
        atomic_json(out/'progress.json',v);print('NEURAL_MOTOR_POPULATION '+json.dumps(v),flush=True)
    def setgenes(genes):
        with torch.no_grad():actor.layers[-1].steering.copy_(t(genes[0,:512]));actor.layers[-1].pedal.copy_(t(genes[1,:512]));actor.motorBias.copy_(t(genes[:,512]));actor.motorGain.copy_(t(genes[:,513]))
    try:
        env=Pipe(ROOT/'work/neural-motor-modulation-world.cjs',initialization={'configuration':{'horizonControls':200}});meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        assert meta['parentSha256']==proof['parentSha256'] and meta['firstLapBodySequenceSha256']==proof['firstLapBodySequenceSha256']
        baseline={'progress':meta['baseline']['bestProgress'],'laps':1,'reason':meta['baseline']['reason'],'safe':True,'fullFromLine':True};best=baseline.copy();best_source='zero-residual-parent'
        if resume:
            f=Path(resume).resolve();assert f.is_relative_to(ROOT);d=json.loads(f.read_text());assert d['format']=='private-neural-motor-population-checkpoint-v1' and d['settings']==settings and d['sourceHashes']==hashes
            pt=f.parent/d['tensorFile'];assert file_hash(pt)==d['tensorSha256'];v=torch.load(pt,map_location='cuda:0',weights_only=True);actor.load_state_dict(v['actor'])
            mean=v['mean'].cpu().numpy();diagonal=v['diagonal'].cpu().numpy();training_best=v['trainingBestGenes'].cpu().numpy();training_best_score=d['trainingBestScore']
            best_genes=v['bestGenes'].cpu().numpy();best_state=v['bestActor'];best=d['best'];best_source=d['bestSource'];start_index=d['nextGeneration'];rng.bit_generator.state=d['numpyRng']
        for p in files:
            if p.startswith('work/'):(out/Path(p).name).write_bytes((ROOT/p).read_bytes())
        def drive(genes,mode='observed-lap-boundary',label='candidate'):
            nonlocal allcontrols,allcases
            setgenes(genes);obs=env.request('reset',configuration={'mode':mode})['observation'];controls=0;native=0.;seen=[];prefix=hashlib.sha256();prefix_exact=None
            while True:
                if controls%8==0:seen.append(obs)
                with torch.no_grad():action=actor.deterministic(t([obs]))[0].cpu().tolist()
                state=env.request('step',action=action);controls+=1;native+=state['reward'];obs=state['observation']
                if mode=='from-line' and controls<=meta['firstLapControls']:prefix.update((state['info']['bodyFrameSha256']+'\n').encode())
                if mode=='from-line' and controls==meta['firstLapControls']:prefix_exact=prefix.hexdigest()==meta['firstLapBodySequenceSha256'];assert prefix_exact
                if controls%512==0:progress('native-driving',label=label,mode=mode,controls=controls,progress=state['info']['progress'],laps=state['info']['laps'])
                assert not state['truncated']
                if state['terminated']:break
            extra=18. if state['info']['reason'] in ['ferma / senza progresso','troppo lenta / senza progresso'] else 0.
            allcontrols+=controls;allcases+=1
            return {**state['info'],'controls':controls,'nativeFutureReward':native,'additionalStallTrainingCost':extra,'trainingScore':native-extra,
                    'fullFromLine':mode=='from-line','firstLapBodyAndNeuronsExact':prefix_exact},seen
        progress('baseline-verified',baseline=baseline,population=16,settings=settings)
        silence=env.request('check-brain-silence');assert silence['allZero']
        atomic_json(out/'brain-silence-check.json',silence)
        calibration=t(meta['neuralBasisSamples'])
        for index in range(start_index,start_index+generations):
            with torch.no_grad():
                active=np.concatenate([actor.layers[0].enabled.cpu().numpy()>0,[True,True]]);novel=actor.consolidation(calibration)>0
                feature_norm=float(actor.layers[0](calibration[novel]).square().sum(-1).mean().sqrt())
            assert np.isfinite(feature_norm) and feature_norm>0
            candidates=[('center',mean.copy()),('training-best',training_best.copy()),('safe-best',best_genes.copy())];noise={}
            for pair,level in enumerate(settings['fieldSteeringStdLevels']):
                epsilon=rng.standard_normal((2,514)).astype(np.float32);scale=np.asarray([level,1.5*level],np.float32)[:,None]/feature_norm
                step=epsilon*scale*np.sqrt(diagonal);step[:,512]=epsilon[:,512]*np.asarray([level,1.5*level]);step[:,513]=epsilon[:,513]*4*level;step[:,~active]=0
                candidates.extend([(f'pair{pair}-plus',np.clip(mean+step,-8,8)),(f'pair{pair}-minus',np.clip(mean-step,-8,8))])
            epsilon=rng.standard_normal((2,514)).astype(np.float32);step=epsilon*np.asarray([.03,.045],np.float32)[:,None]/feature_norm*np.sqrt(diagonal);step[:,512]=epsilon[:,512]*np.asarray([.03,.045]);step[:,513]=epsilon[:,513]*.12;step[:,~active]=0
            candidates.append(('extra',np.clip(mean+step,-8,8)));assert len(candidates)==16
            cache={};rows=[];visited=[];generation_controls_before=allcontrols;generation_cases_before=allcases;genomes={}
            for number,(label,genes) in enumerate(candidates):
                genes=np.asarray(genes,dtype=np.float32);genes[:,~active]=0;key=hashlib.sha256(genes.tobytes()).hexdigest();genomes[f'candidate{number}']=genes
                reused=key in cache
                if reused:result=cache[key]
                else:
                    result,seen=drive(genes,label=f'g{index+1}:{label}');cache[key]=result;visited.extend(seen)
                row={'slot':number,'label':label,'genesSha256':key,'reusedIdenticalPolicy':reused,'result':result};rows.append(row)
                if result['trainingScore']>training_best_score:training_best_score=result['trainingScore'];training_best=genes.copy()
                if result['safe'] and (result['laps'],result['progress'])>(best['laps'],best['progress']):
                    progress('full-candidate-confirmation',generation=index+1,slot=number,suffix=result);full,_=drive(genes,'from-line',label)
                    assert all(full[k]==result[k] for k in ['progress','laps','reason','bodyFrameSha256'])
                    best=full;best_genes=genes.copy();best_state=copy.deepcopy(actor.state_dict());best_source=f'generation{index+1}:slot{number}'
                    row['fullConfirmation']=full
                progress('candidate-finished',generation=index+1,slot=number,result=result,best=best)
                if best['laps']>=2:break
            order=sorted(range(len(rows)),key=lambda j:rows[j]['result']['trainingScore'],reverse=True)[:4]
            elite=np.stack([genomes[f'candidate{j}'] for j in order]);weights=np.log(len(order)+.5)-np.log(np.arange(1,len(order)+1));weights/=weights.sum()
            elite_mean=np.sum(elite*weights[:,None,None],axis=0);old=mean.copy();mean=np.clip(.7*mean+.3*elite_mean,-8,8).astype(np.float32)
            spread=np.sum((elite-old[None,:,:])**2*weights[:,None,None],axis=0);relative=spread/(np.mean(spread[:,active],axis=1)[:,None]+1e-8)
            diagonal=np.clip(.9*diagonal+.1*relative,.2,5).astype(np.float32);setgenes(mean)
            growth=actor.grow(t(visited),8) if visited else None
            np.savez_compressed(out/f'population-{index+1:03}.private.npz',**genomes)
            event={'generation':index+1,'population':len(rows),'uniqueNativeEvaluationsIncludingConfirmations':allcases-generation_cases_before,
                   'actualPhysicalControlsIncludingConfirmations':allcontrols-generation_controls_before,'featureNorm':feature_norm,'candidates':rows,'eliteSlots':order,
                   'growth':growth,'trainingBestScore':training_best_score,'best':best,'bestSource':best_source}
            events.append(event);atomic_json(out/f'generation-{index+1:03}.json',event)
            pt=out/'checkpoint.private.pt';pending=out/'checkpoint.pending.pt'
            torch.save({'actor':actor.state_dict(),'bestActor':best_state,'mean':torch.from_numpy(mean),'diagonal':torch.from_numpy(diagonal),
                        'trainingBestGenes':torch.from_numpy(training_best),'bestGenes':torch.from_numpy(best_genes)},pending);os.replace(pending,pt)
            atomic_json(out/'checkpoint.private.json',{'format':'private-neural-motor-population-checkpoint-v1','nextGeneration':index+1,'tensorFile':pt.name,'tensorSha256':file_hash(pt),
                        'settings':settings,'sourceHashes':hashes,'trainingBestScore':training_best_score,'best':best,'bestSource':best_source,'numpyRng':rng.bit_generator.state,
                        'boundary':'Coherent deterministic whole-controller mutations, real native episodes. Training-best may collide; deployable best requires actual safe full-from-line confirmation. Private format, no ordinary5.6save compatibility.'})
            progress('generation-finished',generation=index+1,best=best,trainingBestScore=training_best_score)
            if best['laps']>=2:break
        final_center,seen=drive(mean,label='final-center');atomic_json(out/'final-center.json',final_center)
        assert all(file_hash(ROOT/p)==h for p,h in hashes.items())
        report={'format':'private-neural-motor-population-search-v1','passed':True,'learningSucceeded':best['laps']>=2,'approvedForApp':False,'generationsCompleted':len(events),
                'startingGenerationIndex':start_index,'logicalPopulationSlots':sum(e['population'] for e in events),'uniqueNativeEpisodesIncludingConfirmationsAndFinal':allcases,
                'actualPhysicalControlsIncludingConfirmationsAndFinal':allcontrols,'brainSilence':silence,'baseline':baseline,'best':best,'bestSource':best_source,'finalCenter':final_center,
                'events':events,'settings':settings,'sourceHashes':hashes,'parentSha256':meta['parentSha256'],'checkpointSha256':file_hash(out/'checkpoint.private.json'),
                'cuda':env.request('stats'),'wallSeconds':time.monotonic()-started,
                'boundary':'Rank-weighted bounded neural coefficient search with antithetic parameter mutations, not an action teacher or a claimed CMA-ES implementation. Policy reads actual neuronal history/own commands only; preserved experience has0residual. Population slots may reuse a checksum-identical deterministic policy result in the same generation, disclosed separately from native evaluations. Real first-lap boundary is inherited for search, never proof of a full lap until actual from-line replay. Scores keep native future reward and extra stalled-failure training cost separate. No release/app integration.'}
        atomic_json(out/'report.json',report);progress('finished',learningSucceeded=report['learningSucceeded'],best=best,finalCenter=final_center)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error),'generationsCompleted':len(events)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);p.add_argument('--generations',type=int,default=8);p.add_argument('--resume');a=p.parse_args();run(a.tag,a.generations,a.resume)
