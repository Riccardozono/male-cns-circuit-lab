"""Isolated objective fixtures; these are not data fed to a driving optimizer."""
import unittest
import torch
from neural_replay_td3 import replay_objective


class ReplayTests(unittest.TestCase):
    def test_formula_and_scale_do_not_backpropagate_into_recorded_actions(self):
        predicted=torch.tensor([[.2,.4],[-.2,.1]],requires_grad=True);q=torch.tensor([[-2.],[-4.]],requires_grad=True);recorded=torch.zeros((2,2),requires_grad=True)
        loss,scale,deviation=replay_objective(predicted,q,recorded)
        self.assertAlmostEqual(float(scale),2.5/3,places=6);self.assertAlmostEqual(float(deviation.detach()),.0625,places=6)
        self.assertAlmostEqual(float(loss.detach()),2.5625,places=6)
        loss.backward();self.assertIsNone(recorded.grad);self.assertTrue(torch.isfinite(predicted.grad).all());self.assertTrue(torch.isfinite(q.grad).all())

    def test_constant_q_regularization_gradient_points_toward_own_actual_action(self):
        predicted=torch.tensor([[.8,-.7]],requires_grad=True);recorded=torch.tensor([[.1,-.1]])
        loss,_,_=replay_objective(predicted,torch.tensor([[-30.]]),recorded);loss.backward()
        self.assertGreater(float(predicted.grad[0,0]),0);self.assertLess(float(predicted.grad[0,1]),0)
        with self.assertRaises(ValueError):replay_objective(predicted,torch.zeros((2,1)),recorded)


if __name__=='__main__':unittest.main()
