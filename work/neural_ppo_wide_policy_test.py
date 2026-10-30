"""Numerical network fixtures only; never training data or driving labels."""
import json
import subprocess
import unittest
import torch
from neuronal_experiment_io import ROOT, NODE
from neural_ppo_wide_network import DIM, COUNT, make_actor, export_weights

class WidePolicyUnits(unittest.TestCase):
    def node_mean(self, x, actor):
        fixture = {'x': x.tolist(), 'weights': export_weights(actor)}
        command = "const p=require('./work/neural-ppo-wide-policy.cjs'),fs=require('node:fs'),v=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(p.mean(v.x,v.weights)));"
        result = subprocess.run([str(NODE), '-e', command], cwd=ROOT, input=json.dumps(fixture), text=True,
                                capture_output=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        return torch.tensor(json.loads(result.stdout), dtype=torch.float64)

    def test_initial_zero_output_is_exact_in_both_runtimes(self):
        torch.manual_seed(161026)
        actor = make_actor()
        x = torch.linspace(-1, 1, DIM, dtype=torch.float64)
        self.assertEqual(len(export_weights(actor)), COUNT)
        torch.testing.assert_close(actor(x), torch.zeros(2, dtype=torch.float64), rtol=0, atol=0)
        torch.testing.assert_close(self.node_mean(x, actor), torch.zeros(2, dtype=torch.float64), rtol=0, atol=0)

    def test_nonzero_output_layout_and_float64_arithmetic_match(self):
        torch.manual_seed(961026)
        actor = make_actor()
        with torch.no_grad():
            actor[2].weight.uniform_(-.1, .1)
            actor[2].bias.uniform_(-.1, .1)
        x = torch.linspace(-.8, .9, DIM, dtype=torch.float64)
        torch.testing.assert_close(self.node_mean(x, actor), actor(x), rtol=0, atol=1e-12)

    def test_hidden_layer_can_receive_gradient_after_output_moves(self):
        actor = make_actor()
        with torch.no_grad():
            actor[2].weight.fill_(.01)
        actor(torch.ones(DIM, dtype=torch.float64)).sum().backward()
        self.assertGreater(actor[0].weight.grad.abs().max().item(), 0)

if __name__ == '__main__':
    unittest.main()
