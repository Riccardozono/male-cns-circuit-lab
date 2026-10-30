"""Only initial steering exploration differs from the R7 low-noise control."""
import math
import torch
from direct_neuronal_ppo import Learner as Base

class Learner(Base):
    def __init__(self, initial_weights, dimension, seed=171026):
        super().__init__(initial_weights, dimension, seed)
        with torch.no_grad():
            self.log_std.copy_(torch.tensor([math.log(.08), math.log(.02)], dtype=torch.float64))
