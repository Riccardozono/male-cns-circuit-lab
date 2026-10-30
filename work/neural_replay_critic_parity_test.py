"""Numerical unit models only; actual recorded data, no fabricated optimizer examples.

These two updates are NOT counted as a physical episode or the CUDA experiment.
"""
import os
os.environ['OMP_NUM_THREADS']='1';os.environ['OPENBLAS_NUM_THREADS']='1'
import io
import json
import zipfile
import unittest
import numpy as np
import torch
import gymnasium as gym
from stable_baselines3.common.logger import configure
from neuronal_experiment_io import ROOT
from neural_asymmetric_policy import AsymmetricTD3Policy
from neural_warm_td3 import WarmAsymmetricTD3
from neural_replay_td3 import ReplayRegularizedTD3
from neural_transition_dataset import load_episode


class ParityTests(unittest.TestCase):
    def test_critic_and_random_stream_are_exact_until_first_actor_objective_change(self):
        torch.set_num_threads(1)
        class NoStep(gym.Env):
            observation_space=gym.spaces.Box(-10,10,(557,),dtype=np.float32);action_space=gym.spaces.Box(-1,1,(2,),dtype=np.float32)
            def reset(self,seed=None,options=None):return np.zeros(557,dtype=np.float32),{}
            def step(self,action):raise AssertionError('No fixture driving or fabricated transitions')
        base=ROOT/'.impeccable/review/neural-sacl';dataset=json.loads((base/'neuronal-command-3809-asymmetric-data/report.json').read_text(encoding='utf-8'));actual=load_episode(dataset['records'][0])
        with zipfile.ZipFile(base/'neuronal-command-3809-asymmetric-td3/initial-own-model.zip') as archive:
            states={name:torch.load(io.BytesIO(archive.read(name+'.pth')),map_location='cpu',weights_only=True) for name in ['policy','actor.optimizer','critic.optimizer']}
        models=[]
        for cls in [WarmAsymmetricTD3,ReplayRegularizedTD3]:
            model=cls(AsymmetricTD3Policy,NoStep(),learning_rate=1e-4,buffer_size=1024,policy_delay=2,target_policy_noise=.01,target_noise_clip=.03,gamma=.999,policy_kwargs={'net_arch':{'pi':[64,64],'qf':[128,128]}},seed=1510557,device='cpu')
            model.policy.load_state_dict(states['policy']);model.actor.optimizer.load_state_dict(states['actor.optimizer']);model.critic.optimizer.load_state_dict(states['critic.optimizer']);model.set_logger(configure(folder=None,format_strings=[]))
            for row in actual:model.replay_buffer.add(row[:557][None,:],row[561:][None,:],row[557:559][None,:],row[559:560],row[560:561],[{'TimeLimit.truncated':False}])
            models.append(model)
        # Optimizer load_state_dict may share tensors with its input. Separate
        # deep state for the two independent numerical models is mandatory.
        import copy
        for model in models:
            model.actor.optimizer.load_state_dict(copy.deepcopy(states['actor.optimizer']));model.critic.optimizer.load_state_dict(copy.deepcopy(states['critic.optimizer']))
        rng=np.random.get_state();torch_rng=torch.get_rng_state()
        for model in models:
            np.random.set_state(rng);torch.set_rng_state(torch_rng);model.train(gradient_steps=2,batch_size=32)
        self.assertEqual(models[0]._n_updates,2);self.assertEqual(models[1]._n_updates,2)
        for key,value in models[0].critic.state_dict().items():self.assertTrue(torch.equal(value,models[1].critic.state_dict()[key]),key)
        for key,value in models[0].critic_target.state_dict().items():self.assertTrue(torch.equal(value,models[1].critic_target.state_dict()[key]),key)
        self.assertNotEqual(models[0].logger.name_to_value['train/actor_loss'],models[1].logger.name_to_value['train/actor_loss'])
        self.assertEqual(len(models[1].regularization_history),1)


if __name__=='__main__':unittest.main()
