"""Float64 networks; Node remains the authoritative physical actor runtime."""
import torch
from torch import nn

DIM, HIDDEN = 520, 64
COUNT = DIM*HIDDEN+HIDDEN+HIDDEN*2+2

def make_actor():
    actor = nn.Sequential(nn.Linear(DIM, HIDDEN, dtype=torch.float64), nn.Tanh(),
                          nn.Linear(HIDDEN, 2, dtype=torch.float64))
    nn.init.zeros_(actor[2].weight)
    nn.init.zeros_(actor[2].bias)
    return actor

def export_weights(actor):
    return torch.cat([actor[0].weight.T.flatten(), actor[0].bias,
                      actor[2].weight.T.flatten(), actor[2].bias]).detach().tolist()

def clamp_actor(actor):
    with torch.no_grad():
        for p in actor.parameters():
            p.clamp_(-8, 8)
