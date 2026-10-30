import unittest
import torch
from direct_neuronal_ppo_low_noise import Learner as Control
from direct_neuronal_ppo_steering_explore import Learner as Trial

class Tests(unittest.TestCase):
    def test_only_initial_steering_std_changes(self):
        # Numerical parameter fixture only, never a driving demonstration.
        a = Control([0.0]*154, 77)
        initial_weights, critic, rng = a.weights(), a.critic_hash(), torch.get_rng_state().clone()
        b = Trial([0.0]*154, 77)
        self.assertEqual(initial_weights, b.weights())
        self.assertEqual(critic, b.critic_hash())
        self.assertTrue(torch.equal(rng, torch.get_rng_state()))
        self.assertAlmostEqual(a.std()[0], .02)
        self.assertAlmostEqual(b.std()[0], .08)
        self.assertEqual(a.std()[1], b.std()[1])

if __name__ == '__main__':
    unittest.main()
