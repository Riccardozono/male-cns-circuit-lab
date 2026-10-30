"""Small boundary fixtures, never optimizer or physical driving examples."""
import json
import subprocess
import unittest
import numpy as np
import torch
import gymnasium as gym
from neural_asymmetric_vec import encode
from neural_asymmetric_policy import AsymmetricTD3Policy
from neural_warm_td3 import WarmAsymmetricTD3
from neuronal_experiment_io import ROOT,NODE


class RuntimeTests(unittest.TestCase):
    def test_encoding_exactly_repeats_node_rounding_and_keeps_critic_separate(self):
        normalization=json.loads((ROOT/'.impeccable/review/neural-sacl/projected-residual-3803-prepared/prepared.json').read_text(encoding='utf-8'))['normalization']
        raw=np.linspace(-.5,.5,557).tolist()
        script="const fs=require('node:fs'),R=require('./work/neural-projected-residual.cjs'),m=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(R.normalize(m.raw.slice(0,521),m.normalization).concat(m.raw.slice(521).map(v=>Math.fround(Math.fround(v)*5)))));"
        result=subprocess.run([str(NODE),'-e',script],cwd=ROOT,input=json.dumps({'raw':raw,'normalization':normalization}),capture_output=True,text=True,encoding='utf-8',check=True,creationflags=subprocess.CREATE_NO_WINDOW)
        np.testing.assert_array_equal(encode(raw,normalization),np.asarray(json.loads(result.stdout),dtype=np.float32))

    def test_warmup_uses_real_policy_and_separate_learning_rates(self):
        class TinyEnv(gym.Env):
            observation_space=gym.spaces.Box(-10,10,(557,),dtype=np.float32);action_space=gym.spaces.Box(-1,1,(2,),dtype=np.float32)
            def reset(self,seed=None,options=None):return np.zeros(557,dtype=np.float32),{}
            def step(self,action):raise AssertionError('Test state must not enter real optimizer')
        model=WarmAsymmetricTD3(AsymmetricTD3Policy,TinyEnv(),learning_rate=1e-4,buffer_size=32,learning_starts=1000,policy_kwargs={'net_arch':{'pi':[64,64],'qf':[128,128]}},device='cpu')
        model._last_obs=np.zeros((1,557),dtype=np.float32);model.num_timesteps=0
        expected,_=model.predict(model._last_obs,deterministic=True)
        actual,scaled=model._sample_action(1000)
        np.testing.assert_array_equal(actual,expected);np.testing.assert_array_equal(scaled,expected)
        from stable_baselines3.common.logger import configure
        model.set_logger(configure(folder=None,format_strings=[]))
        model._update_learning_rate([model.actor.optimizer,model.critic.optimizer])
        self.assertAlmostEqual(model.actor.optimizer.param_groups[0]['lr'],2e-5)
        self.assertAlmostEqual(model.critic.optimizer.param_groups[0]['lr'],1e-4)


if __name__=='__main__':unittest.main()
