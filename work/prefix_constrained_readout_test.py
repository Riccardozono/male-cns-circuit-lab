import importlib.util
import unittest
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location("prefix_fit", Path(__file__).with_name("fit-prefix-constrained-readout.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrefixReadoutTests(unittest.TestCase):
    def test_direction_has_unit_target_and_zero_retained_mean(self):
        prefix = np.array([[1., 0., 1.], [1., .1, 1.], [.9, .2, 1.]])
        target = np.array([0., 1., 1.])
        vector = module.direction(prefix, target, 1e-4)
        self.assertAlmostEqual(float(target @ vector), 1., places=9)
        self.assertAlmostEqual(float(prefix.mean(axis=0) @ vector), 0., places=9)

    def test_indistinguishable_target_is_rejected(self):
        prefix = np.array([[1., 0., 1.], [1., .1, 1.]])
        with self.assertRaisesRegex(ValueError, "indistinguishable"):
            module.direction(prefix, prefix.mean(axis=0), 1e-4)


if __name__ == "__main__":
    unittest.main()
