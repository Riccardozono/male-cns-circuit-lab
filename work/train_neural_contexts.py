"""Native parallel evolution of motor weights over observed neural contexts.

No recorded actions, target driving, route or body inputs in the learned head.
Cached practice and independent full validation are separately labelled.
"""
import argparse
import json
import time
import neural_sac as NS

def weights(x):
    return [max(-8.,min(8.,float(v)*(.025 if i%2==0 else .8))) for i,v in enumerate(x)]

def same(a,b):
    return all(a['result'][k]==b['result'][k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='observed-context-first')
    parser.add_argument('--generations',type=int,default=12);parser.add_argument('--workers',type=int,default=4);args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not 1<=args.workers<=4 or not 1<=args.generations<=100:raise ValueError('Invalid settings')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    NS.BRIDGE=NS.ROOT/'work/neural-context-env.cjs';pipes=[];optimizer=None;started=time.monotonic();records=[]
    try:
        for _ in range(args.workers):pipes.append(NS.NodePipe())
        metadata=pipes[0].metadata
        if any(p.metadata!=metadata for p in pipes):raise RuntimeError('Physical environments differ')
        n=metadata['learnableParameters'];zero=[0.]*n
        baseline=pipes[0].request('evaluate',weights=zero,mode='full')
        practice=pipes[0].request('evaluate',weights=zero,mode='practice')
        if not same(baseline,practice) or baseline['censored']:raise RuntimeError('Practice cache changes the physical episode')
        champion={'weights':zero,'episode':practice,'generation':0};explorer=champion
        NS.BRIDGE=NS.ROOT/'work/neural-cma-transport.cjs';original=NS.NodePipe.request
        def initialize(self,op,**fields):
            if op=='init':fields.update(mean=[0.]*n,sigma=1,population=12,seed=15621)
            return original(self,op,**fields)
        NS.NodePipe.request=initialize
        try:optimizer=NS.NodePipe()
        finally:NS.NodePipe.request=original
        for generation in range(1,args.generations+1):
            candidates=optimizer.request('ask');current=[]
            for offset in range(0,len(candidates),args.workers):
                batch=candidates[offset:offset+args.workers];params=[weights(x) for x in batch]
                ids=[p.send('evaluate',weights=w,mode='practice') for p,w in zip(pipes,params)]
                for x,w,p,rid in zip(batch,params,pipes,ids):
                    trial=p.receive(rid);row={'weights':w,'normalizedVector':x,'episode':trial,'generation':generation};records.append(row);current.append(row)
                    if trial['gasBrakeOverlapSteps']:raise RuntimeError('Gas and brake overlap')
                    if not trial['censored']:
                        if trial['result']['fitness']>champion['episode']['result']['fitness']:champion=row
                        if (trial['result']['laps'],trial['result']['bestProgress'])>(explorer['episode']['result']['laps'],explorer['episode']['result']['bestProgress']):explorer=row
            update=optimizer.request('tell',fitness=[r['episode']['result']['fitness'] if not r['episode']['censored'] else -1e9 for r in current])
            progress={'baseline':baseline,'champion':champion,'explorer':explorer,'records':records,'optimizer':optimizer.request('state'),'wallSeconds':time.monotonic()-started}
            NS.atomic_json(out/'progress.json',progress)
            print('CONTEXT_GENERATION '+json.dumps({'generation':generation,'champion':champion['episode']['result'],
                'explorer':explorer['episode']['result'],'optimizer':update,'wallSeconds':time.monotonic()-started}),flush=True)
            if champion['episode']['result']['laps']==2:break
        full=pipes[0].request('evaluate',weights=champion['weights'],mode='full')
        repeat=pipes[0].request('evaluate',weights=champion['weights'],mode='full')
        full_explorer=pipes[0].request('evaluate',weights=explorer['weights'],mode='full')
        if not same(full,champion['episode']) or not same(full,repeat) or not same(full_explorer,explorer['episode']):raise RuntimeError('Practice candidate fails independent full validation')
        report={**progress,'passed':True,'fullChampion':full,'independentChampionRepeat':repeat,'fullExplorer':full_explorer,'environment':metadata,
                'sourceCodeSha256':NS.file_hash(__file__),'contextCodeSha256':NS.file_hash(NS.ROOT/'work/neural-context-readout.cjs'),
                'boundary':'Six basis centres are actual 516-value neuronal observations; 12 motor coefficients learned from real reward. Fixed old head and anatomy. Tail practice saves redundant computation but only full physical resets validate progress/laps. Private incompatible experiment, no release changes.'}
        NS.atomic_json(out/'report.json',report)
        print('CONTEXT_TRAINING_DONE '+json.dumps({'passed':True,'fullChampion':full,'fullExplorer':full_explorer,'wallSeconds':report['wallSeconds']}),flush=True)
    finally:
        for p in pipes:p.close()
        if optimizer:optimizer.close()

if __name__=='__main__':main()
