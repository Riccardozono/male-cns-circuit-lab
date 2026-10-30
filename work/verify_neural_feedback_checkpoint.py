"""Fresh-process restore and actual uncapped driving of a private PPO checkpoint."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import hashlib
import json
from pathlib import Path
import torch
from neural_feedback_ppo import Actor
from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


def run(checkpoint,tag):
    f=Path(checkpoint).resolve()
    if not f.is_relative_to(ROOT) or not tag.replace('-','').isalnum():raise ValueError('Scoped private checkpoint proof required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        desc=json.loads(f.read_text());report=json.loads((f.parent/'report.json').read_text());assert report['passed'] and report['checkpointSha256']==file_hash(f)
        assert all(file_hash(ROOT/name)==sha for name,sha in desc['sourceHashes'].items())
        kind=desc['format'];world={'private-neural-feedback-ppo-checkpoint-v1':'neural-feedback-world.cjs',
                                 'private-neural-feedback-ar1-checkpoint-v1':'neural-feedback-world-v2.cjs'}[kind]
        pt=f.parent/desc['tensorFile'];assert file_hash(pt)==desc['tensorSha256'];torch.set_num_threads(2)
        data=torch.load(pt,map_location='cuda:0',weights_only=True);current=Actor().to('cuda:0');current.load_state_dict(data['actor'])
        best=Actor().to('cuda:0');best.load_state_dict(data['bestActor'])
        env=Pipe(ROOT/'work'/world,initialization={'configuration':{'horizonControls':200}});meta=env.metadata
        assert meta['parentSha256']==desc['parentSha256']
        def episode(name,model,kick=0.):
            obs=env.request('reset',configuration={'mode':'from-line','headingKickRad':kick})['observation'];controls=0;reward=0.;digest=hashlib.sha256()
            while True:
                if model is None:action=[0.,0.]
                else:
                    with torch.no_grad():action=model.deterministic(torch.tensor([obs],device='cuda:0',dtype=torch.float32))[0].cpu().tolist()
                state=env.request('step',action=action);controls+=1;reward+=state['reward']
                digest.update(json.dumps([obs,action,state['info'],state['reward']],separators=(',',':')).encode());obs=state['observation']
                if state['terminated'] or state['truncated']:break
            result={**state['info'],'controls':controls,'reward':reward,'terminated':state['terminated'],'truncated':state['truncated']}
            value={'name':name,'headingKickRad':kick,'result':result,'traceSha256':digest.hexdigest()}
            atomic_json(out/(name+'.json'),value);print('FEEDBACK_RESTORE '+json.dumps(value),flush=True);return value
        last_evaluation=next(item['evaluation'] for item in reversed(report['events']) if item.get('evaluation') is not None)
        current_run=episode('learned-current',current);assert current_run['result']==last_evaluation
        repeated=episode('learned-current-repeat',current);assert repeated['result']==current_run['result'] and repeated['traceSha256']==current_run['traceSha256']
        best_run=episode('protected-best',best)
        for field in ['progress','laps','reason','terminated','truncated']:assert best_run['result'][field]==desc['bestResult'][field]
        best_zero=bool(torch.count_nonzero(best.layers[-1].weight).item()==0 and torch.count_nonzero(best.layers[-1].bias).item()==0)
        perturbations=[]
        for sign,label in [(-1,'minus'),(1,'plus')]:
            before=episode('zero-parent-'+label,None,sign*.00125);after=episode('learned-current-'+label,current,sign*.00125)
            perturbations.append({'before':before,'after':after})
        cuda=env.request('stats');assert cuda['gpuCalls']>0 and cuda['cpuFallbacks']==0
        proof={'format':'private-neural-feedback-restore-proof-v1','passed':True,'learningSucceeded':best_run['result']['laps']>=2,
               'approvedForApp':False,'checkpointFile':str(f),'checkpointSha256':file_hash(f),'tensorSha256':file_hash(pt),
               'bestIsInitialZeroResidualParent':best_zero,'best':best_run,'current':current_run,'exactRepeat':repeated,
               'physicalHeadingPerturbations':perturbations,'sourceHashes':desc['sourceHashes'],'verifierSha256':file_hash(Path(__file__)),
               'parentSha256':meta['parentSha256'],'cuda':cuda,
               'boundary':'New process, checksum-checked weights and full from-line actual physics/CUDA graph, no snapshot shortcut. Current exact replay does not prove good driving. Best zero residual, when true, is the unchanged prior driver. Two heading kicks are a small stability probe, not generalization across circuits or a release test.'}
        atomic_json(out/'report.json',proof)
        print('FEEDBACK_RESTORE_FINISHED '+json.dumps({'passed':True,'bestIsZeroParent':best_zero,'best':best_run['result'],'current':current_run['result']}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);p.add_argument('--tag',required=True);args=p.parse_args();run(args.checkpoint,args.tag)
