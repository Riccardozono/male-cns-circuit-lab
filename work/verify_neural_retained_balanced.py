"""Independent whole-driving restore of a retained-experience checkpoint."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from neural_retained_exploration import AdaptiveRetainedActor,conditional
from neural_retained_exploration_v2 import AdaptiveRetainedActorV2
from neural_retained_balanced import BalancedRetainedActor
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(checkpoint,tag):
    f=Path(checkpoint).resolve()
    if not f.is_relative_to(ROOT) or not tag.replace('-','').isalnum():raise ValueError('Scoped actual checkpoint required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        torch.set_num_threads(2);torch.set_float32_matmul_precision('highest')
        d=json.loads(f.read_text());training=json.loads((f.parent/'report.json').read_text());assert training['passed'] and file_hash(f)==training['checkpointSha256']
        assert all(file_hash(ROOT/p)==sha for p,sha in d['sourceHashes'].items())
        tensorfile=f.parent/d['tensorFile'];assert file_hash(tensorfile)==d['tensorSha256'];saved=torch.load(tensorfile,map_location='cuda:0',weights_only=True)
        ref=out.parent/'neural-feedback-retention-proof-20261025-01';bankfile=ref/'successful-neural-reference.private.npy';conf=ref/'consolidation.private.json'
        assert file_hash(bankfile)==d['settings']['sourceReferenceSha256'] and file_hash(conf)==d['settings']['consolidationSha256']
        bank=np.load(bankfile,allow_pickle=False);basis=json.loads((ref/'basis.private.json').read_text());configuration=json.loads(conf.read_text())
        cls={'private-neural-retained-exploration-checkpoint-v1':AdaptiveRetainedActor,'private-neural-retained-exploration-checkpoint-v2':AdaptiveRetainedActorV2,'private-neural-retained-balanced-checkpoint-v1':BalancedRetainedActor}[d['format']]
        current=cls(basis,bank,configuration).to('cuda:0');current.load_state_dict(saved['actor'])
        best=cls(basis,bank,configuration).to('cuda:0');best.load_state_dict(saved['bestActor'])
        env=Pipe(ROOT/'work/neural-feedback-retention-training-world.cjs',initialization={'configuration':{'horizonControls':200}});meta=env.metadata
        assert meta['parentSha256']==training['parentSha256']
        def episode(name,model,kick=0.):
            obs=env.request('reset',configuration={'mode':'from-line','headingKickRad':kick})['observation'];controls=0;digest=hashlib.sha256();prefix=hashlib.sha256();prefix_exact=None
            while True:
                if model is None:action=[0.,0.]
                else:
                    with torch.no_grad():action=model.deterministic(torch.tensor([obs],dtype=torch.float32,device='cuda:0'))[0].cpu().tolist()
                state=env.request('step',action=action);controls+=1
                digest.update(json.dumps([action,state['info']],separators=(',',':')).encode())
                if kick==0 and controls<=meta['firstLapControls']:prefix.update((state['info']['bodyFrameSha256']+'\n').encode())
                if kick==0 and controls==meta['firstLapControls']:
                    prefix_exact=prefix.hexdigest()==meta['firstLapBodySequenceSha256'];assert prefix_exact
                obs=state['observation']
                if controls%2048==0:print('RETAINED_RESTORE_DRIVING '+json.dumps({'name':name,'controls':controls,'progress':state['info']['progress'],'laps':state['info']['laps']}),flush=True)
                if state['terminated'] or state['truncated']:break
            result={'name':name,'headingKickRad':kick,'result':{**state['info'],'controls':controls,'terminated':state['terminated'],'truncated':state['truncated']},
                    'firstLapBodyAndNeuronsExact':prefix_exact,'traceSha256':digest.hexdigest()}
            atomic_json(out/(name+'.json'),result);print('RETAINED_RESTORE '+json.dumps(result),flush=True);return result
        current_run=episode('current',current);expected=training['events'][-1]['suffix']
        for key in ['progress','laps','reason','bodyFrameSha256']:assert current_run['result'][key]==expected[key]
        assert current_run['result']['controls']==meta['firstLapControls']+expected['controls']
        repeated=episode('current-repeat',current);assert repeated=={**current_run,'name':'current-repeat'}
        best_run=episode('best',best)
        for key in ['progress','laps','reason']:assert best_run['result'][key]==d['best'][key]
        perturbations=[]
        for sign,label in [(-1,'minus'),(1,'plus')]:
            before=episode('parent-'+label,None,sign*.00125);after=episode('current-'+label,current,sign*.00125)
            perturbations.append({'before':before,'after':after})
        # The first real rollout also checks the conditional-gradient formula
        # using safe NumPy array constructors only, not arbitrary pickle globals.
        safe=[np._core.multiarray._reconstruct,np.ndarray,np.dtype,np.dtypes.Float32DType]
        with torch.serialization.safe_globals(safe):
            first=torch.load(f.parent/'actual-rollout.private.pt',map_location='cpu',weights_only=True)
        model=cls(basis,bank,configuration);model.load_state_dict(first['actor']);model=model.double()
        b=first['batch'];ids=np.flatnonzero(b['active'])[:128];t=lambda values:torch.tensor(np.asarray(values)[ids],dtype=torch.float64)
        x=t(b['obs']);px=t(b['prevObs']);pz=t(b['prevLatent']);mask=t(b['continuation']);latent=t(b['latent']);oldlog=t(b['oldlog'])
        adv=torch.tensor(np.asarray(first['advantages'])[ids],dtype=torch.float64);adv=(adv-adv.mean())/(adv.std()+1e-8)
        def loss():return -((conditional(model,x,px,pz,mask).log_prob(latent).sum(-1)-oldlog).exp()*adv).mean()
        loss().backward()
        with torch.no_grad():strong=int(model.layers[0](x).sum(0).argmax())
        fd=[]
        for name,index in [('layers.1.steering',strong),('layers.1.pedal',strong),('log_std',1)]:
            parameter=dict(model.named_parameters())[name];value=float(parameter.detach()[index]);analytic=float(parameter.grad[index]);epsilon=1e-6
            with torch.no_grad():parameter[index]=value+epsilon;plus=float(loss());parameter[index]=value-epsilon;minus=float(loss());parameter[index]=value
            numeric=(plus-minus)/(2*epsilon);assert abs(numeric-analytic)<2e-6
            fd.append({'parameter':name,'index':index,'analytic':analytic,'finiteDifference':numeric,'error':abs(numeric-analytic)})
        stats=env.request('stats');assert stats['gpuCalls']>0 and stats['cpuFallbacks']==0
        report={'format':'private-neural-retained-checkpoint-proof-v1','passed':True,'learningSucceeded':best_run['result']['laps']>=2,'approvedForApp':False,
                'current':current_run,'exactRepeat':repeated,'best':best_run,'physicalPerturbations':perturbations,'finiteDifferences':fd,
                'bestIsZeroParent':bool(torch.count_nonzero(best.layers[-1].steering)==0 and torch.count_nonzero(best.layers[-1].pedal)==0),
                'checkpointSha256':file_hash(f),'tensorSha256':file_hash(tensorfile),'verifierSha256':file_hash(__file__),'sourceHashes':d['sourceHashes'],'cuda':stats,
                'boundary':'Fresh process and uncapped actual from-line physical/CUDA replay. Inherited prefix counted only after it is physically rerun and its body/brain sequence checked exactly. Current body final state must match the reported observed-boundary suffix; exact repeat and two small orientation perturbations are limited validation, not all-model/all-circuit convergence or Windows deployment.'}
        atomic_json(out/'report.json',report);print('RETAINED_RESTORE_FINISHED '+json.dumps({'passed':True,'current':current_run['result'],'best':best_run['result'],'finiteDifferences':fd}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);p.add_argument('--tag',required=True);a=p.parse_args();run(a.checkpoint,a.tag)
