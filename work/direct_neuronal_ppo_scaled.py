"""Only nonlinear decoder inputs are normalized; initial policy stays exact."""
import json
import torch
from direct_neuronal_ppo_nonlinear import Learner as Base, NonlinearActor
from neuronal_experiment_io_retry import ROOT

class ScaledActor(NonlinearActor):
    def __init__(self, linear, packed, dimension):
        super().__init__(linear, packed, dimension)
        scaler = json.loads((ROOT/'.impeccable/review/neural-sacl/direct-neuronal-scaler.json').read_text())
        assert scaler['dimension'] == dimension == 77 and scaler['clip'] == 5
        self.register_buffer('center', torch.tensor(scaler['center'],dtype=torch.float64))
        self.register_buffer('scale', torch.tensor(scaler['scale'],dtype=torch.float64))
        assert torch.all(torch.isfinite(self.center)) and torch.all(self.scale >= .02)

    def forward(self,x):
        z = ((x-self.center)/self.scale).clamp(-5,5)
        return self.linear(x)+self.output(torch.tanh(self.hidden(z)))

class Learner(Base):
    def __init__(self,initial_weights,dimension,seed=171026):
        super().__init__(initial_weights,dimension,seed)
        self.actor = ScaledActor(self.actor.linear,initial_weights,dimension)
        self.actor_optim = torch.optim.Adam([*self.actor.parameters(),self.log_std],lr=.0003)
