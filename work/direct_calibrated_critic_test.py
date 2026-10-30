"""Check isolated critic initialization against independently recorded data."""
import json
import unittest
import torch
from direct_neuronal_ppo_scaled import Learner as Control
from direct_neuronal_ppo_calibrated import Learner
from neuronal_experiment_io_retry import ROOT

class CalibrationTest(unittest.TestCase):
    def test_only_critic_bias_changes(self):
        d = ROOT/'.impeccable/review/neural-sacl'
        p = json.loads((d/'direct-neuronal-scaled-preflight/verification.json').read_text())
        fit = json.loads((d/'direct-critic-initial-return-calibration/fit.json').read_text())
        w = p['metadata']['initialWeights']
        old = Control(w,77)
        rng = torch.get_rng_state().clone()
        new = Learner(w,77)
        self.assertTrue(torch.equal(rng,torch.get_rng_state()))
        self.assertEqual(old.weights(),new.weights())
        self.assertEqual(old.std(),new.std())
        for key,value in old.critic.state_dict().items():
            actual = new.critic.state_dict()[key]
            expected = value+fit['offset'] if key == '4.bias' else value
            self.assertTrue(torch.equal(actual,expected),key)

if __name__ == '__main__':
    unittest.main()
