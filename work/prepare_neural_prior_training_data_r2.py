"""Fit one critic intercept using actual initial-policy complete returns.

Three training lanes; fourth lane held out. No actor fit or action labels.
"""
import json
import math
import subprocess
import torch
from neural_ppo_parallel import Environments
from direct_neuronal_ppo_nonlinear import Learner
from neuronal_experiment_io_retry import ROOT, NODE, atomic_json, file_hash

BASE = ROOT/'.impeccable/review/neural-sacl'
OUT = BASE/'learned-prior-initial-calibration-r2'

if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    assert not (OUT/'fit.json').exists(), 'Preserve completed calibration'
    preflight_file = BASE/'learned-prior-final-readout-preflight/verification.json'
    p = json.loads(preflight_file.read_text())
    assert p['passed']
    for file,digest in p['sourceHashes'].items():
        assert file_hash(ROOT/file) == digest
    learner = Learner(p['metadata']['initialWeights'],p['metadata']['dimension'])
    with torch.no_grad():
        learner.log_std.copy_(torch.tensor([math.log(.1),math.log(.7)],dtype=torch.float64))
    env, blocks = None, []
    try:
        if (OUT/'actual-rollouts.json').exists():
            data=json.loads((OUT/'actual-rollouts.json').read_text())
            assert data['weights']==learner.weights() and data['std']==learner.std()
            for file,digest in data['samplingNodeSources'].items():
                assert file_hash(ROOT/file)==digest,file
            metadata,blocks=data['metadata'],data['blocks']
        else:
            env=Environments(ROOT/'work/neural-prior-training-env.cjs',{})
            metadata=env.metadata
            assert metadata['dimension']==642 and metadata['constantFeatureIndices']==[639]
            for index in range(8):
                blocks.append(env.all('rollout',weights=learner.weights(),std=learner.std(),steps=512))
                if all(sum(len(block[k]['episodes']) for block in blocks)>=1 for k in range(4)):
                    break
            entries=['work/neural-prior-readout-native-r2.cjs','work/neural-prior-training-objective-r8.cjs','work/neural-direct-temporal-noise.cjs']+[str(ROOT.joinpath(metadata[key]).relative_to(ROOT)).replace('\\\\','/') for key in ['priorModelFile','priorParentFile','priorPreparedFile']]
            script="process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(entries)+")));"
            closure=json.loads(subprocess.check_output([str(NODE),'-e',script],text=True,cwd=ROOT,creationflags=subprocess.CREATE_NO_WINDOW))
            closure['work/neural-prior-training-env.cjs']=file_hash(ROOT/'work/neural-prior-training-env.cjs')
            data={'metadata':metadata,'weights':learner.weights(),'std':learner.std(),'blocks':blocks,'cudaByEnvironment':env.request('metadata_all'),'samplingNodeSources':closure,'samplingScriptSha256':file_hash(__file__)}
            atomic_json(OUT/'actual-rollouts.json',data)
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
        scaler_x = torch.tensor([row['x'] for b in blocks[0] for row in b['rows'][:256]],dtype=torch.float64)
        assert scaler_x.shape == (1024,642) and torch.all(scaler_x[:,639] == 1)
        center,scale = scaler_x.mean(dim=0),scaler_x.std(dim=0,unbiased=False).clamp_min(.02)
        center[639],scale[639] = 0,1
        scaler = {'format':'male-cns-fixed-all-descending-scaler-v1','dimension':642,'center':center.tolist(),'scale':scale.tolist(),'stdFloor':.02,'clip':5,'actualFitTransitions':1024,'boundary':'Fixed input-only statistics on first256actual training observations per lane. Actions/rewards not fitted; linear branch uses raw inputs.'}
        atomic_json(OUT/'scaler.json',scaler)
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
        fit = {'passed':True,'format':'male-cns-learned-prior-critic-intercept-r8-v1','dimension':642,'scalerSha256':file_hash(OUT/'scaler.json'),'offset':offset,'gamma':1,'rewardScale':100,'trainingLanes':[0,1,2],'holdoutLane':3,'actualTransitions':sum(map(len,lanes)),'completeEpisodesByLane':episodes_by_lane,'censoredTailTransitionsByLane':censored_by_lane,'training':training,'holdout':validation,'preflightSha256':file_hash(preflight_file),'initialExplorationStd':learner.std(),'rewardRevision':'prior-progress-8-common-failure-base','trainingResetRevision':'actual-prior-first-lap-6350','dataSha256':file_hash(OUT/'actual-rollouts.json'),'scriptSha256':file_hash(__file__),
               'boundary':'One critic output-bias offset fitted to complete Monte Carlo returns from unchanged initial policy. Holdout is a fourth independent RNG lane. Tail segments censored, no actor fitting, no teacher actions. Lower value error is not improved driving.'}
        atomic_json(OUT/'fit.json',fit)
        print(json.dumps(fit))
    finally:
        if env:
            env.close()
