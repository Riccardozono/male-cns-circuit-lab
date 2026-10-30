"""Read-only GPU/native scalar comparison on actual recorded neuronal states.

This does not generate training examples or prove whole-trajectory parity.
"""
import json
from pathlib import Path
import numpy as np
import torch
from train_projected_residual_sac import encode
from neuronal_experiment_io import ROOT,atomic_json,file_hash


@torch.no_grad()
def main():
    if not torch.cuda.is_available():
        raise RuntimeError('Actual CUDA GPU required')
    torch.set_num_threads(1)
    torch.backends.cuda.matmul.allow_tf32=False
    torch.backends.cudnn.allow_tf32=False
    base=ROOT/'.impeccable/review/neural-sacl'
    prepared=json.loads((base/'projected-residual-3803-prepared/prepared.json').read_text(encoding='utf-8'))
    normalization=prepared['normalization']
    mean=np.asarray(normalization['mean'],dtype=np.float32)
    deviation=np.asarray(normalization['deviation'],dtype=np.float32)
    records=[]
    for name,actor_name in [('baseline','initial-actor.json'),('sac-final','final-actor.json')]:
        data_file=base/f'projected-sensory-information/{name}.json'
        data=json.loads(data_file.read_text(encoding='utf-8'))
        actor_file=base/'projected-residual-3803-sac-bounded'/actor_name
        if data['collectionRevision']!='precontrol-aligned-v2' or data['actorSha256']!=file_hash(actor_file):
            raise RuntimeError('Actual matched inference/observations required')
        actor=json.loads(actor_file.read_text(encoding='utf-8'))
        layers=[(torch.tensor(l['weights'],dtype=torch.float32,device='cuda'),torch.tensor(l['bias'],dtype=torch.float32,device='cuda')) for l in actor['layers']]
        def forward(x):
            for i,(w,b) in enumerate(layers):
                x=torch.nn.functional.linear(x,w,b)
                x=torch.relu(x) if i<2 else torch.tanh(x)
            # Same float32 Box[-1,1] unscale as the training environment.
            raw=x.cpu().numpy()
            return -1.+.5*(raw+1.)*2.
        observations=np.asarray([r['observation']+r['inference']['old']+[r['inference']['gate']] for r in data['rows']],dtype=np.float64)
        expected=np.asarray([r['inference']['residual'] for r in data['rows']],dtype=np.float64)
        x=torch.as_tensor(encode(observations,mean,deviation),device='cuda')
        single=np.concatenate([forward(row.unsqueeze(0)) for row in x])
        batched=forward(x)
        delta=single.astype(np.float64)-expected
        batch_delta=batched.astype(np.float64)-single.astype(np.float64)
        records.append({'mode':name,'actualObservations':len(expected),'observationsSha256':file_hash(data_file),'actorSha256':file_hash(actor_file),
            'nativeVsGpuSingleRow':{'maxAbsolute':float(np.max(np.abs(delta))),'rms':float(np.sqrt(np.mean(delta*delta))),
                                  'nonidenticalScalars':int(np.count_nonzero(delta)),'overOneTenThousandth':int(np.count_nonzero(np.abs(delta)>1e-4))},
            'gpuBatchVsGpuSingleRow':{'maxAbsolute':float(np.max(np.abs(batch_delta))),'rms':float(np.sqrt(np.mean(batch_delta*batch_delta)))}})
    out=base/'projected-actor-precision';out.mkdir(exist_ok=False)
    report={'completed':True,'gpu':torch.cuda.get_device_name(0),'torch':torch.__version__,'cuda':torch.version.cuda,'tf32':False,'records':records,
            'sourceSha256':file_hash(__file__),'boundary':'Actual recorded neuronal/controller states and numeric learned actor only. Native scalar outputs were recorded during matched real complete trajectories. This measures scalar arithmetic differences, NOT physical trajectory equivalence or proof that tiny differences cannot amplify. No weights, app, reward, teacher targets or training data changed.'}
    atomic_json(out/'report.json',report)
    print('ACTOR_PRECISION_AUDIT '+json.dumps(report),flush=True)


if __name__=='__main__':
    main()
