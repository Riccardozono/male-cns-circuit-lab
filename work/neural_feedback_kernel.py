"""Compact local features fitted ONLY to genuinely observed neuronal vectors."""
import numpy as np
import torch
from torch import nn


def fit_basis(observations,centers=96):
    samples=np.asarray(observations,dtype=np.float64)
    if samples.ndim!=2 or samples.shape[1]!=518 or not np.isfinite(samples).all() or not 8<=centers<=256:
        raise ValueError('Actual normalized neuronal observations required')
    if len(samples)<centers:raise ValueError('Insufficient actual observations')
    selected=[0];distance=((samples-samples[0])**2).mean(1)
    for _ in range(1,centers):
        j=int(np.argmax(distance))
        if distance[j]<1e-12:raise ValueError('Insufficient distinct neuronal contexts')
        selected.append(j);distance=np.minimum(distance,((samples-samples[j])**2).mean(1))
    prototypes=samples[selected]
    distances=np.sqrt(np.maximum(0,((samples[:,None,:]-prototypes[None,:,:])**2).mean(2)))
    assignment=distances.argmin(1)
    inter=np.sqrt(np.maximum(0,((prototypes[:,None,:]-prototypes[None,:,:])**2).mean(2)))
    np.fill_diagonal(inter,np.inf)
    radii=np.asarray([max(float(distances[assignment==j,j].max())*1.25,float(inter[j].min())*.6,1e-5) for j in range(centers)])
    return {'format':'actual-neural-compact-basis-v1','centers':prototypes.tolist(),'radii':radii.tolist(),
            'samples':len(samples),'algorithm':'farthest actual neural samples; local Voronoi covering radii; no route/action labels',
            'dimension':518,'centerCount':centers}


class RadialFeatures(nn.Module):
    def __init__(self,basis):
        super().__init__()
        if basis['format']!='actual-neural-compact-basis-v1':raise ValueError('Explicit local basis required')
        centers=torch.tensor(basis['centers'],dtype=torch.float32);radii=torch.tensor(basis['radii'],dtype=torch.float32)
        if centers.ndim!=2 or centers.shape[1]!=518 or radii.shape!=(len(centers),) or not torch.isfinite(centers).all() or not (radii>0).all():
            raise ValueError('Invalid neuronal feature basis')
        self.register_buffer('centers',centers);self.register_buffer('radii',radii)
    def forward(self,observations):
        # cdist avoids constructing a batch x centers x518 temporary on GPU.
        r=torch.cdist(observations,self.centers)/(518**.5*self.radii)
        supported=(1-r).clamp_min(0)
        features=supported.pow(4)*(4*r+1)
        return features/features.sum(-1,keepdim=True).clamp_min(1)


class KernelActor(nn.Module):
    def __init__(self,basis):
        super().__init__();self.layers=nn.Sequential(RadialFeatures(basis),nn.Linear(basis['centerCount'],2,bias=False))
        nn.init.zeros_(self.layers[-1].weight)
        self.log_std=nn.Parameter(torch.tensor(np.log([.003,.06]),dtype=torch.float32))
    def deterministic(self,observations):return torch.tanh(self.layers(observations))
