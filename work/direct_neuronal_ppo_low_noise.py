"""Controlled ablation: only the initial Gaussian exploration scale changes."""
import math
import torch
from direct_neuronal_ppo import Learner as Base

class Learner(Base):
    def __init__(self, initial_weights, dimension, seed=171026):
        super().__init__(initial_weights, dimension, seed)
        with torch.no_grad():
            self.log_std.copy_(torch.tensor([math.log(.02), math.log(.02)], dtype=torch.float64))
