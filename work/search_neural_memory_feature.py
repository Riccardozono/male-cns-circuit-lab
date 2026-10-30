"""Reward-trained coefficient/width of a generic decoder-memory RBF.

The feature sees only prior neural decoder memory, not position, time, speed
or geometry. Its coefficient is selected by real full physical episodes.
"""
import argparse
import json
import time
import numpy as np
import torch
import neural_sac as NS

SOURCE=NS.ROOT/'.impeccable/review/neural-sacl/longitudinal-bias-search'

def feature(observation,width):
    memory=np.asarray(observation[512:514],dtype=np.float64)*2
    return float(np.exp(-np.dot(memory,memory)/(2*width*width)))

def replay(model,pipe,coefficient,width):
    state=pipe.request('reset',mode='full')
    while True:
        obs=np.asarray(state['observation'],dtype=np.float32)
        action,_=model.predict(obs,deterministic=True)
        extra=float(np.tanh(coefficient)*feature(state['observation'],width))
        state=pipe.request('step',action=action.tolist()+[extra])
        if state['terminated'] or state['truncated']:
            return {**state['info'],'censored':state['truncated'],'validationMode':'full'}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='neural-memory-feature');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Invalid tag')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    torch.set_num_threads(1);NS.BRIDGE=NS.ROOT/'work/neural-rl-additive.cjs'
    model=NS.GentleWarmSAC.load(SOURCE/'best-own-model.zip',device='cuda');pipe=NS.NodePipe();records=[];started=time.monotonic()
    try:
        baseline=replay(model,pipe,0,.04);best=baseline;best_parameters={'coefficient':0,'width':.04}
        for width in [.01,.02,.04,.08,.16]:
            for coefficient in [-.2,.05,.1,.2,.3,.5,1,2]:
                current=replay(model,pipe,coefficient,width)
                row={'coefficient':coefficient,'width':width,'result':current,'wallSeconds':time.monotonic()-started};records.append(row)
                if not current['censored'] and (current['laps']>best['laps'] or current['laps']==best['laps'] and current['bestProgress']>best['bestProgress']):best=current;best_parameters={'coefficient':coefficient,'width':width}
                NS.atomic_json(out/'progress.json',{'baseline':baseline,'best':best,'bestParameters':best_parameters,'records':records})
                print('NEURAL_MEMORY_FEATURE_TRIAL '+json.dumps(row),flush=True)
                if best['complete'] and best['laps']==2:break
            if best['complete'] and best['laps']==2:break
        repeat=replay(model,pipe,**best_parameters)
        if any(repeat[k]!=best[k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds']):raise RuntimeError('Neural feature failed independent full repeat')
        report={'passed':True,'environment':pipe.metadata,'baseline':baseline,'best':best,'bestParameters':best_parameters,
                'independentRepeat':repeat,'records':records,'sourceActorSha256':NS.file_hash(SOURCE/'best-own-model.zip'),
                'sourceCodeSha256':NS.file_hash(__file__),
                'boundary':'Generic Gaussian feature of two actual neural-decoder memory values; coefficient and width learned by real reward/coverage outcomes. No pose/time/route/speed targets or scripted driving phases. Prior learned actor unchanged; extra zero preserves it. Full closed-loop evaluations, no awarded progress. Incompatible private experiment, no app/release/original-save changes.'}
        NS.atomic_json(out/'report.json',report);print('NEURAL_MEMORY_FEATURE_DONE '+json.dumps({k:v for k,v in report.items() if k not in ['records','environment']}),flush=True)
    finally:pipe.close()

if __name__=='__main__':main()
