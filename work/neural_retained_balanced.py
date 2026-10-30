"""Match steering exploration/update scale to the available novel-state authority."""
import math
import torch
from neural_retained_exploration_v2 import AdaptiveRetainedActorV2,conditional,applied,RHO


class BalancedRetainedActor(AdaptiveRetainedActorV2):
    def __init__(self,basis,reference,configuration,capacity=512):
        super().__init__(basis,reference,configuration,capacity)
        with torch.no_grad():self.log_std[0]=math.log(.25)
