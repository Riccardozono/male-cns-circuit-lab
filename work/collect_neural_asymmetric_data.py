"""Replay selected, already evaluated controllers to record actual transition data.

No teacher action, fabricated state, fitted physical target or route controller.
The extra observations can be used only by the training critic, not the actor.
"""
import os
os.environ['OMP_NUM_THREADS']='1'
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['MKL_NUM_THREADS']='1'
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import time
import numpy as np
from neuronal_experiment_io import ROOT,NODE,Pipe,file_hash,atomic_json
from neural_readout_coordinates import materialize
from neural_transition_dataset import load_episode,complete_returns

KEYS=['bestProgress','fitness','laps','reason','totalSimulationSeconds']


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='neuronal-command-3809-asymmetric-data');parser.add_argument('--episodes',type=int,default=32)
    args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not 4<=args.episodes<=64:raise ValueError('Bounded private actual data collection required')
    base=ROOT/'.impeccable/review/neural-sacl';source_file=base/'neuronal-command-3809-cma-readout-recovered/report.json'
    source=json.loads(source_file.read_text(encoding='utf-8'));verification=json.loads(source_file.with_name('verification.json').read_text(encoding='utf-8'))
    if source['phase']!='finished' or not source['passed'] or not verification['passed']:raise RuntimeError('Previously verified complete source required')
    source_actor_file=base/'neuronal-command-3803-cma-bias/best-actor.json';original=json.loads(source_actor_file.read_text(encoding='utf-8'))
    representation_file=base/'neuronal-command-readout-prepared/prepared.json';representation=json.loads(representation_file.read_text(encoding='utf-8'))
    prepared_file=base/'projected-residual-3803-prepared/prepared.json'
    unique={}
    for index,record in enumerate(source['records']):
        unique.setdefault(record['actorSha256'],(index,record))
    # Select by fixed chronological spacing, NOT a physical target or desired action.
    available=list(unique.values());indices=np.linspace(0,len(available)-1,args.episodes,dtype=int).tolist()
    selected=[available[i] for i in indices]
    if len({r['actorSha256'] for _,r in selected})!=args.episodes:raise RuntimeError('Distinct recorded source controllers required')
    out=base/args.tag;out.mkdir(exist_ok=False);pipes=[];started=time.monotonic();records=[]
    atomic_json(out/'state.json',{'phase':'initializing','pid':os.getpid(),'configuration':vars(args)})
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(Pipe,ROOT/'work/neural-asymmetric-env.cjs',{'configuration':{'preparedFile':str(prepared_file)}}) for _ in range(2)]
            for future in futures:pipes.append(future.result())
        if pipes[0].metadata!=pipes[1].metadata or pipes[0].metadata['baseEnvironment']!=source['identity']['environment']:raise RuntimeError('Critic observer must preserve the frozen physical engine')
        identity={'pid':os.getpid(),'configuration':vars(args),'environment':pipes[0].metadata,'sourceReportSha256':file_hash(source_file),'sourceVerificationSha256':file_hash(source_file.with_name('verification.json')),
                  'nodeExecutableSha256':file_hash(NODE),'sourceActorSha256':file_hash(source_actor_file),'representationSha256':file_hash(representation_file),'workers':2,
                  'sourceHashes':{f:file_hash(ROOT/f) for f in ['work/collect_neural_asymmetric_data.py','work/neural_transition_dataset.py','work/neural_readout_coordinates.py','work/neural-asymmetric-env.cjs','work/neural-training-state.cjs','work/neuronal_experiment_io.py']}}
        atomic_json(out/'identity.json',identity)
        for offset in range(0,len(selected),2):
            batch=selected[offset:offset+2];files=[]
            for local,(source_index,record) in enumerate(batch):
                file=out/f'actor-{offset+local:03d}.json';atomic_json(file,materialize(original,representation,record['genes']))
                if file_hash(file)!=record['actorSha256']:raise RuntimeError('Actual recorded controller reconstruction differs')
                files.append(file)
            requests=[p.send('rollout',actorFile=str(file),mode='practice',file=str(out/f'episode-{offset+i:03d}.f32')) for i,(p,file) in enumerate(zip(pipes,files))]
            for p,file,(source_index,prior),request in zip(pipes,files,batch,requests):
                episode=p.receive(request)
                if not episode['dataComplete'] or episode['actionTraceSha256']!=prior['episode']['actionTraceSha256'] or any(episode['result'][k]!=prior['episode']['result'][k] for k in KEYS):
                    raise RuntimeError('Observer changed the entire actual trajectory, or replay was censored')
                record={'sourceRecord':source_index,'sourceIteration':prior['iteration'],'actorFile':str(file),'actorSha256':file_hash(file),'genes':prior['genes'],'rollout':episode,'dataSha256':file_hash(episode['dataFile'])}
                data=load_episode(record);returns=complete_returns(data);record['discountedReturnRange']=[float(returns.min()),float(returns.max())];record['initialDiscountedReturn']=float(returns[0]);records.append(record)
            atomic_json(out/'progress.json',{'phase':'collecting','pid':os.getpid(),'completedEpisodes':len(records),'actualTransitions':sum(r['rollout']['rows'] for r in records),'records':records})
            print('ASYMMETRIC_DATA_PROGRESS '+json.dumps({'completeEpisodes':len(records),'transitions':sum(r['rollout']['rows'] for r in records),'wallSeconds':time.monotonic()-started}),flush=True)
        report={'passed':True,'phase':'finished','format':'male-cns-actual-neuronal-asymmetric-transitions-v1','identity':identity,'records':records,'completeEpisodes':len(records),'actualTransitions':sum(r['rollout']['rows'] for r in records),'wallSeconds':time.monotonic()-started,
                'binaryLayout':{'dtype':'little-endian-float32','columns':1118,'preState':[0,557],'action':[557,559],'actualReward':559,'actualTermination':560,'nextState':[561,1118],'actorObservesOnly':[0,521]},
                'boundary':'Every recorded episode independently repeats an already executed actual controller, metrics and entire command trace. No invented transition, demonstration action label or censored terminal return. Extra physical signals are critic-only. Warm-start V3/Monza practice only, not generations or evidence of a completed lap.'}
        atomic_json(out/'report.json',report);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'finished','reportSha256':file_hash(out/'report.json')})
        print('ASYMMETRIC_DATA_DONE '+json.dumps({k:report[k] for k in ['passed','completeEpisodes','actualTransitions','wallSeconds']}),flush=True)
    except Exception as error:
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'failed','error':repr(error),'completedEpisodes':len(records)});raise
    finally:
        for p in pipes:p.close()


if __name__=='__main__':main()
