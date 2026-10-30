"""Learned affine motor plasticity, applied only to novel neuronal experience."""
import torch
from torch import nn
from neural_retained_balanced import BalancedRetainedActor


class MotorModulationActor(BalancedRetainedActor):
    def __init__(self,basis,reference,configuration,capacity=512):
        super().__init__(basis,reference,configuration,capacity)
        self.motorBias=nn.Parameter(torch.zeros(2))
        self.motorGain=nn.Parameter(torch.zeros(2))
    def deterministic(self,obs):
        gate=self.consolidation(obs)[:,None]
        additive=torch.tanh(self.layers(obs)+self.motorBias)*gate
        modulation=torch.tanh(self.motorGain).expand(len(obs),-1)*gate
        return torch.cat([additive,modulation],-1)
