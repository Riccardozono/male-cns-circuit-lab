"""No-leakage tests: physical critic signals cannot affect the driving actor."""
import json
import unittest
import numpy as np
import torch
import gymnasium as gym
from stable_baselines3 import TD3
from neural_asymmetric_policy import AsymmetricTD3Policy,import_actor,numeric_actor
from neuronal_experiment_io import ROOT


class AsymmetricTests(unittest.TestCase):
    def test_actor_and_its_gradients_cannot_read_extra_columns_while_critic_can(self):
        torch.manual_seed(151019)
        policy=AsymmetricTD3Policy(gym.spaces.Box(-10,10,(557,),dtype=np.float32),gym.spaces.Box(-1,1,(2,),dtype=np.float32),lambda _:1e-4,net_arch={'pi':[64,64],'qf':[128,128]})
        neural=torch.linspace(-1,1,521).reshape(1,-1)
        a=torch.cat([neural,torch.zeros((1,36))],dim=1).requires_grad_()
        b=torch.cat([neural,torch.ones((1,36))],dim=1)
        self.assertTrue(torch.equal(policy.actor(a),policy.actor(b)))
        policy.actor(a).sum().backward();self.assertTrue(torch.equal(a.grad[:,521:],torch.zeros((1,36))))
        self.assertFalse(torch.equal(policy.critic(a.detach(),torch.zeros((1,2)))[0],policy.critic(b,torch.zeros((1,2)))[0]))
        self.assertEqual(next(m for m in policy.actor.mu if isinstance(m,torch.nn.Linear)).in_features,521)

    def test_numeric_import_and_export_keep_the_exact_existing_neuronal_actor(self):
        class TinyEnv(gym.Env):
            observation_space=gym.spaces.Box(-10,10,(557,),dtype=np.float32)
            action_space=gym.spaces.Box(-1,1,(2,),dtype=np.float32)
            def reset(self,seed=None,options=None):return np.zeros(557,dtype=np.float32),{}
            def step(self,action):raise AssertionError('No fixture episode may enter real learning')
        model=TD3(AsymmetricTD3Policy,TinyEnv(),policy_kwargs={'net_arch':{'pi':[64,64],'qf':[128,128]}},device='cpu',buffer_size=32)
        file=ROOT/'.impeccable/review/neural-sacl/neuronal-command-3803-cma-bias/best-actor.json'
        numeric=json.loads(file.read_text(encoding='utf-8'));import_actor(model,numeric)
        self.assertEqual(numeric_actor(model),numeric)


if __name__=='__main__':unittest.main()
