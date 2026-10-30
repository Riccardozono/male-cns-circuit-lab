"""Real closed-loop reward comparison; no trajectory/action targets generated."""
import json
from pathlib import Path
import torch
import neural_sac as NS

def main():
    torch.set_num_threads(1)
    paths=[NS.ROOT/'.impeccable/review/neural-sacl/sac-protected-prior-cuda/best-own-model.zip',
           NS.ROOT/'.impeccable/review/neural-sacl/self-experience-first/best-own-model.zip']
    models=[NS.GentleWarmSAC.load(path,device='cuda') for path in paths]
    records=[]
    for bridge in ['neural-rl-bridge.cjs','neural-rl-bridge5.cjs']:
        NS.BRIDGE=NS.ROOT/'work'/bridge
        pipe=NS.NodePipe()
        try:
            results=[NS.validate(model,pipe,'full') for model in models]
            records.append({'objective':pipe.metadata['objectiveRevision'],
                            'earlyCrash':results[0],'fartherSafeStop':results[1]})
        finally:
            pipe.close()
    for key in ['bestProgress','laps','reason','totalSimulationSeconds']:
        for policy in ['earlyCrash','fartherSafeStop']:
            if records[0][policy][key]!=records[1][policy][key]:
                raise RuntimeError('Objective-only change altered physical behavior')
    old_wrong=records[0]['earlyCrash']['fitness']>records[0]['fartherSafeStop']['fitness']
    new_right=records[1]['fartherSafeStop']['fitness']>records[1]['earlyCrash']['fitness']
    if not old_wrong or not new_right:
        raise RuntimeError('Actual ranking correction was not demonstrated')
    output=NS.ROOT/'.impeccable/review/neural-sacl/reward-ranking'
    output.mkdir(parents=True,exist_ok=True)
    report={'passed':True,'samePhysicalOutcomes':True,'oldObjectiveRanksCrashHigher':old_wrong,
            'newObjectiveRanksFartherSafeStopHigher':new_right,'records':records,
            'boundary':'Same two own neural policies independently executed from the start line under two explicitly distinct objectives. Corrected ranking is not a completed lap or evidence of learned convergence. Original app/save/release unchanged.'}
    NS.atomic_json(output/'report.json',report)
    print('REWARD_RANKING_VERIFIED '+json.dumps(report),flush=True)

if __name__=='__main__':
    main()
