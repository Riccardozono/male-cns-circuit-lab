"""Fresh physical replay and actuator/brain-dependence proof of learned modulation."""
import os
os.environ['OPENBLAS_NUM_THREADS']='2'
os.environ['OMP_NUM_THREADS']='2'
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from neural_motor_modulation import MotorModulationActor
from neuronal_experiment_io import ROOT,Pipe,atomic_json,file_hash


def run(checkpoint,tag):
    f=Path(checkpoint).resolve()
    if not f.is_relative_to(ROOT) or not tag.replace('-','').isalnum():raise ValueError('Scoped motor model proof required')
    out=ROOT/'.impeccable/review/learning-ml'/tag;out.mkdir(exist_ok=False);env=None
    try:
        torch.set_num_threads(2);torch.set_float32_matmul_precision('highest')
        desc=json.loads(f.read_text());training=json.loads((f.parent/'report.json').read_text());assert desc['format']=='private-neural-motor-population-checkpoint-v1'
        assert training['passed'] and file_hash(f)==training['checkpointSha256'] and all(file_hash(ROOT/p)==h for p,h in desc['sourceHashes'].items())
        pt=f.parent/desc['tensorFile'];assert file_hash(pt)==desc['tensorSha256'];saved=torch.load(pt,map_location='cuda:0',weights_only=True)
        ref=out.parent/'neural-feedback-retention-proof-20261025-01';bankfile=ref/'successful-neural-reference.private.npy';conf=ref/'consolidation.private.json'
        assert file_hash(bankfile)==desc['settings']['sourceReferenceSha256'] and file_hash(conf)==desc['settings']['consolidationSha256']
        bank=np.load(bankfile,allow_pickle=False);basis=json.loads((ref/'basis.private.json').read_text());configuration=json.loads(conf.read_text())
        current=MotorModulationActor(basis,bank,configuration).to('cuda:0');current.load_state_dict(saved['actor'])
        env=Pipe(ROOT/'work/neural-motor-modulation-world.cjs',initialization={'configuration':{'horizonControls':200}});meta=env.metadata
        assert meta['parentSha256']==training['parentSha256'] and meta['actionLength']==4
        def command_case(action):
            env.request('reset',configuration={'mode':'observed-lap-boundary'})
            return env.request('step',action=action)['info']['outputs']
        original=command_case([0,0,0,0]);steering_muted=command_case([0,0,-1,0]);pedal_muted=command_case([0,0,0,-1]);throttle_after_mute=command_case([0,.2,0,-1])
        assert steering_muted[0]==0 and steering_muted[1:]==original[1:]
        assert pedal_muted[1:]==[0,0] and abs(throttle_after_mute[1]-.4)<1e-12 and throttle_after_mute[2]==0
        silence=env.request('check-brain-silence');assert silence['allZero']
        def full(model,name):
            obs=env.request('reset',configuration={'mode':'from-line'})['observation'];controls=0;prefix=hashlib.sha256();digest=hashlib.sha256();prefix_exact=None
            while True:
                with torch.no_grad():action=model.deterministic(torch.tensor([obs],dtype=torch.float32,device='cuda:0'))[0].cpu().tolist()
                state=env.request('step',action=action);controls+=1;obs=state['observation']
                digest.update(json.dumps([action,state['info']],separators=(',',':')).encode())
                if controls<=meta['firstLapControls']:prefix.update((state['info']['bodyFrameSha256']+'\n').encode())
                if controls==meta['firstLapControls']:prefix_exact=prefix.hexdigest()==meta['firstLapBodySequenceSha256'];assert prefix_exact
                if controls%2048==0:print('MOTOR_PROOF_DRIVING '+json.dumps({'name':name,'controls':controls,'progress':state['info']['progress'],'laps':state['info']['laps']}),flush=True)
                assert not state['truncated']
                if state['terminated']:break
            return {'name':name,'result':{**state['info'],'controls':controls},'firstLapBodyAndNeuronsExact':prefix_exact,'traceSha256':digest.hexdigest()}
        current_full=full(current,'current-center');expected=training['finalCenter']
        assert all(current_full['result'][k]==expected[k] for k in ['progress','laps','reason','bodyFrameSha256'])
        assert current_full['result']['controls']==meta['firstLapControls']+expected['controls']
        best_full=None
        if training['learningSucceeded']:
            best=MotorModulationActor(basis,bank,configuration).to('cuda:0');best.load_state_dict(saved['bestActor']);best_full=full(best,'best')
            assert best_full['result']['laps']>=2
        stats=env.request('stats');assert stats['gpuCalls']>0 and stats['cpuFallbacks']==0
        report={'format':'private-neural-motor-population-proof-v1','passed':True,'learningSucceeded':best_full is not None,'approvedForApp':False,
                'currentFull':current_full,'bestFull':best_full,'brainSilence':silence,
                'actuatorCases':{'baseline':original,'steeringGainMinus1':steering_muted,'pedalGainMinus1':pedal_muted,'positivePedalAfterMutingOldPedal':throttle_after_mute},
                'checkpointSha256':file_hash(f),'tensorSha256':file_hash(pt),'verifierSha256':file_hash(__file__),'sourceHashes':desc['sourceHashes'],'cuda':stats,
                'boundary':'New process, learned coherent weight/gain/bias center rerun physically from the start. Actuator extreme cases are decoder regressions only, not training target actions. Brain silence must yield three zero commands; inertia may still move a car. First-lap body/brain retention is verified, not a newly learned first lap or generalization. Current final state must exactly match the logged real-boundary suffix. No app/save compatibility or release approval.'}
        atomic_json(out/'report.json',report);print('MOTOR_PROOF '+json.dumps({k:v for k,v in report.items() if k not in ['sourceHashes','cuda']}),flush=True)
    except BaseException as error:atomic_json(out/'failure.json',{'error':repr(error)});raise
    finally:
        if env:env.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);p.add_argument('--tag',required=True);a=p.parse_args();run(a.checkpoint,a.tag)
