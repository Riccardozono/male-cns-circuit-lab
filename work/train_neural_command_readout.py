"""Fitness-only state-dependent neural readout search; no critic/teacher/route.

Eighteen unsupervised-feature coordinates are optimized. The frozen parent
remains a real neuronal controller. This is not labelled37kplastic parameters or
GPU gradient learning. Cached practice never counts as full app generations.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import copy
import json
import os
import subprocess
import time
import numpy as np
from neuronal_experiment_io import ROOT,NODE,Pipe,file_hash,atomic_json
from neural_readout_coordinates import materialize


KEYS=['bestProgress','fitness','laps','reason','totalSimulationSeconds']
def node(config):
    result=subprocess.run([str(NODE),str(ROOT/'work/command-model-io.cjs'),json.dumps(config)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=240,creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def eligible(episode,best):
    a,b=episode['result'],best['result']
    return (episode['complete'] and not episode['censored'] and not episode['gasBrakeOverlapSteps']
            and not any(s in a['reason'] for s in ['urto','fuori pista','progresso non valido'])
            and a['fitness']>b['fitness']+1e-6 and a['bestProgress']>=b['bestProgress'] and a['laps']>=b['laps'])


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--tag',default='neuronal-command-3809-cma-readout')
    parser.add_argument('--iterations',type=int,default=16)
    args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not 1<=args.iterations<=40:raise ValueError('Bounded private search required')
    base=ROOT/'.impeccable/review/neural-sacl';source_dir=base/'neuronal-command-3803-cma-bias';source_file=source_dir/'report.json'
    source=json.loads(source_file.read_text(encoding='utf-8'))
    if not source['passed'] or source['phase']!='finished':raise RuntimeError('Wait for the completed command decoder source; no concurrent source training')
    out=base/args.tag;out.mkdir(exist_ok=False)
    prepared_file=base/'projected-residual-3803-prepared/prepared.json'
    original=json.loads((source_dir/'best-actor.json').read_text(encoding='utf-8'))
    representation_file=base/'neuronal-command-readout-prepared/prepared.json'
    representation=json.loads(representation_file.read_text(encoding='utf-8'))
    atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'initializing','configuration':vars(args)})
    pipes=[];optimizer=None;started=time.monotonic();records=[];iterations=[]
    def actor(genes,file):
        atomic_json(file,materialize(original,representation,genes))
    try:
        errors=[]
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures=[pool.submit(Pipe,ROOT/'work/neural-command-env.cjs',{'configuration':{'preparedFile':str(prepared_file)}}) for _ in range(4)]
            for future in futures:
                try:pipes.append(future.result())
                except Exception as error:errors.append(error)
        if errors:raise errors[0]
        if any(p.metadata!=source['identity']['environment'] for p in pipes):raise RuntimeError('Frozen source engine differs')
        zero_actor=out/'initial-actor.json';actor([0]*18,zero_actor)
        if file_hash(zero_actor)!=file_hash(source_dir/'best-actor.json'):raise RuntimeError('Zero readout coordinates must preserve the selected actual source actor byte-for-byte')
        requests=[pipes[0].send('evaluate',actorFile=str(zero_actor),mode='full'),pipes[1].send('evaluate',actorFile=str(zero_actor),mode='practice')]
        baseline,practice=[p.receive(r) for p,r in zip(pipes[:2],requests)]
        if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [baseline,practice]) or any(baseline['result'][k]!=source['fullChampion']['result'][k] or practice['result'][k]!=baseline['result'][k] for k in KEYS) or baseline['actionTraceSha256']!=source['fullChampion']['actionTraceSha256']:
            raise RuntimeError('Actual full/practice warm start differs')
        optimizer=Pipe(ROOT/'work/neural-head-cma-transport.cjs',{'mean':[0]*18,'sigma':.03,'population':16,'seed':15101837})
        identity={'configuration':vars(args),'pid':os.getpid(),'environment':pipes[0].metadata,'nodeExecutableSha256':file_hash(NODE),'sourceReportSha256':file_hash(source_file),
                  'plasticParameters':18,'inferenceCoefficients':37698,'algorithm':'fitness-only-elitist-neural-readout-cma-v1','representationSha256':file_hash(representation_file),'backend':'four pinned Node24 CPU physics processes; CPU fitness optimizer, not GPU gradients',
                  'sourceHashes':{f:file_hash(ROOT/f) for f in ['work/train_neural_command_readout.py','work/neural_readout_coordinates.py','work/neural-cma.cjs','work/neural-head-cma-transport.cjs','work/neuronal_experiment_io.py','work/neural-command-env.cjs','work/neural-command-state.cjs','work/neural-command-live.cjs','work/neural-command-residual.cjs','work/neural-projected-residual.cjs','work/neural-command-model.cjs','work/command-model-io.cjs']}}
        atomic_json(out/'identity.json',identity)
        best,best_genes=baseline,[0]*18
        print('READOUT_CMA_READY '+json.dumps({'baseline':baseline['result'],'plasticParameters':18,'population':16,'backend':identity['backend']}),flush=True)
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'search','identity':identity})
        for iteration in range(1,args.iterations+1):
            genes=optimizer.request('ask',elite=best_genes);fitness=[]
            for offset in range(0,16,4):
                batch=genes[offset:offset+4];files=[]
                for slot,x in enumerate(batch):
                    file=out/f'actor-slot-{slot}.json';actor(x,file);files.append(file)
                requests=[p.send('evaluate',actorFile=str(file),mode='practice') for p,file in zip(pipes,files)]
                for p,x,file,r in zip(pipes,batch,files,requests):
                    episode=p.receive(r)
                    if episode['censored'] or not episode['complete'] or episode['gasBrakeOverlapSteps']:raise RuntimeError('Every CMA fitness must be an actual uncensored complete episode')
                    fitness.append(episode['result']['fitness'])
                    records.append({'iteration':iteration,'genes':x,'actorSha256':file_hash(file),'episode':episode})
                    if eligible(episode,best):
                        best,best_genes=episode,x[:];actor(x,out/'pending-best-actor.json')
            metrics=optimizer.request('tell',fitness=fitness)
            row={'iteration':iteration,'evaluations':len(records),'optimizer':metrics,'pendingPracticeBest':best['result'],'genes':best_genes,'wallSeconds':time.monotonic()-started}
            iterations.append(row)
            atomic_json(out/'progress.json',{'identity':identity,'phase':'search','pendingBest':best,'bestGenes':best_genes,'iterations':iterations,'records':records,'optimizerState':optimizer.request('state')})
            print('READOUT_CMA_PROGRESS '+json.dumps(row),flush=True)
            if best['result']['laps']==2:break
        best_actor=out/'best-actor.json';actor(best_genes,best_actor)
        requests=[p.send('evaluate',actorFile=str(best_actor),mode='full') for p in pipes[:2]]
        full,repeat=[p.receive(r) for p,r in zip(pipes[:2],requests)]
        if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [full,repeat]) or any(full['result'][k]!=best['result'][k] or full['result'][k]!=repeat['result'][k] for k in KEYS) or full['actionTraceSha256']!=repeat['actionTraceSha256']:
            raise RuntimeError('Cached candidate must reproduce in two complete actual from-line episodes')
        numeric_file=out/'model.malecns-neuronal-command.json'
        node({'op':'export','preparedFile':str(prepared_file),'actorFile':str(best_actor),'file':str(numeric_file),'episode':full,'provenance':{'trainingIdentitySha256':file_hash(out/'identity.json'),'algorithm':identity['algorithm'],'plasticParameters':18,'actualCandidateEvaluations':len(records)}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            native=list(pool.map(lambda _:node({'op':'verify','file':str(numeric_file)}),range(2)))
        report={'passed':True,'phase':'finished','identity':identity,'initialFull':baseline,'initialPractice':practice,'bestPractice':best,'bestGenes':best_genes,'fullChampion':full,'independentFullRepeat':repeat,
                'improved':eligible(full,baseline),'actualCandidateEvaluations':len(records),'iterations':iterations,'records':records,'optimizerState':optimizer.request('state'),'nativeVerifications':native,
                'exportedModelFile':str(numeric_file),'wallSeconds':time.monotonic()-started,
                'boundary':'Fitness-only CPU neuroevolution of18readout coordinates derived unsupervised from actual neuronal observations; not37kplastic parameters or GPU gradients. Genome changes only the final neural readout; real learned elite is physically reevaluated every iteration. No target driving actions/teacher/route. Cached practice iterations are not app generations; full independent native episodes prove driving. Windows copies/originals/release untouched.'}
        atomic_json(out/'report.json',report);atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'finished','reportSha256':file_hash(out/'report.json')})
        print('READOUT_CMA_DONE '+json.dumps({k:report[k] for k in ['passed','improved','actualCandidateEvaluations','bestGenes','fullChampion','wallSeconds']}),flush=True)
    except Exception as error:
        atomic_json(out/'state.json',{'pid':os.getpid(),'phase':'failed','error':repr(error),'actualCandidateEvaluations':len(records)})
        raise
    finally:
        for p in pipes:p.close()
        if optimizer:optimizer.close()


if __name__=='__main__':main()
