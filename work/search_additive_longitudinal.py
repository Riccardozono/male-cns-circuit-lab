"""Select an initial longitudinal residual bias using real full episodes.

The prior learned neuronal actor remains intact. The extra bias is an actor
parameter, not a position/time-triggered command or a speed/route rule.
"""
import argparse
import json
import time
import numpy as np
import torch
import neural_sac as NS

SOURCE=NS.ROOT/'.impeccable/review/neural-sacl/longitudinal-bias-search'

def replay(model,pipe,bias):
    state=pipe.request('reset',mode='full')
    while True:
        action,_=model.predict(np.asarray(state['observation'],dtype=np.float32),deterministic=True)
        state=pipe.request('step',action=action.tolist()+[float(np.tanh(bias))])
        if state['terminated'] or state['truncated']:
            return {**state['info'],'censored':state['truncated'],'validationMode':'full'}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='additive-longitudinal-bias');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Invalid tag')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    torch.set_num_threads(1);NS.BRIDGE=NS.ROOT/'work/neural-rl-additive.cjs'
    model=NS.GentleWarmSAC.load(SOURCE/'best-own-model.zip',device='cuda');pipe=NS.NodePipe();records=[];started=time.monotonic()
    try:
        baseline=replay(model,pipe,0)
        source=json.loads((SOURCE/'report.json').read_text(encoding='utf-8'))['independentRepeat']
        if any(baseline[k]!=source[k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds']):raise RuntimeError('Zero additive head changed prior learned controller')
        best=baseline;best_bias=0
        for bias in [-.5,-.25,-.1,-.05,.025,.05,.075,.1,.15,.2,.3,.5,1,2]:
            result=replay(model,pipe,bias);row={'bias':bias,'result':result,'wallSeconds':time.monotonic()-started};records.append(row)
            if not result['censored'] and (result['laps']>best['laps'] or result['laps']==best['laps'] and result['bestProgress']>best['bestProgress']):best=result;best_bias=bias
            NS.atomic_json(out/'progress.json',{'baseline':baseline,'best':best,'bestBias':best_bias,'records':records})
            print('ADDITIVE_PHYSICAL_TRIAL '+json.dumps(row),flush=True)
            if best['complete'] and best['laps']==2:break
        repeat=replay(model,pipe,best_bias)
        if any(repeat[k]!=best[k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds']):raise RuntimeError('Additive head failed independent repeat')
        report={'passed':True,'environment':pipe.metadata,'sourceActorSha256':NS.file_hash(SOURCE/'best-own-model.zip'),
                'sourceCodeSha256':NS.file_hash(__file__),'baseline':baseline,'best':best,'bestBias':best_bias,'independentRepeat':repeat,'records':records,
                'boundary':'Prior genuinely learned neuronal actor is unchanged; new bounded additive longitudinal actor bias selected by real physical outcome. No position/time/route/desired speed inputs. Old zero-head behavior exactly preserved. Full from-line evaluations, no awarded progress. Incompatible private experiment, no original app/save/release changes.'}
        NS.atomic_json(out/'report.json',report);print('ADDITIVE_SEARCH_DONE '+json.dumps({k:v for k,v in report.items() if k not in ['environment','records']}),flush=True)
    finally:pipe.close()

if __name__=='__main__':main()
