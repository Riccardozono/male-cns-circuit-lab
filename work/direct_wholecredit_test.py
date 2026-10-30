"""Verify terminal credit is retained without crossing episode/lane boundaries."""
import unittest
import torch
from direct_neuronal_ppo_wholecredit import advantages

class WholeCreditTest(unittest.TestCase):
    def test_full_credit_and_boundaries(self):
        rewards = torch.zeros((2,256),dtype=torch.float64)
        dones, values, next_values = [torch.zeros_like(rewards) for _ in range(3)]
        rewards[0,199], dones[0,199] = -37, 1
        rewards[0,255], dones[0,255] = -70, 1
        next_values[1,-1] = 9
        actual = advantages(rewards,dones,values,next_values)
        self.assertTrue(torch.all(actual[0,:200] == -37))
        self.assertTrue(torch.all(actual[0,200:] == -70))
        self.assertTrue(torch.all(actual[1] == 9))

if __name__ == '__main__':
    unittest.main()
