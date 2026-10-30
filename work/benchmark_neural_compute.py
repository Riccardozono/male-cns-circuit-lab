"""Bounded local numerical timing on actual states; NO optimizer updates or driving.

Runs while the explicitly recorded experiment may share the GPU, so this is a
current-machine/concurrent-load comparison, not an isolated hardware benchmark.
"""
import os
os.environ['OMP_NUM_THREADS']='1';os.environ['OPENBLAS_NUM_THREADS']='1'
import json
import time
import numpy as np
import torch
import gymnasium as gym
from neural_asymmetric_policy import AsymmetricTD3Policy,import_actor
from neural_transition_dataset import load_episode,complete_returns
from neuronal_experiment_io import ROOT,file_hash,atomic_json


def main():
    base=ROOT/'.impeccable/review/neural-sacl';out=base/'neuronal-compute-timing-v2';out.mkdir(exist_ok=False)
    report_file=base/'neuronal-command-3809-asymmetric-data/report.json';data_report=json.loads(report_file.read_text(encoding='utf-8'));data=load_episode(data_report['records'][0]);returns=complete_returns(data)
    source_actor_file=base/'neuronal-command-3803-cma-bias/best-actor.json';numeric=json.loads(source_actor_file.read_text(encoding='utf-8'));torch.set_num_threads(1);torch.backends.cuda.matmul.allow_tf32=False;torch.backends.cudnn.allow_tf32=False
    if not torch.cuda.is_available():raise RuntimeError('Actual4060CUDA comparison required')
    rows=[];initial_state=None
    for device in ['cpu','cuda']:
        torch.manual_seed(151061)
        policy=AsymmetricTD3Policy(gym.spaces.Box(-10,10,(557,),dtype=np.float32),gym.spaces.Box(-1,1,(2,),dtype=np.float32),lambda _:1e-4,net_arch={'pi':[64,64],'qf':[128,128]}).to(device)
        class Holder:pass
        holder=Holder();holder.actor=policy.actor;holder.actor_target=policy.actor_target;holder.device=device;import_actor(holder,numeric)
        if initial_state is None:initial_state={k:v.detach().cpu().clone() for k,v in policy.state_dict().items()}
        else:policy.load_state_dict(initial_state)
        x=torch.as_tensor(np.asarray(data[:256,:557]).copy(),device=device);a=torch.as_tensor(np.asarray(data[:256,557:559]).copy(),device=device);y=torch.as_tensor(returns[:256,None].copy(),device=device)
        def synchronize():
            if device=='cuda':torch.cuda.synchronize()
        def operation(kind):
            policy.zero_grad(set_to_none=True)
            if kind=='one_state_actor_numpy_roundtrip':
                with torch.no_grad():policy.actor(x[:1]).detach().cpu().numpy()
            elif kind=='actual_return_critic_backward_256':
                sum(torch.nn.functional.mse_loss(q,y) for q in policy.critic(x,a)).backward()
            else:(-policy.critic.q1_forward(x,policy.actor(x)).mean()).backward()
        for kind in ['one_state_actor_numpy_roundtrip','actual_return_critic_backward_256','actor_backward_256']:
            for _ in range(8):operation(kind)
            synchronize();started=time.perf_counter()
            for _ in range(100):operation(kind)
            synchronize();elapsed=time.perf_counter()-started
            row={'device':device,'operation':kind,'iterations':100,'millisecondsPerIteration':elapsed*1000/100};rows.append(row);print('NEURAL_COMPUTE_TIMING '+json.dumps(row),flush=True)
        if any(not torch.equal(initial_state[k],v.detach().cpu()) for k,v in policy.state_dict().items()):raise RuntimeError('Timing must never update the policy weights')
    identity={'pid':os.getpid(),'cpuThreads':1,'gpu':torch.cuda.get_device_name(0),'torch':torch.__version__,'cuda':torch.version.cuda,'actualSourceActorSha256':file_hash(source_actor_file),'actualDatasetReportSha256':file_hash(report_file),'sourceSha256':file_hash(__file__)}
    result={'passed':True,'identity':identity,'rows':rows,'optimizerUpdates':0,'newPhysicalEpisodes':0,'boundary':'Microtiming only, exact same frozen policy tensors and actual recorded inputs on CPU/CUDA. Backward gradients discarded, no optimizer or app writes. Concurrent GPU/CPU app/training load is present and uncontrolled; not an isolated hardware, total simulation speed or convergence benchmark.'}
    atomic_json(out/'report.json',result);print('NEURAL_COMPUTE_TIMING_DONE '+json.dumps(result),flush=True)


if __name__=='__main__':main()
