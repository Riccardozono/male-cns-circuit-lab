"""Consolidate learned steering; train acceleration/braking from real rewards.

Both branches read neuronal observations. The frozen steering branch was
learned from this task's own experience, not a route or an expert driver.
"""
import argparse
import json
import time
import pickle
import numpy as np
import gymnasium as gym
import torch
import neural_sac as NS
from neural_sac import ROOT, BRIDGE, GentleWarmSAC, NeuralVec, NodePipe, atomic_json, file_hash
from stable_baselines3.common.callbacks import BaseCallback

SOURCE = ROOT / '.impeccable/review/neural-sacl/self-experience-first'
# A private, explicit new objective. Only the process-local transport factory
# is selected here; no original source, released bundle or save is replaced.
BRIDGE = ROOT / 'work/neural-rl-bridge5.cjs'
NS.BRIDGE = BRIDGE
OBJECTIVE = 'progress-5-crash-safety-experiment'

def encode(raw, frozen, mean, deviation):
    raw=np.asarray(raw,dtype=np.float32)
    previous,_=frozen.predict(raw,deterministic=True)
    return np.concatenate((np.clip((raw-mean)/deviation,-10,10),previous),axis=-1).astype(np.float32)

def combined(frozen, delta):
    result = np.asarray(frozen, dtype=np.float32).copy()
    result[...,1] = np.clip(result[...,1] + np.float32(2)*np.asarray(delta,dtype=np.float32)[...,0], -1, 1)
    return result

class LongitudinalVec(NeuralVec):
    def __init__(self, count, frozen, mean, deviation):
        self.frozen = frozen
        self.mean=mean;self.deviation=deviation
        self.current_observations = None
        super().__init__(count)
        self.action_space = gym.spaces.Box(-1,1,shape=(1,),dtype=np.float32)
        self.observation_space = gym.spaces.Box(-10,10,shape=(518,),dtype=np.float32)

    def reset(self):
        result = super().reset()
        self.current_observations = result.copy()
        return encode(result,self.frozen,self.mean,self.deviation)

    def step_async(self, actions):
        base,_ = self.frozen.predict(self.current_observations,deterministic=True)
        super().step_async(combined(base,actions))

    def step_wait(self):
        result = super().step_wait()
        self.current_observations = result[0].copy()
        observations,rewards,dones,infos=result
        for info in infos:
            if 'terminal_observation' in info:
                info['terminal_observation']=encode(info['terminal_observation'],self.frozen,self.mean,self.deviation)
        return encode(observations,self.frozen,self.mean,self.deviation),rewards,dones,infos

def validate_combined(model, frozen, pipe, mean, deviation):
    state=pipe.request('reset',mode='full')
    count=0
    while True:
        obs=np.asarray(state['observation'],dtype=np.float32)
        base,_=frozen.predict(obs,deterministic=True)
        delta,_=model.predict(encode(obs,frozen,mean,deviation),deterministic=True)
        state=pipe.request('step',action=combined(base,delta).tolist())
        count+=1
        if state['terminated'] or state['truncated']:
            return {**state['info'],'censored':state['truncated'],'validationMode':'full','actualActorControls':count}

class Checkpoint(BaseCallback):
    def __init__(self,output,pipe,frozen,baseline,identity,interval,mean,deviation):
        super().__init__()
        self.output=output;self.pipe=pipe;self.frozen=frozen;self.best=baseline;self.identity=identity
        self.interval=interval;self.last=0;self.started=time.monotonic();self.evaluations=[]
        self.mean=mean;self.deviation=deviation

    def _on_step(self):
        if self.num_timesteps-self.last<self.interval:
            return True
        self.last=self.num_timesteps
        full=validate_combined(self.model,self.frozen,self.pipe,self.mean,self.deviation)
        row={'steps':self.num_timesteps,'gradientUpdates':self.model._n_updates,
             'wallSeconds':time.monotonic()-self.started,'independentFullValidation':full,
             'bestPracticeProgress':self.training_env.best_practice,
             'preservedPriorProgress':self.training_env.best_preserved_prior}
        self.evaluations.append(row)
        if not full['censored'] and (full['laps']>self.best['laps'] or full['laps']==self.best['laps'] and full['bestProgress']>self.best['bestProgress']):
            self.best=full
            self.model.save(self.output/'best-own-longitudinal-model.zip')
        self.model.save(self.output/'latest-own-longitudinal-model.zip')
        atomic_json(self.output/'progress.json',{'identity':self.identity,'best':self.best,'evaluations':self.evaluations})
        print('LONGITUDINAL_SAC_PROGRESS '+json.dumps(row),flush=True)
        return not(full['complete'] and full['laps']==2 and not full['censored'])

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--tag',default='penalty5-normalized')
    parser.add_argument('--steps',type=int,default=50000)
    parser.add_argument('--workers',type=int,default=4)
    parser.add_argument('--eval-every',type=int,default=5000)
    args=parser.parse_args()
    if not args.tag.replace('-','').isalnum() or args.workers not in (1,2,3,4) or args.steps<100:
        raise ValueError('Invalid experimental settings')
    output=ROOT/'.impeccable/review/neural-sacl'/args.tag
    output.mkdir(parents=True,exist_ok=False)
    if not torch.cuda.is_available():
        raise RuntimeError('Actual CUDA device required')
    torch.set_num_threads(1);torch.manual_seed(1419917);np.random.seed(1419917)
    source=json.loads((SOURCE/'report.json').read_text(encoding='utf-8'))
    frozen=GentleWarmSAC.load(SOURCE/'best-own-model.zip',device='cuda')
    replay_file=ROOT/'.impeccable/review/neural-sacl/sac-protected-prior-cuda/own-replay-buffer.pkl'
    # Only this task's own generated replay file is accepted here.
    with replay_file.open('rb') as handle:
        replay=pickle.load(handle)
    samples=replay.observations.reshape(-1,516)
    mean=samples.mean(axis=0,dtype=np.float64).astype(np.float32)
    deviation=np.maximum(samples.std(axis=0,dtype=np.float64),.001).astype(np.float32)
    if not np.isfinite(mean).all() or not np.isfinite(deviation).all():
        raise RuntimeError('Invalid actual neuronal normalization statistics')
    del samples,replay
    env=None;pipe=None
    try:
        env=LongitudinalVec(args.workers,frozen,mean,deviation);pipe=NodePipe()
        expected_environment={**source['environment'],'objectiveRevision':OBJECTIVE}
        if env.metadata_record!=expected_environment or pipe.metadata!=expected_environment:
            raise RuntimeError('Anatomy/objective/source identity mismatch')
        model=GentleWarmSAC('MlpPolicy',env,learning_rate=1e-4,buffer_size=50000,learning_starts=1000,
                           batch_size=256,gamma=.999,train_freq=(1,'step'),gradient_steps=1,ent_coef=.005,
                           policy_kwargs={'net_arch':[256,256]},seed=1419917,device='cuda',verbose=0)
        with torch.no_grad():
            model.actor.mu.weight.zero_();model.actor.mu.bias.zero_()
            model.actor.log_std.weight.zero_();model.actor.log_std.bias.fill_(-3)
        baseline=validate_combined(model,frozen,pipe,mean,deviation)
        # Old scores are not imported or used for optimization. The new
        # objective is verified only against unchanged physical behavior.
        keys=['bestProgress','laps','reason','totalSimulationSeconds']
        if any(baseline[k]!=source['independentRepeat'][k] for k in keys):
            raise RuntimeError('Zero longitudinal correction changed the learned steering policy')
        identity={'format':'male-cns-normalized-crash-safety-residual-sac-v1','environment':pipe.metadata,
                  'sourceActorSha256':file_hash(SOURCE/'best-own-model.zip'),
                  'sourceCodeSha256':file_hash(__file__),'bridgeSha256':file_hash(BRIDGE),
                  'objectiveSourceSha256':file_hash(ROOT/'.impeccable/experimental-penalty5/outputs/rewards.js'),
                  'normalizationSourceSha256':file_hash(replay_file),'actorObservationLength':518,
                  'neuralMean':mean.tolist(),'neuralDeviation':deviation.tolist(),
                  'gpu':torch.cuda.get_device_name(0),'configuration':vars(args),
                  'boundary':'Explicit reward revision 5, fresh critic/optimizer/replay, no old score transfer. Fixed normalization from own actual neuronal observations; extra two inputs are frozen learned neural outputs, not route/pose/time/target controls. Unchanged anatomy and physics. Private incompatible experiment, no original save/release modification.'}
        atomic_json(output/'identity.json',identity)
        model.save(output/'best-own-longitudinal-model.zip')
        print('LONGITUDINAL_SAC_READY '+json.dumps({'baseline':baseline,'gpu':identity['gpu']}),flush=True)
        callback=Checkpoint(output,pipe,frozen,baseline,identity,args.eval_every,mean,deviation)
        model.learn(total_timesteps=args.steps,callback=callback)
        final=validate_combined(model,frozen,pipe,mean,deviation)
        model.save(output/'final-own-longitudinal-model.zip')
        model.save_replay_buffer(output/'own-replay-buffer.pkl')
        atomic_json(output/'report.json',{'identity':identity,'baseline':baseline,'bestValidated':callback.best,
                                        'finalIndependentFullValidation':final,'actualTrainingSteps':model.num_timesteps,
                                        'gradientUpdates':model._n_updates,'evaluations':callback.evaluations})
        print('LONGITUDINAL_SAC_DONE '+json.dumps({'best':callback.best,'final':final,
                                                'steps':model.num_timesteps,'gradientUpdates':model._n_updates}),flush=True)
    finally:
        if env is not None:env.close()
        if pipe is not None:pipe.close()

if __name__=='__main__':
    main()
