"""Actual CPU physics with critic-only extra state and a strictly neuronal actor."""
import numpy as np
import gymnasium as gym
from stable_baselines3.common.vec_env import VecEnv
from neuronal_experiment_io import ROOT,Pipe


def encode(raw,normalization):
    raw=np.asarray(raw,dtype=np.float64)
    if raw.shape[-1]!=557 or not np.isfinite(raw).all():raise ValueError('Finite557column actual observation required')
    # Reproduce each rounding boundary of Node24 R.normalize, including its
    # original double-precision mean/deviation coefficients.
    neural=(raw[...,:521].astype(np.float32).astype(np.float64)-np.asarray(normalization['mean'],dtype=np.float64)).astype(np.float32)
    neural=(neural.astype(np.float64)/np.asarray(normalization['deviation'],dtype=np.float64)).astype(np.float32)
    extra=(raw[...,521:].astype(np.float32)*np.float32(5)).astype(np.float32)
    return np.concatenate([np.clip(neural,-10,10),extra],axis=-1)


class ActualAsymmetricVec(VecEnv):
    def __init__(self,prepared_file,normalization):
        # One physical training process to leave headroom for the user's apps.
        self.normalization=normalization;self.pipes=[];self.pending=None;self.episodes=0;self.best_practice=0.;self.reward_total=0.;self.length=0
        try:self.pipes.append(Pipe(ROOT/'work/neural-asymmetric-env.cjs',{'configuration':{'preparedFile':str(prepared_file)}}))
        except Exception:self.close();raise
        self.metadata_record=self.pipes[0].metadata;self.render_mode=None
        super().__init__(1,gym.spaces.Box(-10,10,(557,),dtype=np.float32),gym.spaces.Box(-1,1,(2,),dtype=np.float32))

    def reset(self):
        state=self.pipes[0].request('reset',mode='practice');self.reward_total=0.;self.length=0
        self.reset_infos=[state['info']];self._reset_seeds();self._reset_options()
        return encode([state['observation']],self.normalization)

    def step_async(self,actions):
        self.pending=self.pipes[0].send('step',action=actions[0].tolist())

    def step_wait(self):
        state=self.pipes[0].receive(self.pending);self.pending=None
        if state['truncated']:raise RuntimeError('No artificial simulation-time termination allowed')
        reward=state['reward'];done=state['terminated'];info=state['info'];self.reward_total+=reward;self.length+=1
        self.best_practice=max(self.best_practice,info['bestProgress']);info['TimeLimit.truncated']=False
        observation=state['observation']
        if done:
            info['terminal_observation']=encode(observation,self.normalization);info['episode']={'r':self.reward_total,'l':self.length}
            self.episodes+=1;self.reward_total=0.;self.length=0;observation=self.pipes[0].request('reset',mode='practice')['observation']
        return encode([observation],self.normalization),np.asarray([reward],dtype=np.float32),np.asarray([done],dtype=bool),[info]

    def close(self):
        for pipe in self.pipes:pipe.close()
    def get_attr(self,name,indices=None):return [getattr(self,name,None) for _ in self._get_indices(indices)]
    def set_attr(self,name,value,indices=None):setattr(self,name,value)
    def env_method(self,method_name,*args,indices=None,**kwargs):return [None for _ in self._get_indices(indices)]
    def env_is_wrapped(self,wrapper_class,indices=None):return [False for _ in self._get_indices(indices)]
