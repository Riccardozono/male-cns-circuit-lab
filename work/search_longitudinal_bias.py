"""Real reward-driven mutations of one learned longitudinal output bias.

No steering/pose/time/desired-speed rule; all commands still come from the
same neuronal actor. Every candidate is driven independently from the line.
"""
import argparse
import copy
import json
import time
import numpy as np
import torch
import neural_sac as NS

SOURCE=NS.ROOT/'.impeccable/review/neural-sacl/self-experience-first'

def replay(model,pipe,trace=False):
    state=pipe.request('reset',mode='full');rows=[];steps=0
    while True:
        obs=np.asarray(state['observation'],dtype=np.float32)
        action,_=model.predict(obs,deterministic=True)
        if trace:
            with torch.no_grad():
                mean,log_std,_=model.actor.get_action_dist_params(torch.as_tensor(obs[None],device='cuda'))
            rows.append({**pipe.request('inspect'),'actorAction':action.tolist(),
                         'actorLogits':mean[0].cpu().tolist()})
        state=pipe.request('step',action=action.tolist());steps+=1
        if state['terminated'] or state['truncated']:
            return {'result':{**state['info'],'censored':state['truncated'],'validationMode':'full'},
                    'rows':rows,'steps':steps}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='longitudinal-bias-search');args=parser.parse_args()
    if not args.tag.replace('-','').isalnum():raise ValueError('Invalid tag')
    output=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;output.mkdir(parents=True,exist_ok=False)
    torch.set_num_threads(1)
    if not torch.cuda.is_available():raise RuntimeError('Actual CUDA required')
    NS.BRIDGE=NS.ROOT/'work/neural-rl-diagnostic.cjs'
    model=NS.GentleWarmSAC.load(SOURCE/'best-own-model.zip',device='cuda')
    reference=copy.deepcopy(model.actor.state_dict());original=float(model.actor.mu.bias[1].item())
    pipe=NS.NodePipe();records=[];started=time.monotonic()
    try:
        baseline=replay(model,pipe,True);best=baseline['result'];best_state=copy.deepcopy(reference);best_delta=0
        NS.atomic_json(output/'baseline-telemetry.json',baseline)
        for delta in [-4,-2,-1,-.5,-.25,-.1,.1,.25,.5,1,2,4,8,12]:
            model.actor.load_state_dict(reference)
            with torch.no_grad():model.actor.mu.bias[1]=original+delta
            current=replay(model,pipe)['result']
            record={'biasDelta':delta,'result':current,'wallSeconds':time.monotonic()-started};records.append(record)
            if not current['censored'] and (current['laps']>best['laps'] or current['laps']==best['laps'] and current['bestProgress']>best['bestProgress']):
                best=current;best_delta=delta;best_state=copy.deepcopy(model.actor.state_dict());model.save(output/'best-own-model.zip')
            NS.atomic_json(output/'progress.json',{'baseline':baseline['result'],'best':best,'bestDelta':best_delta,'records':records})
            print('BIAS_PHYSICAL_TRIAL '+json.dumps(record),flush=True)
            if best['complete'] and best['laps']==2:break
        model.actor.load_state_dict(best_state)
        repeated=replay(model,pipe,True)
        if any(best[k]!=repeated['result'][k] for k in ['bestProgress','fitness','laps','reason','totalSimulationSeconds']):
            raise RuntimeError('Best mutation failed independent from-line repeat')
        model.save(output/'best-own-model.zip')
        report={'passed':True,'environment':pipe.metadata,'sourceActorSha256':NS.file_hash(SOURCE/'best-own-model.zip'),
                'sourceCodeSha256':NS.file_hash(__file__),'baseline':baseline['result'],'best':best,'bestDelta':best_delta,
                'independentRepeat':repeated['result'],'records':records,
                'boundary':'One learned actor output bias is mutated, not a car action schedule or route. Anatomical graph and learned steering weights unchanged. All trials/repeat are actual closed-loop from-line driving. Greater coverage and reward remain separate; no legacy app/save/release modification.'}
        NS.atomic_json(output/'best-telemetry.json',repeated);NS.atomic_json(output/'report.json',report)
        print('BIAS_SEARCH_DONE '+json.dumps({k:v for k,v in report.items() if k not in ['records','environment']}),flush=True)
    finally:pipe.close()

if __name__=='__main__':main()
