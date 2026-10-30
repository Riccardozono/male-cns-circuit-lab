"""Paired actual cold-body probe of IID versus persistent pedal exploration."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
import argparse
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped probe required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        env=Pipe(ROOT/'work/neural-feedback-world.cjs',initialization={'configuration':{'horizonControls':200}});meta=env.metadata;atomic_json(out/'metadata.private.json',meta)
        results=[]
        for name,rho in [('zero',None),('iid',[0.,0.]),('persistent-pedal',[0.,.95])]:
            seeds=[95261025] if name=='zero' else [95261025,95261027,95261029,95261031]
            for seed in seeds:
                rng=np.random.default_rng(seed);env.request('reset',configuration={'mode':'cold-training','headingKickRad':0})
                previous=None;controls=0;total=0.;trace=[]
                while True:
                    if rho is None:z=np.zeros(2)
                    else:
                        innovation=rng.normal(size=2)*[.015,.06]
                        z=innovation if previous is None else np.asarray(rho)*previous+np.sqrt(1-np.asarray(rho)**2)*innovation
                    state=env.request('step',action=np.tanh(z).tolist());previous=z;controls+=1;total+=state['reward']
                    trace.append({'latentResidual':z.tolist(),'outputs':state['info']['outputs'],'progress':state['info']['progress'],'reward':state['reward']})
                    if state['terminated'] or state['truncated']:break
                item={'method':name,'seed':seed,'controls':controls,'reward':total,'terminated':state['terminated'],'truncated':state['truncated'],**state['info']};results.append(item)
                atomic_json(out/f'{name}-{seed}.private.json',trace);print('PEDAL_EXPLORATION_PROBE '+json.dumps(item),flush=True)
        summaries=[]
        for name in ['zero','iid','persistent-pedal']:
            rows=[r for r in results if r['method']==name]
            summaries.append({'method':name,'cases':len(rows),'medianProgress':float(np.median([r['progress'] for r in rows])),
                              'minimumProgress':min(r['progress'] for r in rows),'safeCases':sum(r['safe'] for r in rows),
                              'terminatedByStall':sum(r['reason'] in ['ferma / senza progresso','troppo lenta / senza progresso'] for r in rows)})
        report={'format':'private-neural-feedback-pedal-exploration-probe-v1','passed':True,'learningSucceeded':False,'parentSha256':meta['parentSha256'],
                'results':results,'summaries':summaries,'latentStd':[.015,.06],'sourceSha256':file_hash(Path(__file__)),'cuda':env.request('stats'),
                'boundary':'Diagnostic stochastic exploration around the exact zero-residual neuronal parent, not a learned driver or action-label dataset. Four paired seeds forIID andAR1pedal, steeringIID in both. Cold bodies have real full physics and horizon200control truncation. Does not establish general learning advantage or two laps.'}
        atomic_json(out/'report.json',report);(out/'prober-at-run.py').write_bytes(Path(__file__).read_bytes());print('PEDAL_EXPLORATION_FINISHED '+json.dumps(summaries),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);a=p.parse_args();run(a.tag)
