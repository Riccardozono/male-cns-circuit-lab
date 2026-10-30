import unittest
import numpy as np
from recurrent_v3_policy_gradient import returns, candidates, natural_direction


class RecurrentRewardTests(unittest.TestCase):
    def test_regularized_natural_direction_ascends_and_has_unit_empirical_metric(self):
        meta = {'scales': [.1, .2]}
        fisher = np.array([[4., 1.], [1., 3.]])
        gradient = np.array([2., -1.])
        delta, metrics = natural_direction(meta, gradient, fisher)
        self.assertAlmostEqual(float(delta@fisher@delta), 1.)
        self.assertGreater(float(delta@gradient), 0.)
        self.assertGreater(metrics['empiricalMetricNormBeforeScaling'], 0.)

    def test_returns_do_not_cross_separately_supplied_episodes(self):
        self.assertEqual(returns([1, 2, -3]), [0., -1., -3.])
        self.assertEqual(returns([100, -100]), [0., -100.])

    def test_comparison_freezes_the_control_encoder_and_bounds_all_weights(self):
        meta = {'genome': {'policyWeights': [0.]*202}, 'scales': [.1]*202, 'graph': {'readoutOffset': 72}}
        rows = candidates(meta, np.arange(1, 203, dtype=float))
        self.assertEqual(len(rows), 10)
        for row in rows:
            self.assertLessEqual(max(abs(v) for v in row['weights']), 8)
            if row['block'] == 'readout-only':
                self.assertEqual(row['weights'][:72], [0.]*72)
            else:
                self.assertGreater(np.linalg.norm(row['weights'][:72]), 0)


if __name__ == '__main__':
    unittest.main()
