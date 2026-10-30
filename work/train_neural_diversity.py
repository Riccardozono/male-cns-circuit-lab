"""Actual-reward diversity search; safe champion and exploration are distinct.

Unsafe models can be mutated, never promoted as safe. No physics/reward change,
route control, teacher action, fake state, invented example or lap shortcut.
"""
import argparse
import json
import time
import neural_sac as NS

def record(weights,episode):
    s=episode['result'];return {'weights':weights,'fitness':s['fitness'],'progress':s['bestProgress'],'laps':s['laps'],'reason':s['reason'],
        'censored':episode['censored'],'overlap':episode['gasBrakeOverlapSteps']}
def same(a,b):
    return all(a['result'][k]==b['result'][k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])

def main():
    p=argparse.ArgumentParser();p.add_argument('--tag',default='neural-diversity-first');p.add_argument('--generations',type=int,default=40);p.add_argument('--population',type=int,default=48)
    args=p.parse_args()
    if not args.tag.replace('-','').isalnum() or not 1<=args.generations<=100 or not 4<=args.population<=100:raise ValueError('Invalid settings')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    source=NS.ROOT/'.impeccable/review/neural-sacl/frontier-linear-cma-first/report.json';prior=json.loads(source.read_text(encoding='utf-8'))
    if not prior['passed']:raise RuntimeError('Verified own physical seeds required')
    seeds=[record(prior['champion']['weights'],prior['fullChampion'])]+[record(r['weights'],r['episode']) for r in prior['records']]
    NS.BRIDGE=NS.ROOT/'work/neural-context-linear-env.cjs';pipes=[];optimizer=None;records=[];validations=[];started=time.monotonic()
    try:
        for _ in range(4):pipes.append(NS.NodePipe())
        metadata=pipes[0].metadata
        if any(p.metadata!=metadata for p in pipes):raise RuntimeError('Different physical environments')
        for key in ['graph','objectiveRevision','vehicleRevision','sourceModelSha256','gateBasisSha256','projectionSha256']:
            if metadata[key]!=prior['environment'][key]:raise RuntimeError('Changed seed environment: '+key)
        baseline=pipes[0].request('evaluate',weights=prior['champion']['weights'],mode='full')
        if not same(baseline,prior['fullChampion']):raise RuntimeError('Actual baseline does not match own source')
        NS.BRIDGE=NS.ROOT/'work/neural-diversity-transport.cjs';original=NS.NodePipe.request
        def initialize(self,op,**fields):
            if op=='init':fields.update(configuration={'dimensions':10,'binMetres':25,'maxProgress':20000,'population':args.population},seed=151020,seeds=seeds)
            return original(self,op,**fields)
        NS.NodePipe.request=initialize
        try:optimizer=NS.NodePipe()
        finally:NS.NodePipe.request=original
        state=optimizer.request('state');previous=state['champion'];history=[]
        identity={'configuration':vars(args),'environment':metadata,'ownSeedReportSha256':NS.file_hash(source),
          'sourceHashes':{f:NS.file_hash(NS.ROOT/f) for f in ['work/train_neural_diversity.py','work/neural-diversity.cjs','work/neural-diversity-transport.cjs','work/neural-context-linear-env.cjs']}}
        NS.atomic_json(out/'identity.json',identity)
        print('DIVERSITY_READY '+json.dumps({'seeds':len(seeds),'cells':len(state['cells']),'baseline':baseline['result']}),flush=True)
        for generation in range(1,args.generations+1):
            candidates=optimizer.request('ask');current=[]
            for offset in range(0,len(candidates),4):
                batch=candidates[offset:offset+4];ids=[pipe.send('evaluate',weights=r['weights'],mode='practice') for pipe,r in zip(pipes,batch)]
                for pipe,candidate,rid in zip(pipes,batch,ids):
                    episode=pipe.receive(rid)
                    if episode['gasBrakeOverlapSteps']:raise RuntimeError('Motor pedals overlap')
                    r={**candidate,'episode':episode,'generation':generation};records.append(r);current.append(record(candidate['weights'],episode))
            optimizer.request('offer',candidates=current);state=optimizer.request('state')
            if state['champion']['weights']!=previous['weights']:
                weights=state['champion']['weights'];full=pipes[0].request('evaluate',weights=weights,mode='full');repeat=pipes[0].request('evaluate',weights=weights,mode='full')
                if not same(full,repeat) or full['result']['fitness']!=state['champion']['fitness'] or full['result']['bestProgress']!=state['champion']['progress']:raise RuntimeError('Promotion fails full physical validation')
                validations.append({'generation':generation,'weights':weights,'full':full,'repeat':repeat});previous=state['champion']
                NS.atomic_json(out/'verified-champion.json',validations[-1])
            furthest=max(state['cells'],key=lambda r:(r['laps'],r['progress']));row={'generation':generation,'champion':state['champion'],'furthest':furthest,'cells':len(state['cells']),'evaluations':len(records),'wallSeconds':time.monotonic()-started};history.append(row)
            NS.atomic_json(out/'progress.json',{'identity':identity,'state':state,'history':history,'validations':validations,'records':records})
            print('DIVERSITY_PROGRESS '+json.dumps({'generation':generation,'safeProgress':state['champion']['progress'],'safeLaps':state['champion']['laps'],'furthest':furthest['progress'],'furthestReason':furthest['reason'],'cells':len(state['cells']),'wallSeconds':row['wallSeconds']}),flush=True)
            if state['champion']['laps']==2:break
        full=pipes[0].request('evaluate',weights=state['champion']['weights'],mode='full');repeat=pipes[0].request('evaluate',weights=state['champion']['weights'],mode='full')
        explored=pipes[0].request('evaluate',weights=furthest['weights'],mode='full')
        if not same(full,repeat) or full['result']['fitness']!=state['champion']['fitness'] or explored['result']['bestProgress']!=furthest['progress']:raise RuntimeError('Final full replay differs')
        report={'passed':True,'identity':identity,'state':state,'history':history,'records':records,'validations':validations,'fullChampion':full,'independentChampionRepeat':repeat,'fullExplorer':explored,
            'boundary':'Behavior archive inspired by MAP-Elites, customized parameter mutation. Archive descriptors are evaluator metrics, never policy inputs. Unsafe candidates are exploration parents only, not safe champions. Rewards, neuronal graph and physics unchanged. Cached practice is not full laps/generations; independent complete from-line validation is separate. No normal app/save/release changes.'}
        NS.atomic_json(out/'report.json',report);print('DIVERSITY_DONE '+json.dumps({'passed':True,'safe':full['result'],'furthest':explored['result'],'evaluations':len(records)}),flush=True)
    finally:
        for pipe in pipes:pipe.close()
        if optimizer:optimizer.close()

if __name__=='__main__':main()
