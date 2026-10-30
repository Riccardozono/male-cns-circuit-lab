"""Self-experience consolidation; no position, clock or target actions."""
import numpy as np
import torch
from torch import nn
from neural_feedback_kernel import KernelActor


def fit_consolidation(reference):
    reference=np.asarray(reference,dtype=np.float32)
    if reference.ndim!=2 or reference.shape[1]!=518 or len(reference)<100 or not np.isfinite(reference).all():
        raise ValueError('Full genuinely observed neural experience required')
    center=reference.astype(np.float64).mean(0)
    covariance=(reference.astype(np.float64)-center).T@(reference.astype(np.float64)-center)/len(reference)
    eigenvalues,eigenvectors=np.linalg.eigh(covariance)
    projection=eigenvectors[:,-64:].astype(np.float32)
    adjacent=np.sqrt(np.mean(np.diff(reference.astype(np.float64),axis=0)**2,axis=1))
    bandwidth=max(.003,float(np.median(adjacent))*2.)
    return {'format':'actual-neural-self-consolidation-v1','projection':projection.tolist(),'center':center.astype(np.float32).tolist(),
            'bandwidth':bandwidth,'exactRetentionDeadband':3e-5,'nearestCandidates':16,'rows':len(reference),
            'boundary':'Unsupervised nearest neural-experience density on the actual successful lap. No actuator labels, route positions or inference-time lap/time condition.'}


class NeuralConsolidation(nn.Module):
    def __init__(self,reference,configuration):
        super().__init__();self.configuration=configuration
        self.register_buffer('reference',torch.as_tensor(reference,dtype=torch.float32))
        self.register_buffer('projection',torch.tensor(configuration['projection'],dtype=torch.float32))
        self.register_buffer('center',torch.tensor(configuration['center'],dtype=torch.float32))
        self.register_buffer('projectedReference',(self.reference-self.center)@self.projection)
    def distances(self,observations):
        projected=(observations-self.center)@self.projection
        distances=torch.cdist(projected,self.projectedReference)
        candidates=distances.topk(self.configuration['nearestCandidates'],largest=False).indices
        # Direct subtraction preserves exact0 for a known Float32 vector,
        # avoiding the cancellation in the matrix-based cdist distance.
        actual=(observations[:,None,:]-self.reference[candidates]).square().mean(-1).sqrt()
        return actual.min(-1).values
    def forward(self,observations):
        d=(self.distances(observations)-self.configuration['exactRetentionDeadband']).clamp_min(0)
        return -torch.expm1(-(d/self.configuration['bandwidth']).square())


class RetentionActor(KernelActor):
    def __init__(self,basis,reference,configuration):
        super().__init__(basis);self.consolidation=NeuralConsolidation(reference,configuration)
    def deterministic(self,observations):
        return super().deterministic(observations)*self.consolidation(observations)[:,None]
