"""Boundary fixtures for the installed n-step buffer; never driving data."""
import unittest
import numpy as np
import gymnasium as gym
from stable_baselines3.common.buffers import NStepReplayBuffer


class MultistepTests(unittest.TestCase):
    def make(self,n_envs=1):
        return NStepReplayBuffer(32,gym.spaces.Box(-10000,10000,(1,),dtype=np.float32),gym.spaces.Box(-1,1,(1,),dtype=np.float32),device='cpu',n_envs=n_envs,n_steps=3,gamma=.9)

    def add(self,buffer,obs,rewards,dones):
        count=buffer.n_envs
        buffer.add(np.asarray(obs,dtype=np.float32).reshape(count,1),np.asarray(obs,dtype=np.float32).reshape(count,1)+1,np.zeros((count,1),dtype=np.float32),np.asarray(rewards,dtype=np.float32),np.asarray(dones,dtype=bool),[{'TimeLimit.truncated':False} for _ in range(count)])

    def test_terminal_reward_never_borrows_from_the_next_episode(self):
        b=self.make()
        for row in [(0,1,False),(1,2,True),(100,1000,False),(101,2000,False)]:
            self.add(b,[row[0]],[row[1]],[row[2]])
        s=b._get_samples(np.asarray([0]))
        self.assertAlmostEqual(s.rewards.item(),1+.9*2,places=6)
        self.assertEqual(s.dones.item(),1)
        self.assertEqual(s.next_observations.item(),2)
        self.assertAlmostEqual(s.discounts.item(),.9**2,places=6)

    def test_partial_live_tail_bootstraps_without_creating_a_physical_termination(self):
        b=self.make()
        for t in range(4):
            self.add(b,[t],[t+1],[False])
        timeouts=b.timeouts.copy();dones=b.dones.copy()
        s=b._get_samples(np.asarray([3]))
        self.assertEqual(s.rewards.item(),4)
        self.assertEqual(s.dones.item(),0)
        self.assertAlmostEqual(s.discounts.item(),.9,places=6)
        np.testing.assert_array_equal(b.timeouts,timeouts)
        np.testing.assert_array_equal(b.dones,dones)

    def test_multiple_members_accumulate_only_their_own_real_sequence(self):
        b=self.make(2)
        for t in range(4):
            self.add(b,[t,100+t],[1,10],[False,False])
        s=b._get_samples(np.zeros(64,dtype=int))
        for obs,reward,discount in zip(s.observations.numpy(),s.rewards.numpy(),s.discounts.numpy()):
            factor=1 if obs[0]<100 else 10
            self.assertAlmostEqual(float(reward[0]),factor*(1+.9+.9**2),places=5)
            self.assertAlmostEqual(float(discount[0]),.9**3,places=6)


if __name__=='__main__':
    unittest.main()
