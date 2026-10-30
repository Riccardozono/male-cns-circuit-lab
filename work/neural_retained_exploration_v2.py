"""Wider plasticity on novel neural experience; successful-state residual stays0."""
import copy
import torch
from neural_feedback_retention import NeuralConsolidation
from neural_retained_exploration import AdaptiveRetainedActor,conditional,applied,RHO


class ScaledNeuralConsolidation(NeuralConsolidation):
    def forward(self,observations):return (16*super().forward(observations)).clamp_max(1)


class AdaptiveRetainedActorV2(AdaptiveRetainedActor):
    def __init__(self,basis,reference,configuration,capacity=512):
        wider=copy.deepcopy(basis);wider['radii']=[2*r for r in wider['radii']]
        super().__init__(wider,reference,configuration,capacity)
        self.consolidation=ScaledNeuralConsolidation(reference,configuration)
    @torch.no_grad()
    def grow(self,actual_observations,maximum=8):
        before=self.layers(actual_observations).clone();result=super().grow(actual_observations,maximum)
        for added in result['added']:
            self.layers[0].radii[added['slot']]*=2.5;added['radius']=float(self.layers[0].radii[added['slot']])
        if not torch.equal(before,self.layers(actual_observations)):raise AssertionError('Wider zero-weight features changed the existing policy')
        result['maximumMeanChange']=0.
        return result
