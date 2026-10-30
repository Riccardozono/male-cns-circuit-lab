import unittest
import torch
from neural_exploration_ar1 import conditional, scale


class NeuralAR1MathTests(unittest.TestCase):
    def test_conditional_history_and_first_step(self):
        m = torch.tensor([[.5, -.3], [.4, -.1]], dtype=torch.float64)
        s = torch.tensor([[.1, .2], [.2, .4]], dtype=torch.float64)
        a = torch.tensor([[.6, -.1], [.8, .1]], dtype=torch.float64)
        means, std = conditional(m, s, a, None, .9)
        self.assertTrue(torch.equal(means[0], m[0]))
        self.assertAlmostEqual(float(means[1, 0]), .58)
        self.assertAlmostEqual(float(means[1, 1]), .26)
        self.assertTrue(torch.equal(std[0], s[0]))

    def test_neural_variance_is_bounded_and_differentiable(self):
        f = torch.tensor([[0., 0.], [.5, .2], [2., 0.]], dtype=torch.float64, requires_grad=True)
        c = {'direction': [1., 0., 0.], 'threshold': .1, 'floor': [.001, .002], 'ceiling': [.04, .2]}
        s = scale(f, c)
        self.assertTrue(torch.equal(s[0], torch.tensor(c['floor'], dtype=torch.float64)))
        self.assertTrue(torch.equal(s[-1], torch.tensor(c['ceiling'], dtype=torch.float64)))
        s.sum().backward()
        self.assertGreater(abs(float(f.grad[1, 0])), 0)


if __name__ == '__main__':
    unittest.main()
