"""Bounded real-reward evolution of an observation-conditioned neural readout.

The protected starting controller remains available. No demonstration, route,
handwritten steering policy or body state enters this learned readout.
"""
import argparse
import time
import json
import numpy as np
import neural_sac as NS

def prepare_basis():
    trace_file=NS.ROOT/'.impeccable/review/neural-sacl/frontier-1990/actual-trace.json'
    gate_file=NS.ROOT/'.impeccable/review/neural-sacl/context-frontier-basis/prepared.json'
    file=NS.ROOT/'.impeccable/review/neural-sacl/frontier-linear-basis/prepared.json'
    if file.exists():raise RuntimeError('Preserve existing projection')
    gate=json.loads(gate_file.read_text(encoding='utf-8'))
    observations=np.asarray([r['observation'] for r in json.loads(trace_file.read_text(encoding='utf-8'))],dtype=np.float64)
    if observations.shape!=(1603,516) or not np.isfinite(observations).all():raise RuntimeError('Actual neuronal trace required')
    samples=observations[gate['basis']['protectedCount']:];mean=samples.mean(axis=0);scales=np.asarray(gate['basis']['scales'],dtype=np.float64)
    centered=(samples-mean)/scales;_,singular,components=np.linalg.svd(centered,full_matrices=False);components=components[:4]
    deviation=np.maximum((centered@components.T).std(axis=0),.02)
    file.parent.mkdir(parents=True,exist_ok=False)
    NS.atomic_json(file,{'format':'male-cns-private-neuronal-projection','schema':1,'mean':mean.tolist(),'scales':scales.tolist(),'components':components.tolist(),
        'componentStd':deviation.tolist(),'explainedVarianceFraction':float(np.sum(singular[:4]**2)/np.sum(singular**2)),
        'sourceModelSha256':gate['sourceModelSha256'],'gateBasisSha256':NS.file_hash(gate_file),'sourceTraceSha256':NS.file_hash(trace_file),
        'boundary':'Unsupervised PCA on only actual neuronal observations, without body, elapsed time, route or control targets. Four mathematical axes are not new biological neurons.'})

def same(a,b):
    return all(a['result'][k]==b['result'][k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='frontier-linear-cma-first');parser.add_argument('--generations',type=int,default=24)
    args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not 1<=args.generations<=40:raise ValueError('Invalid settings')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    prepare_basis();parent=json.loads((NS.ROOT/'.impeccable/review/neural-sacl/frontier-retained-cma-first/report.json').read_text(encoding='utf-8'))
    if not parent['passed']:raise RuntimeError('Verified own parent required')
    mean=parent['champion']['weights']+[0.]*8
    pipes=[];optimizer=None;records=[];started=time.monotonic()
    try:
        NS.BRIDGE=NS.ROOT/'work/neural-context-linear-env.cjs'
        for _ in range(4):pipes.append(NS.NodePipe())
        metadata=pipes[0].metadata
        if any(p.metadata!=metadata for p in pipes):raise RuntimeError('Different physical environments')
        zero=pipes[0].request('evaluate',weights=[0.]*10,mode='full')
        if zero['result']['bestProgress']!=1990.41260481475:raise RuntimeError('Zero-weight baseline changed')
        full=pipes[0].request('evaluate',weights=mean,mode='full')
        practice=pipes[0].request('evaluate',weights=mean,mode='practice')
        if not same(full,practice) or not same(full,parent['fullChampion']):raise RuntimeError('Warm start changes verified parent')
        champion={'weights':mean,'episode':practice,'generation':0};explorer=champion
        NS.BRIDGE=NS.ROOT/'work/neural-cma-transport.cjs';original=NS.NodePipe.request
        def initialize(self,op,**fields):
            if op=='init':fields.update(mean=mean,sigma=.04,population=16,seed=150728)
            return original(self,op,**fields)
        NS.NodePipe.request=initialize
        try:optimizer=NS.NodePipe()
        finally:NS.NodePipe.request=original
        for generation in range(1,args.generations+1):
            candidates=optimizer.request('ask');current=[]
            for offset in range(0,len(candidates),4):
                batch=candidates[offset:offset+4];params=[[max(-8.,min(8.,float(v))) for v in x] for x in batch]
                ids=[p.send('evaluate',weights=w,mode='practice') for p,w in zip(pipes,params)]
                for x,w,p,rid in zip(batch,params,pipes,ids):
                    episode=p.receive(rid);row={'weights':w,'normalizedVector':x,'episode':episode,'generation':generation}
                    records.append(row);current.append(row)
                    if episode['gasBrakeOverlapSteps']:raise RuntimeError('Pedals overlap')
                    if not episode['censored']:
                        if episode['result']['fitness']>champion['episode']['result']['fitness']:champion=row
                        if (episode['result']['laps'],episode['result']['bestProgress'])>(explorer['episode']['result']['laps'],explorer['episode']['result']['bestProgress']):explorer=row
            optimizer.request('tell',fitness=[r['episode']['result']['fitness'] if not r['episode']['censored'] else -1e9 for r in current])
            progress={'baselineFull':full,'champion':champion,'explorer':explorer,'records':records,'optimizer':optimizer.request('state'),'wallSeconds':time.monotonic()-started}
            NS.atomic_json(out/'progress.json',progress)
            print('RETAINED_NEURAL_PROGRESS '+json.dumps({'generation':generation,'champion':champion['episode']['result'],'weights':champion['weights'],'explorer':explorer['episode']['result']}),flush=True)
            if champion['episode']['result']['laps']==2:break
        validated=pipes[0].request('evaluate',weights=champion['weights'],mode='full');repeat=pipes[0].request('evaluate',weights=champion['weights'],mode='full')
        explored=pipes[0].request('evaluate',weights=explorer['weights'],mode='full')
        if not same(validated,repeat) or not same(validated,champion['episode']) or not same(explored,explorer['episode']):raise RuntimeError('Full physical validation differs')
        report={**progress,'passed':True,'fullChampion':validated,'independentChampionRepeat':repeat,'fullExplorer':explored,'environment':metadata,
            'sourceHashes':{f:NS.file_hash(NS.ROOT/f) for f in ['work/train_frontier_linear.py','work/neural-context-linear-env.cjs','work/neural-context-frontier-env.cjs','work/neural-rl-context-state.cjs']},
            'boundary':'Actual physical candidates, selection by real reward. No route/teacher controls or invented transitions. Ten learned weights over actual neuronal PCA axes are a private decoder experiment, not a normal save, new app version, biological neurons or proof of convergence.'}
        NS.atomic_json(out/'report.json',report);print('RETAINED_NEURAL_DONE '+json.dumps({'passed':True,'champion':validated,'weights':champion['weights'],'explorer':explored}),flush=True)
    finally:
        for p in pipes:p.close()
        if optimizer:optimizer.close()

if __name__=='__main__':main()
