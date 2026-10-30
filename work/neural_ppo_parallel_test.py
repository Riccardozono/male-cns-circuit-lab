"""Mathematical fixtures only, not simulated driving or real learning data."""
import unittest
import torch
from neural_ppo_parallel import COUNT, STEPS, separate_advantages
from train_neural_ppo_normalized_cuda import advantages

class ReturnsTest(unittest.TestCase):
    def test_every_environment_matches_independent_gae(self):
        torch.manual_seed(7)
        arrays = [torch.randn(COUNT*STEPS, dtype=torch.float64) for _ in range(4)]
        arrays[1] = torch.zeros(COUNT*STEPS, dtype=torch.float64)
        arrays[1][13] = 1
        actual = separate_advantages(*arrays).reshape(COUNT, STEPS)
        for k in range(COUNT):
            start = k*STEPS
            self.assertTrue(torch.equal(actual[k], advantages(*(a[start:start+STEPS] for a in arrays))))
    def test_no_return_leaks_across_adjacent_environment_segments(self):
        zeros = torch.zeros(COUNT*STEPS, dtype=torch.float64)
        rewards = zeros.clone()
        rewards[STEPS] = 100
        actual = separate_advantages(rewards, zeros, zeros, zeros).reshape(COUNT, STEPS)
        self.assertEqual(actual[0].abs().max().item(), 0)
        self.assertEqual(actual[1, 0].item(), 100)
        with self.assertRaises(ValueError):
            separate_advantages(zeros[:-1], zeros, zeros, zeros)

if __name__ == '__main__':
    unittest.main()
