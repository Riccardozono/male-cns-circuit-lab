"""Transport/policy guard tests; fixture actions are not training data."""
import unittest
from types import SimpleNamespace
import numpy as np
from work.neural_sac import GentleWarmSAC

class PriorRetention(unittest.TestCase):
    def fixture(self, count):
        model = object.__new__(GentleWarmSAC)
        model.num_timesteps = 0
        model._last_obs = np.zeros((count, 516), dtype=np.float32)
        model.policy = SimpleNamespace(scale_action=lambda value: value.copy())
        values = np.full((count, 2), .2, dtype=np.float32)
        model.predict = lambda observation, deterministic=False: (values.copy(), None)
        return model

    def test_one_real_prior_member_does_not_replace_learning_members(self):
        model = self.fixture(4)
        actual, replay = model._sample_action(1000, n_envs=4)
        np.testing.assert_array_equal(actual[:3], np.full((3, 2), .2, dtype=np.float32))
        np.testing.assert_array_equal(actual[-1], [0, 0])
        np.testing.assert_array_equal(actual, replay)

    def test_single_model_inference_is_not_forced_to_the_prior(self):
        model = self.fixture(1)
        actual, replay = model._sample_action(1000, n_envs=1)
        np.testing.assert_array_equal(actual, np.full((1, 2), .2, dtype=np.float32))
        np.testing.assert_array_equal(actual, replay)

if __name__ == '__main__':
    unittest.main()
