import unittest
import torch
from direct_neuronal_ppo import advantages

class Tests(unittest.TestCase):
    def test_no_credit_crosses_lane_or_terminal(self):
        rewards = torch.tensor([[1., 100., 3.], [2., 4., 8.]], dtype=torch.float64)
        done = torch.tensor([[1., 0., 1.], [0., 0., 1.]], dtype=torch.float64)
        zeros = torch.zeros_like(rewards)
        got = advantages(rewards, done, zeros, zeros, gamma=1, lam=1)
        self.assertTrue(torch.equal(got, torch.tensor([[1., 103., 3.], [14., 12., 8.]], dtype=torch.float64)))
    def test_unfinished_segment_bootstraps_without_fabricated_terminal(self):
        reward = torch.tensor([[1., 2.]], dtype=torch.float64)
        done = torch.zeros_like(reward)
        value = torch.tensor([[3., 4.]], dtype=torch.float64)
        next_value = torch.tensor([[4., 7.]], dtype=torch.float64)
        self.assertTrue(torch.equal(advantages(reward, done, value, next_value, gamma=1, lam=1), torch.tensor([[7., 5.]], dtype=torch.float64)))

if __name__ == '__main__':
    unittest.main()
