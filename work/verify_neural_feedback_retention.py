"""Full physical proof of self-retention using previously reward-trained weights."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import base64
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from neural_feedback_kernel import fit_basis
from neural_feedback_retention import RetentionActor,fit_consolidation
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(tag):
    if not tag.replace('-','').isalnum():raise ValueError('Scoped full retention proof required')
    torch.set_num_threads(2);torch.set_float32_matmul_precision('highest')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    source=out.parent/'neural-feedback-kernel32-20261025-01'
    try:
        desc=json.loads((source/'checkpoint.private.json').read_text())
        assert all(file_hash(ROOT/f)==sha for f,sha in desc['sourceHashes'].items())
        tensorfile=source/desc['tensorFile'];assert file_hash(tensorfile)==desc['tensorSha256']
        saved=torch.load(tensorfile,map_location='cuda:0',weights_only=True)
        env=Pipe(ROOT/'work/neural-feedback-retention-world.cjs',initialization={'configuration':{'horizonControls':200}});meta=env.metadata
        atomic_json(out/'metadata.private.json',meta)
        reference=env.request('reference');bank=np.frombuffer(base64.b64decode(reference['base64']),dtype='<f4').reshape(reference['shape']).copy()
        assert np.isfinite(bank).all() and len(bank)==meta['firstLapControls']
        np.save(out/'successful-neural-reference.private.npy',bank);reference.pop('base64');atomic_json(out/'reference-info.private.json',reference)
        basis=fit_basis(meta['neuralBasisSamples']);atomic_json(out/'basis.private.json',basis)
        assert file_hash(out/'basis.private.json')==desc['settings']['basisSha256']
        configuration=fit_consolidation(bank);atomic_json(out/'consolidation.private.json',configuration)
        actor=RetentionActor(basis,bank,configuration).to('cuda:0')
        missing,extra=actor.load_state_dict(saved['actor'],strict=False)
        assert all(k.startswith('consolidation.') for k in missing) and not extra
        # Validate exact retention on EVERY actually recorded first-lap vector.
        zero_rows=0;minimum=1.;maximum=0.
        with torch.no_grad():
            for offset in range(0,len(bank),64):
                x=torch.tensor(bank[offset:offset+64],device='cuda:0')
                gate=actor.consolidation(x);assert torch.count_nonzero(gate)==0
                assert torch.count_nonzero(actor.deterministic(x))==0
                zero_rows+=len(x)
        obs=env.request('reset',configuration={'mode':'from-line'})['observation'];controls=0;digest=hashlib.sha256();total_reward=0.;first_active=None;first_lap_exact=None;trace=[]
        while True:
            with torch.no_grad():
                x=torch.tensor([obs],dtype=torch.float32,device='cuda:0');gate=float(actor.consolidation(x)[0]);action=actor.deterministic(x)[0].cpu().tolist()
            state=env.request('step',action=action);controls+=1;total_reward+=state['reward']
            if controls<=meta['firstLapControls']:digest.update((state['info']['bodyFrameSha256']+'\n').encode())
            if controls==meta['firstLapControls']:
                first_lap_exact=digest.hexdigest()==meta['firstLapBodySequenceSha256'];assert first_lap_exact and state['info']['laps']==1
            if gate>1e-6 and first_active is None:first_active={'control':controls,'progress':state['info']['progress'],'gate':gate,'oldHeadGate':state['info']['oldHeadGate']}
            if controls%256==0 or gate>1e-6:trace.append({'control':controls,'gate':gate,'action':action,**state['info']})
            if controls%2048==0:print('RETENTION_DRIVING '+json.dumps({'controls':controls,'progress':state['info']['progress'],'laps':state['info']['laps'],'firstActive':first_active}),flush=True)
            obs=state['observation']
            if state['terminated'] or state['truncated']:break
        result={**state['info'],'controls':controls,'reward':total_reward,'terminated':state['terminated'],'truncated':state['truncated']}
        assert first_lap_exact and not state['truncated']
        torch.save({'actor':actor.state_dict()},out/'retention-actor.private.pt')
        atomic_json(out/'trace.private.json',trace)
        stats=env.request('stats');assert stats['gpuCalls']>0 and stats['cpuFallbacks']==0
        report={'format':'private-neural-self-retention-proof-v1','passed':True,'learningSucceeded':result['laps']>=2,'approvedForApp':False,
                'successfulReferenceRows':len(bank),'allReferenceRowsExactlyZeroResidual':zero_rows==len(bank),
                'fullFirstLapBodyAndNeuronsExact':first_lap_exact,'firstLapControls':meta['firstLapControls'],'firstLapBodySequenceSha256':digest.hexdigest(),
                'firstNovelNeuralAuthority':first_active,'baseline':meta['baseline'],'result':result,'checkpointSourceSha256':file_hash(source/'checkpoint.private.json'),
                'parentSha256':meta['parentSha256'],'worldSourceHashes':meta['sourceHashes'],
                'pythonSourceHashes':{f:file_hash(ROOT/f) for f in ['work/neural_feedback_retention.py','work/neural_feedback_kernel.py','work/verify_neural_feedback_retention.py']},
                'referenceSha256':file_hash(out/'successful-neural-reference.private.npy'),'configurationSha256':file_hash(out/'consolidation.private.json'),'cuda':stats,
                'boundary':'Existing reward-trained kernel weights migrated to a NEW private self-retention architecture, not a new PPO training or ordinary save. Reference contains only actual neural/own-command observations from the already successful lap; no target actions, route positions, lap/time input in the policy. Full native first-lap body and neuronal trace must match exactly even with nonzero learned weights. Novel states may still fail. This test alone cannot establish generalization, two-lap training, or application readiness.'}
        atomic_json(out/'report.json',report);print('RETENTION_PROOF '+json.dumps({k:v for k,v in report.items() if k not in ['pythonSourceHashes','worldSourceHashes','cuda']}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--tag',required=True);run(p.parse_args().tag)
