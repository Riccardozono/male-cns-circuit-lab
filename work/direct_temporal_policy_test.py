"""Conditional density, reset derivative and actual-row Node/Torch parity."""
import json
import math
import unittest
import torch
from neural_temporal_policy import RHO,conditional_mean
from direct_neuronal_ppo_motorpool import Learner as Control
from direct_neuronal_ppo_motorpool_temporal import Learner
from neuronal_experiment_io_retry import ROOT,file_hash

class TemporalTests(unittest.TestCase):
    def test_gradient_depends_on_previous_policy_mean(self):
        actor=torch.nn.Linear(1,2,bias=False,dtype=torch.float64)
        x=torch.ones((2,1),dtype=torch.float64)
        previous=torch.zeros((2,2),dtype=torch.float64)
        mask=torch.tensor([1.,0.],dtype=torch.float64)
        result=conditional_mean(actor,x,x,previous,mask)
        gradient=torch.autograd.grad(result[0].sum(),actor.weight,retain_graph=True)[0]
        self.assertTrue(torch.allclose(gradient,torch.full_like(gradient,1-RHO),atol=1e-15,rtol=0))
        gradient=torch.autograd.grad(result[1].sum(),actor.weight)[0]
        self.assertTrue(torch.equal(gradient,torch.ones_like(gradient)))

    def test_actual_rows_and_initial_state(self):
        directory=ROOT/'.impeccable/review/neural-sacl/direct-neuronal-temporal-preflight'
        proof=json.loads((directory/'verification.json').read_text())
        self.assertTrue(proof['passed'])
        self.assertEqual(file_hash(directory/'stochastic-records.json'),proof['recordsSha256'])
        for record in json.loads((directory/'stochastic-records.json').read_text()):
            old=Control(record['weights'],264)
            rng=torch.get_rng_state().clone()
            new=Learner(record['weights'],264)
            self.assertTrue(torch.equal(rng,torch.get_rng_state()))
            self.assertEqual(old.weights(),new.weights())
            self.assertEqual(old.critic_hash(),new.critic_hash())
            self.assertEqual(old.std(),new.std())
            tensor=lambda key:torch.tensor([r[key] for r in record['rows']],dtype=torch.float64)
            actual=conditional_mean(new.actor,tensor('x'),tensor('previousX'),tensor('previousAction'),tensor('hasPrevious'))
            self.assertLess((actual-tensor('mean')).abs().max().item(),1e-12)
            mask=tensor('hasPrevious')
            scales=torch.where(mask>0,torch.full_like(mask,math.sqrt(1-RHO*RHO)),torch.ones_like(mask))
            self.assertTrue(torch.equal(scales,tensor('innovationScale')))

if __name__ == '__main__':
    unittest.main()
