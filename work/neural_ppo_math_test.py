"""Mathematical unit fixtures only, not synthetic driving/training examples."""
import unittest
import torch
from train_neural_ppo import advantages, log_prob
from train_neural_ppo_long import advantages as long_advantages

class PPOUnits(unittest.TestCase):
    def test_terminal_cuts_bootstrap_and_next_episode_advantage(self):
        t = lambda x: torch.tensor(x, dtype=torch.float64)
        got = advantages(t([1, 2]), t([1, 1]), t([0, 0]), t([100, 100]))
        torch.testing.assert_close(got, t([1, 2]), rtol=0, atol=0)

    def test_actual_bootstrap_is_used_at_rollout_end(self):
        t = lambda x: torch.tensor(x, dtype=torch.float64)
        got = advantages(t([1]), t([0]), t([2]), t([4]))
        torch.testing.assert_close(got, t([1+.995*4-2]), rtol=0, atol=0)

    def test_long_horizon_changes_only_delayed_credit_formula(self):
        rewards = torch.zeros(101, dtype=torch.float64)
        rewards[-1] = 1
        dones = torch.zeros_like(rewards)
        dones[-1] = 1
        zero = torch.zeros_like(rewards)
        short = advantages(rewards, dones, zero, zero)[0].item()
        long = long_advantages(rewards, dones, zero, zero)[0].item()
        self.assertAlmostEqual(short, (.995*.95)**100)
        self.assertAlmostEqual(long, (.999*.995)**100)
        self.assertGreater(long, short)

    def test_unchanged_gaussian_has_unit_importance_ratio(self):
        a = torch.tensor([[.2, -.1]], dtype=torch.float64)
        mean = torch.zeros_like(a)
        logstd = torch.tensor([-.5, -.8], dtype=torch.float64)
        old = log_prob(a, mean, logstd)
        torch.testing.assert_close((log_prob(a, mean, logstd)-old).exp(), torch.ones(1, dtype=torch.float64), rtol=0, atol=0)

if __name__ == '__main__':
    unittest.main()
