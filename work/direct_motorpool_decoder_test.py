"""Numeric fixtures test layout/gradient/parity, not learned driving."""
import json
import subprocess
import unittest
import torch
from direct_neuronal_ppo import Learner as Linear
from direct_neuronal_ppo_nonlinear import Learner
from neuronal_experiment_io_retry import ROOT, NODE

def extend(w, d):
    return w+[((i*37+11)%101-50)/500 for i in range(64*d)]+[((i*13)%23-11)/100 for i in range(64)]+[0.]*(128+2)

class DecoderTests(unittest.TestCase):
    def test_initial_policy_critic_rng_and_trainability(self):
        d = 264
        w = [((i*7)%31-15)/100 for i in range(d*2)]
        control = Linear(w, d)
        state = torch.get_rng_state().clone()
        trial = Learner(extend(w, d), d)
        self.assertTrue(torch.equal(state, torch.get_rng_state()))
        self.assertEqual(control.critic_hash(), trial.critic_hash())
        x = torch.arange(7*d, dtype=torch.float64).reshape(7, d).remainder(53)/53
        self.assertTrue(torch.equal(control.actor(x), trial.actor(x)))
        self.assertEqual(trial.weights(), extend(w, d))
        self.assertTrue(all(p.requires_grad for p in trial.actor.parameters()))
        # Pure mathematical probe: no imitation labels or physical driving claim.
        trial.actor(x).sum().backward()
        self.assertGreater(trial.actor.output.weight.grad.abs().sum().item(), 0)
        with torch.no_grad():
            trial.actor.output.weight.fill_(.01)
        trial.actor.zero_grad()
        trial.actor(x).sum().backward()
        self.assertGreater(trial.actor.hidden.weight.grad.abs().sum().item(), 0)
        self.assertGreater(trial.actor.linear.weight.grad.abs().sum().item(), 0)
        self.assertFalse(torch.equal(control.actor(x), trial.actor(x)))
        script = "const L=require('./work/neural-direct-nonlinear-layout.cjs');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const p=JSON.parse(s);console.log(JSON.stringify(p.x.map(x=>L.mean(x,p.w))))});"
        actual = json.loads(subprocess.check_output([str(NODE), '-e', script], input=json.dumps({'x': x.tolist(), 'w': trial.weights()}), text=True, cwd=ROOT, creationflags=subprocess.CREATE_NO_WINDOW))
        self.assertLess((torch.tensor(actual, dtype=torch.float64)-trial.actor(x)).abs().max().item(), 1e-12)

if __name__ == '__main__':
    unittest.main()
