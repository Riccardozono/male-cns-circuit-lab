"""Fitness-only CMA training of a small neural motor readout.

Four independent physical environments; fixed single-row CUDA inference.
The added readout sees only decoder memory and the prior neural motor output.
No body telemetry, position, route, time or desired driving action is available.
"""
import argparse
import json
import time
import numpy as np
import torch
import neural_sac as NS
from search_neural_memory_feature import SOURCE

def parameters(x):
    return {'bias':float(.2+.045*x[0]),'priorLongWeight':float(.12*x[1]),
            'width':float(.04*np.exp(np.clip(.2*x[2],-6,6))),
            'steeringBias':float(.02*x[3])}

def residual(observation,p):
    memory=np.asarray(observation[512:514],dtype=np.float64)*2
    phi=float(np.exp(-np.dot(memory,memory)/(2*p['width']**2)))
    return [float(np.tanh(p['steeringBias'])*phi),
            float(np.tanh(p['bias']+p['priorLongWeight']*observation[515])*phi)]

def evaluate_batch(model,pipes,params):
    states=[pipe.request('reset',mode='full') for pipe in pipes[:len(params)]]
    results=[None]*len(params)
    while any(r is None for r in results):
        active=[i for i,r in enumerate(results) if r is None]
        # Always the same GEMV shape: do not change rounding when active count
        # changes or between a parallel trial and its independent replay.
        actions=[model.predict(np.asarray(states[i]['observation'],dtype=np.float32),deterministic=True)[0] for i in active]
        ids=[pipes[i].send('step',action=actions[k].tolist()+residual(states[i]['observation'],params[i]))
             for k,i in enumerate(active)]
        for i,request_id in zip(active,ids):
            states[i]=pipes[i].receive(request_id)
            if states[i]['terminated'] or states[i]['truncated']:
                results[i]={**states[i]['info'],'censored':states[i]['truncated'],'validationMode':'full'}
    return results

def equal(a,b):
    return all(a[k]==b[k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='bilateral-readout-resume');
    parser.add_argument('--resume',default='bilateral-readout-cma');
    parser.add_argument('--generations',type=int,default=16);parser.add_argument('--workers',type=int,default=4)
    args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not args.resume.replace('-','').isalnum() or not 1<=args.generations<=100 or not 1<=args.workers<=4:
        raise ValueError('Invalid settings')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    torch.set_num_threads(1);NS.BRIDGE=NS.ROOT/'work/neural-rl-bilateral.cjs'
    pipes=[];optimizer=None;records=[];started=time.monotonic()
    previous_file=NS.ROOT/'.impeccable/review/neural-sacl'/args.resume/'report.json'
    previous=json.loads(previous_file.read_text(encoding='utf-8'))
    if not previous['passed'] or previous['sourceActorSha256']!=NS.file_hash(SOURCE/'best-own-model.zip'):
        raise ValueError('A verified own checkpoint for this actor is required')
    model=NS.GentleWarmSAC.load(SOURCE/'best-own-model.zip',device='cuda')
    try:
        for _ in range(args.workers):pipes.append(NS.NodePipe())
        if any(p.metadata!=pipes[0].metadata for p in pipes):raise RuntimeError('Environment identity mismatch')
        if pipes[0].metadata!=previous['environment']:raise RuntimeError('Resume environment identity mismatch')
        NS.BRIDGE=NS.ROOT/'work/neural-cma-resume-transport.cjs'
        # Custom init: NodePipe normally initializes a physical environment.
        original_request=NS.NodePipe.request
        def initialize(self,op,**fields):
            if op=='init':fields.update(state=previous['optimizer'])
            return original_request(self,op,**fields)
        NS.NodePipe.request=initialize
        try:optimizer=NS.NodePipe()
        finally:NS.NodePipe.request=original_request
        baseline_parameters=previous['champion']['parameters']
        baseline=evaluate_batch(model,pipes,[baseline_parameters])[0]
        if not equal(baseline,previous['champion']['result']):raise RuntimeError('Resume champion does not reproduce')
        champion=previous['champion'];explorer=previous['explorer']
        start_generation=previous['optimizer']['optimizer']['generation']
        for generation in range(start_generation+1,start_generation+args.generations+1):
            vectors=optimizer.request('ask');generation_rows=[]
            for offset in range(0,len(vectors),args.workers):
                batch=vectors[offset:offset+args.workers];params=[parameters(x) for x in batch]
                for x,p,result in zip(batch,params,evaluate_batch(model,pipes,params)):
                    row={'parameters':p,'normalizedVector':x,'result':result,'generation':generation}
                    records.append(row);generation_rows.append(row)
                    if not result['censored']:
                        if result['fitness']>champion['result']['fitness']:champion=row
                        if (result['laps'],result['bestProgress'])>(explorer['result']['laps'],explorer['result']['bestProgress']):explorer=row
            update=optimizer.request('tell',fitness=[r['result']['fitness'] if not r['result']['censored'] else -1e9 for r in generation_rows])
            progress={'baseline':baseline,'champion':champion,'explorer':explorer,'records':records,
                      'optimizer':optimizer.request('state'),'wallSeconds':time.monotonic()-started}
            NS.atomic_json(out/'progress.json',progress)
            print('MEMORY_READOUT_GENERATION '+json.dumps({'generation':generation,'champion':champion,'explorer':explorer,'optimizer':update,'wallSeconds':time.monotonic()-started}),flush=True)
            if champion['result']['laps']==2:break
        repeat=evaluate_batch(model,pipes,[champion['parameters']])[0]
        explorer_repeat=evaluate_batch(model,pipes,[explorer['parameters']])[0]
        valid=equal(repeat,champion['result']) and equal(explorer_repeat,explorer['result'])
        NS.atomic_json(out/'repeat-validation.json',{'passed':valid,'expectedChampion':champion['result'],
            'actualChampion':repeat,'expectedExplorer':explorer['result'],'actualExplorer':explorer_repeat})
        if not valid:
            raise RuntimeError('Independent full repeats differ')
        report={**progress,'passed':True,'independentChampionRepeat':repeat,'independentExplorerRepeat':explorer_repeat,
                'environment':pipes[0].metadata,'sourceActorSha256':NS.file_hash(SOURCE/'best-own-model.zip'),
                'resumeReportSha256':NS.file_hash(previous_file),
                'sourceCodeSha256':NS.file_hash(__file__),'optimizerCodeSha256':NS.file_hash(NS.ROOT/'work/neural-cma.cjs'),
                'inferenceShape':'single-row CUDA in training and independent validation',
                'boundary':'Fitness-only CMA adapts bilateral neural readout parameters; distances are diagnostic and maintain a separate explorer. All evaluations are closed-loop from the line. No teacher, timed route, position inputs or compatibility bypass. Private experiment; unchanged app version.'}
        NS.atomic_json(out/'report.json',report)
        print('MEMORY_READOUT_DONE '+json.dumps({k:v for k,v in report.items() if k not in ['records','environment','optimizer']}),flush=True)
    finally:
        for pipe in pipes:pipe.close()
        if optimizer:optimizer.close()

if __name__=='__main__':main()
