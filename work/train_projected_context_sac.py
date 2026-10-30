"""Real reward learning of a continuous neuronal motor residual, on CUDA.

The old learned policy is frozen. Activation and all observations are neuronal.
This residual retains authority after observed contexts disappear.
"""
import argparse
import json
import time
import numpy as np
import gymnasium as gym
import torch
import neural_sac as NS
from stable_baselines3.common.callbacks import BaseCallback

def encode(raw,mean,deviation):
    return np.clip((np.asarray(raw,dtype=np.float32)-mean)/deviation,-10,10).astype(np.float32)

class ResidualVec(NS.NeuralVec):
    def __init__(self,count,mean,deviation):
        self.mean=mean;self.deviation=deviation;super().__init__(count)
        self.observation_space=gym.spaces.Box(-10,10,shape=(9,),dtype=np.float32)
    def reset(self):return encode(super().reset(),self.mean,self.deviation)
    def step_wait(self):
        observations,rewards,dones,infos=super().step_wait()
        for info in infos:
            if 'terminal_observation' in info:info['terminal_observation']=encode(info['terminal_observation'],self.mean,self.deviation)
        return encode(observations,self.mean,self.deviation),rewards,dones,infos

def validate(model,pipe,mean,deviation,mode='full'):
    state=pipe.request('reset',mode=mode)
    while True:
        # Fixed single-row inference in independent validation.
        action,_=model.predict(encode(state['observation'],mean,deviation),deterministic=True)
        state=pipe.request('step',action=action.tolist())
        if state['terminated'] or state['truncated']:return {**state['info'],'censored':state['truncated'],'validationMode':mode}

class Checkpoint(BaseCallback):
    def __init__(self,out,pipe,mean,deviation,baseline,interval):
        super().__init__();self.out=out;self.pipe=pipe;self.mean=mean;self.deviation=deviation;self.best=baseline
        self.interval=interval;self.last=0;self.started=time.monotonic();self.evaluations=[]
    def _on_step(self):
        if self.num_timesteps-self.last<self.interval:return True
        self.last=self.num_timesteps;result=validate(self.model,self.pipe,self.mean,self.deviation)
        if not result['censored'] and result['fitness']>self.best['fitness'] and result['bestProgress']>=self.best['bestProgress']:
            self.best=result;self.model.save(self.out/'best-own-residual.zip')
        row={'steps':self.num_timesteps,'gradientUpdates':self.model._n_updates,'full':result,
             'practiceEpisodes':self.training_env.episodes,'bestPracticeProgress':self.training_env.best_practice,
             'wallSeconds':time.monotonic()-self.started};self.evaluations.append(row)
        self.model.save(self.out/'latest-own-residual.zip')
        NS.atomic_json(self.out/'progress.json',{'best':self.best,'evaluations':self.evaluations})
        print('CONTEXT_RESIDUAL_SAC_PROGRESS '+json.dumps(row),flush=True)
        return not(result['complete'] and result['laps']==2 and not result['censored'])

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--tag',default='projected-context-residual-sacl');parser.add_argument('--steps',type=int,default=10000)
    parser.add_argument('--workers',type=int,default=4);parser.add_argument('--eval-every',type=int,default=5000);args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or not 1<=args.workers<=4 or not 1000<=args.steps<=500000:raise ValueError('Invalid settings')
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    if not torch.cuda.is_available():raise RuntimeError('CUDA must actually be available')
    torch.set_num_threads(1);NS.BRIDGE=NS.ROOT/'work/neural-context-projected-sac-env.cjs'
    mean=np.zeros(9,dtype=np.float32);deviation=np.ones(9,dtype=np.float32)
    projection=NS.ROOT/'.impeccable/review/neural-sacl/frontier-linear-basis/prepared.json'
    NS.atomic_json(out/'normalization.json',{'mean':mean.tolist(),'deviation':deviation.tolist(),'projectionSha256':NS.file_hash(projection),
        'boundary':'Bounded neuronal PCA and learned-head outputs need no arbitrary body-state normalization.'})
    env=None;pipe=None
    try:
        env=ResidualVec(args.workers,mean,deviation);pipe=NS.NodePipe()
        model=NS.GentleWarmSAC('MlpPolicy',env,learning_rate=1e-4,buffer_size=50000,learning_starts=1000,batch_size=256,gamma=.999,
            train_freq=(1,'step'),gradient_steps=1,ent_coef=.001,policy_kwargs={'net_arch':[32,32]},seed=151118,device='cuda',verbose=0)
        with torch.no_grad():
            model.actor.mu.weight.zero_();model.actor.mu.bias.zero_();model.actor.log_std.weight.zero_()
            model.actor.log_std.bias.fill_(-5)
        baseline=validate(model,pipe,mean,deviation);practice=validate(model,pipe,mean,deviation,'practice')
        keys=['bestProgress','fitness','laps','reason','totalSimulationSeconds']
        if baseline['bestProgress']!=2006.2274624276079 or any(baseline[k]!=practice[k] for k in keys):raise RuntimeError('Zero residual or cached practice changes verified model')
        identity={'format':'male-cns-private-context-residual-sac','schema':1,'environment':pipe.metadata,
            'gpu':{'name':torch.cuda.get_device_name(0),'torch':torch.__version__,'cuda':torch.version.cuda,
                   'actorDevice':str(next(model.actor.parameters()).device),'criticDevice':str(next(model.critic.parameters()).device)},
            'configuration':vars(args),'sourceHashes':{'training':NS.file_hash(__file__),'bridge':NS.file_hash(NS.BRIDGE)}}
        NS.atomic_json(out/'identity.json',identity);model.save(out/'initial-own-residual.zip');model.save(out/'best-own-residual.zip')
        print('CONTEXT_RESIDUAL_SAC_READY '+json.dumps({'baseline':baseline,'gpu':identity['gpu']}),flush=True)
        callback=Checkpoint(out,pipe,mean,deviation,baseline,args.eval_every);model.learn(total_timesteps=args.steps,callback=callback)
        final=validate(model,pipe,mean,deviation);model.save(out/'final-own-residual.zip');model.save_replay_buffer(out/'own-replay-buffer.pkl')
        best=NS.GentleWarmSAC.load(out/'best-own-residual.zip',device='cuda');repeat=validate(best,pipe,mean,deviation)
        if any(repeat[k]!=callback.best[k] for k in keys):raise RuntimeError('Best actor does not reproduce full validation')
        report={'identity':identity,'initialFull':baseline,'best':callback.best,'independentBestRepeat':repeat,'final':final,
                'actualSteps':model.num_timesteps,'gradientUpdates':model._n_updates,'evaluations':callback.evaluations,
                'boundary':'Old learned model fixed, continuous residual learned from actual rewards on CUDA. Retained neuronal-context gate, not decaying old motor memory. Protected prior member is genuine old controller. Practice is not full generations. Original app/save/release untouched; no convergence claim without real laps.'}
        NS.atomic_json(out/'report.json',report);print('CONTEXT_RESIDUAL_SAC_DONE '+json.dumps({k:report[k] for k in ['actualSteps','gradientUpdates','best','final']}),flush=True)
    finally:
        if env:env.close()
        if pipe:pipe.close()

if __name__=='__main__':main()
