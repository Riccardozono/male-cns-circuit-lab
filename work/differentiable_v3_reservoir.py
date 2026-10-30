"""Research mirror of the existing V3 policy with recurrent credit gradients.

Topology, normalization, rate dynamics and the 202-parameter layout are preserved.
Float32 gain casts use Torch's straight-through cast derivative: forward values
match native gain quantization; this is not the exact derivative of quantization.
"""
import torch
from torch import nn


class DifferentiableV3(nn.Module):
    def __init__(self, graph, weights):
        super().__init__()
        self.n, self.iterations = graph['n'], graph['iterations']
        self.offset = graph['readoutOffset']
        self.weights = nn.Parameter(torch.tensor(weights, dtype=torch.float64))
        edges = torch.tensor([graph['to'], graph['from']], dtype=torch.int64)
        values = torch.tensor(graph['weights'], dtype=torch.float64) * .9
        self.register_buffer('connectivity', torch.sparse_coo_tensor(edges, values, (self.n, self.n)).coalesce())
        self.register_buffer('inputs', torch.tensor(graph['inputs'], dtype=torch.int64))
        self.register_buffer('channels', torch.arange(len(graph['inputs']), dtype=torch.int64) % 28)
        self.register_buffer('groups', torch.tensor(graph['groups'], dtype=torch.int64))
        self.register_buffer('readout', torch.tensor(graph['readoutNodes'], dtype=torch.int64))
        assert len(weights) == self.offset + len(self.readout)*2 + 2
        assert len(set(graph['inputs'])) == len(graph['inputs'])

    def forward(self, sensors, initial_activity, edges_enabled=True):
        w = self.weights
        gains = w[56:self.offset].clamp(-.8, .8).exp().to(torch.float32).to(torch.float64)
        activity, logits, commands, states = initial_activity, [], [], []
        norm = 1./len(self.readout)**.5
        for sensor in sensors:
            normalized = torch.cat([sensor[:11]*2-1, sensor[11:]])
            injection = torch.zeros(self.n, dtype=w.dtype, device=w.device).index_copy(
                0, self.inputs, .7*(normalized[self.channels]*w[self.channels]+w[28+self.channels]))
            for _ in range(self.iterations):
                summed = injection
                if edges_enabled:
                    summed = summed + torch.sparse.mm(self.connectivity, (activity*gains[self.groups]).unsqueeze(1)).squeeze(1)
                activity = .45*activity + .55*torch.tanh(summed)
            features = torch.tanh(8*activity[self.readout])
            latent = (features[:, None]*w[self.offset:-2].reshape(-1, 2)*norm).sum(0)+w[-2:]
            active = bool(edges_enabled and (activity[self.readout].abs().max() >= 1e-7))
            logits.append(latent if active else latent*0)
            action = torch.tanh(latent) if active else latent*0
            commands.append(torch.stack([action[0], action[1].clamp_min(0), (-action[1]).clamp_min(0)]))
            states.append(activity)
        return {'logits': torch.stack(logits), 'commands': torch.stack(commands), 'states': torch.stack(states)}
