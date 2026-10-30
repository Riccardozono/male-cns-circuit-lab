"""Validate the conflict correction on the first genuine recorded PPO batch."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import copy
import json
from pathlib import Path
import torch
from neural_feedback_ar1 import Actor
from neural_feedback_multitask import update_actor
from neuronal_experiment_io import ROOT,atomic_json,file_hash


def main():
    torch.set_num_threads(2)
    source=ROOT/'.impeccable/review/learning-ml/neural-feedback-ar1-ppo32-20261025-01';out=source.parent/'neural-feedback-multitask-preflight-20261025-01';out.mkdir(exist_ok=False)
    saved=torch.load(source/'actual-rollout.private.pt',map_location='cpu',weights_only=True);b=saved['batch'];episodes=json.loads((source/'local-episodes.private.json').read_text())
    labels=[]
    for episode in episodes:
        if episode['update']!=1:break
        labels.extend([episode['reset']['mode']=='cold-training']*episode['controls'])
    # Last incomplete episode was not logged with a reset identity: exclude it
    # rather than invent its category. The new trainer logs every sample label.
    n=len(labels);t=lambda v:torch.tensor(v[:n],dtype=torch.float32,device='cuda:0')
    actor=Actor().to('cuda:0');actor.load_state_dict(saved['actor']);before=copy.deepcopy(actor.state_dict())
    records=update_actor(actor,t(b['obs']),t(b['prevObs']),t(b['prevActions']),t(b['continuation']),t(b['actions']),t(b['logp']),t(b['centers']),t(b['std']),saved['advantages'][:n].to('cuda:0'),torch.tensor(labels,device='cuda:0'))
    assert any(r['acceptedFraction']>0 for r in records)
    assert all(min(a-b for a,b in zip(r['afterGroupSurrogates'],r['beforeGroupSurrogates']))>=-2e-7 and max(r['postGroupMeanKL'])<=.0100001 for r in records)
    changed=sum(int(torch.count_nonzero(v-before[k])) for k,v in actor.state_dict().items());assert changed>0
    files=['work/neural_feedback_multitask.py','work/verify_neural_feedback_multitask.py','work/neural_feedback_ar1.py','work/neural_feedback_ppo.py']
    report={'format':'private-neural-feedback-multitask-proof-v1','passed':True,'learningSucceeded':False,'actualControls':n,
            'coldControls':sum(labels),'movingResetControls':n-sum(labels),'unlabelledTrailingControlsExcluded':len(b['obs'])-n,
            'records':records,'changedCoefficients':changed,'sourceHashes':{f:file_hash(ROOT/f) for f in files},
            'actualRolloutSha256':file_hash(source/'actual-rollout.private.pt'),'episodeLogSha256':file_hash(source/'local-episodes.private.json'),
            'boundary':'Both observed-data surrogates improve under checked per-group KL. This is an optimizer regression on actual recorded rewards/neuronal observations, not a fresh driving result or proof of two laps. No desired actions or reset-category inputs enter the policy.'}
    atomic_json(out/'report.json',report);torch.save({'actor':actor.state_dict()},out/'diagnostic-actor.private.pt');print(json.dumps(report),flush=True)


if __name__=='__main__':main()
