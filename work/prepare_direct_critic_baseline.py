"""Fit one critic intercept using actual initial-policy complete returns.

Three training lanes; fourth lane held out. No actor fit or action labels.
"""
import json
import math
import torch
from neural_ppo_parallel import Environments
from direct_neuronal_ppo_scaled import Learner
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash

BASE = ROOT/'.impeccable/review/neural-sacl'
OUT = BASE/'direct-critic-initial-return-calibration'

if __name__ == '__main__':
    OUT.mkdir(exist_ok=False)
    preflight_file = BASE/'direct-neuronal-scaled-preflight/verification.json'
    p = json.loads(preflight_file.read_text())
    assert p['passed']
    for file,digest in p['sourceHashes'].items():
        assert file_hash(ROOT/file) == digest
    learner = Learner(p['metadata']['initialWeights'],p['metadata']['dimension'])
    env, blocks = None, []
    try:
        env = Environments(ROOT/'work/neural-direct-scaled-env.cjs',{})
        metadata = env.metadata
        for index in range(8):
            blocks.append(env.all('rollout',weights=learner.weights(),std=learner.std(),steps=512))
            if all(sum(len(block[k]['episodes']) for block in blocks) >= 1 for k in range(4)):
                break
        lanes = [[r for block in blocks for r in block[k]['rows']] for k in range(4)]
        rows_by_lane, episodes_by_lane, censored_by_lane = [], [], []
        for rows in lanes:
            complete, start, count = [], 0, 0
            for j,row in enumerate(rows):
                if row['done']:
                    total, episode = 0., []
                    for v in reversed(rows[start:j+1]):
                        total += v['reward']
                        episode.append({'x':v['x'],'return':total})
                    complete.extend(reversed(episode))
                    count += 1
                    start = j+1
            assert count >= 1
            rows_by_lane.append(complete)
            episodes_by_lane.append(count)
            censored_by_lane.append(len(rows)-start)
        train = [r for lane in rows_by_lane[:3] for r in lane]
        holdout = rows_by_lane[3]
        def values(rows):
            x = torch.tensor([r['x'] for r in rows],dtype=torch.float64)
            y = torch.tensor([r['return'] for r in rows],dtype=torch.float64)
            with torch.no_grad():
                predicted = learner.critic(x).squeeze(-1)
            return predicted,y
        predicted,y = values(train)
        offset = (y-predicted).mean().item()
        def metrics(rows):
            pred,target = values(rows)
            return {'states':len(rows),'initialRMSE':(target-pred).square().mean().sqrt().item(),'calibratedRMSE':(target-pred-offset).square().mean().sqrt().item(),'returnMean':target.mean().item()}
        training, validation = metrics(train), metrics(holdout)
        assert math.isfinite(offset) and validation['calibratedRMSE'] < validation['initialRMSE']
        data = {'metadata':metadata,'weights':learner.weights(),'std':learner.std(),'blocks':blocks,'cudaByEnvironment':env.request('metadata_all')}
        atomic_json(OUT/'actual-rollouts.json',data)
        fit = {'passed':True,'format':'male-cns-critic-initial-return-intercept-v1','offset':offset,'gamma':1,'rewardScale':100,'trainingLanes':[0,1,2],'holdoutLane':3,'actualTransitions':sum(map(len,lanes)),'completeEpisodesByLane':episodes_by_lane,'censoredTailTransitionsByLane':censored_by_lane,'training':training,'holdout':validation,'preflightSha256':file_hash(preflight_file),'dataSha256':file_hash(OUT/'actual-rollouts.json'),'scriptSha256':file_hash(__file__),
               'boundary':'One critic output-bias offset fitted to complete Monte Carlo returns from unchanged initial policy. Holdout is a fourth independent RNG lane. Tail segments censored, no actor fitting, no teacher actions. Lower value error is not improved driving.'}
        atomic_json(OUT/'fit.json',fit)
        print(json.dumps(fit))
    finally:
        if env:
            env.close()
