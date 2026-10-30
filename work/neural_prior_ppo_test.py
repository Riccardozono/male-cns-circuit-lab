"""Actual-observation numeric parity and isolated264input critic initialization."""
import json
import math
import subprocess
import unittest
import torch
from neuronal_experiment_io_retry import ROOT, NODE, file_hash
from direct_neuronal_ppo_nonlinear import Learner as Control
from neural_prior_ppo import Learner,PREPARED

class MotorPoolTest(unittest.TestCase):
    def test_actual_observations_and_critic(self):
        data = json.loads((PREPARED/'actual-rollouts.json').read_text())
        fit = json.loads((PREPARED/'fit.json').read_text())
        self.assertEqual(file_hash(PREPARED/'actual-rollouts.json'),fit['dataSha256'])
        w = data['weights']
        old = Control(w,642)
        with torch.no_grad():
            old.log_std.copy_(torch.tensor([math.log(.1),math.log(.7)],dtype=torch.float64))
        rng = torch.get_rng_state().clone()
        new = Learner(w,642)
        self.assertTrue(torch.equal(rng,torch.get_rng_state()))
        self.assertEqual(new.weights(),old.weights())
        self.assertEqual(new.std(),old.std())
        for key,value in old.critic.state_dict().items():
            expected = value+fit['offset'] if key == '4.bias' else value
            self.assertTrue(torch.equal(new.critic.state_dict()[key],expected))
        x = torch.tensor([row['x'] for b in data['blocks'][0] for row in b['rows'][:8]],dtype=torch.float64)
        self.assertTrue(torch.equal(new.actor(x),old.actor(x)))
        with torch.no_grad():
            new.actor.output.weight.fill_(.01)
        new.actor(x).sum().backward()
        self.assertGreater(new.actor.linear.weight.grad[:,516:639].abs().sum().item(),0)
        self.assertGreater(new.actor.hidden.weight.grad.abs().sum().item(),0)
        script = "const L=require('./work/neural-prior-readout-scaled-layout.cjs');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const p=JSON.parse(s);console.log(JSON.stringify(p.x.map(x=>L.mean(x,p.w))))});"
        actual = json.loads(subprocess.check_output([str(NODE),'-e',script],input=json.dumps({'x':x.tolist(),'w':new.weights()}),text=True,cwd=ROOT,creationflags=subprocess.CREATE_NO_WINDOW))
        self.assertLess((torch.tensor(actual,dtype=torch.float64)-new.actor(x)).abs().max().item(),1e-12)

if __name__ == '__main__':
    unittest.main()
