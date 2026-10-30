"""Pure optimizer fixtures, never vehicle/teacher/training examples."""
import unittest
import numpy as np
import torch
from neural_trust_sac import mean_gaussian_kl,constrain_update


class TinyActor(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.mean = torch.nn.Linear(2,2)
        self.log_std = torch.nn.Parameter(torch.tensor([-3.,-.7]))
        with torch.no_grad():
            self.mean.weight.zero_()
            self.mean.bias.zero_()
    def get_action_dist_params(self,obs):
        return self.mean(obs),self.log_std.expand(len(obs),-1),{}


class TrustTests(unittest.TestCase):
    def setup_update(self):
        actor=TinyActor()
        obs=torch.tensor([[.1,.2],[-.3,.5]])
        with torch.no_grad():
            old=[p.detach().clone() for p in actor.parameters()]
            mu,std,_=actor.get_action_dist_params(obs)
        return actor,obs,old,mu.clone(),std.clone()

    def test_identity_and_small_updates_remain_exact(self):
        actor,obs,old,mu,std=self.setup_update()
        self.assertEqual(mean_gaussian_kl(mu,std,mu,std).item(),0)
        result=constrain_update(actor,obs,old,mu,std)
        self.assertEqual(result['fraction'],1)
        self.assertFalse(result['rejected'])

    def test_large_update_backtracks_to_the_measured_budget_without_rng_draws(self):
        actor,obs,old,mu,std=self.setup_update()
        with torch.no_grad():
            actor.mean.bias.fill_(1)
        before_numpy=np.random.get_state()
        before_torch=torch.get_rng_state()
        result=constrain_update(actor,obs,old,mu,std)
        self.assertGreater(result['proposalMeanKl'],.001)
        self.assertLess(result['fraction'],1)
        self.assertLessEqual(result['acceptedMeanKl'],.001)
        self.assertTrue(torch.equal(before_torch,torch.get_rng_state()))
        np.testing.assert_array_equal(before_numpy[1],np.random.get_state()[1])
        self.assertGreater(actor.mean.bias[0].item(),0)

    def test_nonfinite_proposal_is_rejected_and_original_restored_exactly(self):
        actor,obs,old,mu,std=self.setup_update()
        with torch.no_grad():
            actor.mean.bias.fill_(float('nan'))
        result=constrain_update(actor,obs,old,mu,std)
        self.assertTrue(result['rejected'])
        self.assertEqual(result['fraction'],0)
        for actual,expected in zip(actor.parameters(),old):
            self.assertTrue(torch.equal(actual,expected))
        with self.assertRaises(ValueError):
            constrain_update(actor,obs,old,mu,std,budget=0)


if __name__=='__main__':
    unittest.main()
