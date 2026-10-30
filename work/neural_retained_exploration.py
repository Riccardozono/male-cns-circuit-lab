"""Gaussian exploration applies only through fixed neural-experience novelty."""
import numpy as np
import torch
from torch import nn
from neural_feedback_retention import RetentionActor,NeuralConsolidation


RHO=(.8,.95)


def conditional(actor,obs,previous_obs,previous_latent,continuation):
    mean=actor.layers(obs);previous_mean=actor.layers(previous_obs)
    rho=mean.new_tensor(RHO)*continuation.reshape(-1,1)
    center=mean+rho*(previous_latent-previous_mean)
    std=actor.log_std.clamp(-6,-.5).exp()*torch.sqrt(1-rho.square())
    return torch.distributions.Normal(center,std,validate_args=False)


def applied(actor,obs,latent,gate=None):
    if gate is None:gate=actor.consolidation(obs)
    return torch.tanh(latent)*gate[:,None]


class GrowingNeuralFeatures(nn.Module):
    def __init__(self,basis,capacity=512):
        super().__init__();n=basis['centerCount']
        if not n<=capacity<=1024:raise ValueError('Bounded neural feature capacity required')
        centers=torch.zeros(capacity,518);radii=torch.ones(capacity);enabled=torch.zeros(capacity)
        centers[:n]=torch.tensor(basis['centers']);radii[:n]=torch.tensor(basis['radii']);enabled[:n]=1
        self.register_buffer('centers',centers);self.register_buffer('radii',radii);self.register_buffer('enabled',enabled)
    def forward(self,obs):
        r=torch.cdist(obs,self.centers)/(518**.5*self.radii)
        return (1-r).clamp_min(0).pow(4)*(4*r+1)*self.enabled


class AxisReadout(nn.Module):
    def __init__(self,capacity):
        super().__init__();self.steering=nn.Parameter(torch.zeros(capacity));self.pedal=nn.Parameter(torch.zeros(capacity))
    def forward(self,features):return torch.stack([features@self.steering,features@self.pedal],-1)


class AdaptiveRetainedActor(nn.Module):
    def __init__(self,basis,reference,configuration,capacity=512):
        super().__init__();self.layers=nn.Sequential(GrowingNeuralFeatures(basis,capacity),AxisReadout(capacity))
        self.log_std=nn.Parameter(torch.tensor(np.log([.01,.25]),dtype=torch.float32))
        self.consolidation=NeuralConsolidation(reference,configuration)
    def deterministic(self,obs):return applied(self,obs,self.layers(obs))
    @torch.no_grad()
    def grow(self,actual_observations,maximum=8):
        features=self.layers[0];before=self.layers(actual_observations).clone();added=[]
        for _ in range(maximum):
            inactive=(features.enabled==0).nonzero().flatten()
            if len(inactive)==0:break
            values=features(actual_observations);novel=values.max(-1).values<.01
            if not novel.any():break
            active=(features.enabled>0).nonzero().flatten()
            distances=torch.cdist(actual_observations,features.centers[active])/(518**.5)
            nearest=distances.min(-1).values;nearest[~novel]=-1
            j=int(nearest.argmax());slot=int(inactive[0])
            if self.layers[-1].steering[slot]!=0 or self.layers[-1].pedal[slot]!=0:raise AssertionError('Unused features must have zero action coefficients')
            features.centers[slot]=actual_observations[j];features.radii[slot]=max(.005,.6*float(nearest[j]));features.enabled[slot]=1
            added.append({'slot':slot,'actualObservationRow':j,'radius':float(features.radii[slot])})
        after=self.layers(actual_observations);error=float((after-before).abs().max())
        if not torch.equal(before,after):raise AssertionError('Zero-weight feature growth changed the current neural policy')
        return {'added':added,'enabledFeatures':int(features.enabled.sum()),'maximumMeanChange':error}
