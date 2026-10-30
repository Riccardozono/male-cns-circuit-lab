"""Reward SAC with a measured, per-update Gaussian trust constraint.

The constraint uses actual neuronal replay observations only. It does not
compare with a teacher, target controls, position, time or a route. Inference
and the critic's real reward objective are unchanged.
"""
import numpy as np
import torch
from neural_sac import GentleWarmSAC


def mean_gaussian_kl(old_mean, old_log_std, new_mean, new_log_std):
    terms = new_log_std-old_log_std + (torch.exp(2*old_log_std)+(old_mean-new_mean).square())/(2*torch.exp(2*new_log_std))-.5
    return terms.sum(dim=-1).mean().clamp_min(0)


@torch.no_grad()
def constrain_update(actor, observations, previous_parameters, previous_mean, previous_log_std, budget=.001, max_backtracks=12):
    if not 0 < budget <= .1 or not 1 <= max_backtracks <= 20:
        raise ValueError('Bounded measured trust constraint required')
    parameters = list(actor.parameters())
    if len(parameters) != len(previous_parameters):
        raise ValueError('Exact old actor parameters required')
    proposal = [p.detach().clone() for p in parameters]
    before = None
    for backtracks in range(max_backtracks+1):
        fraction = 2.**-backtracks
        if backtracks:
            for p, old, new in zip(parameters, previous_parameters, proposal):
                p.copy_(old+(new-old)*fraction)
        mean, log_std, _ = actor.get_action_dist_params(observations)
        divergence = float(mean_gaussian_kl(previous_mean,previous_log_std,mean,log_std).item())
        if before is None:
            before = divergence
        if np.isfinite(divergence) and divergence <= budget:
            return {'fraction':fraction,'backtracks':backtracks,'proposalMeanKl':before,'acceptedMeanKl':divergence,'rejected':False}
    for p, old in zip(parameters,previous_parameters):
        p.copy_(old)
    return {'fraction':0.,'backtracks':max_backtracks,'proposalMeanKl':before if np.isfinite(before) else None,'acceptedMeanKl':0.,'rejected':True}


class ReplayTrustSAC(GentleWarmSAC):
    def __init__(self,*args,trust_budget=.001,trust_samples=128,**kwargs):
        super().__init__(*args,**kwargs)
        if not 0 < trust_budget <= .1 or not 16 <= trust_samples <= 512:
            raise ValueError('Bounded trust configuration required')
        self.trust_budget,self.trust_samples = trust_budget,trust_samples
        self.trust_history = []

    def train(self,gradient_steps,batch_size=64):
        for _ in range(gradient_steps):
            # Deterministic positions in the ACTUAL replay. No extra RNG draw:
            # the reference run and this run keep the same random stream until
            # the first genuinely constrained policy update changes behavior.
            count = self.replay_buffer.size()
            if count < 1:
                raise RuntimeError('Actual replay observations required')
            indices = np.linspace(0,count-1,min(count,self.trust_samples),dtype=np.int64)
            members = np.arange(len(indices))%self.n_envs
            observations = torch.as_tensor(self.replay_buffer.observations[indices,members],device=self.device)
            with torch.no_grad():
                previous = [p.detach().clone() for p in self.actor.parameters()]
                mean,log_std,_ = self.actor.get_action_dist_params(observations)
                mean,log_std = mean.detach().clone(),log_std.detach().clone()
            super().train(gradient_steps=1,batch_size=batch_size)
            result = constrain_update(self.actor,observations,previous,mean,log_std,budget=self.trust_budget)
            self.trust_history.append({'update':self._n_updates,'actualReplaySamples':len(indices),**result})

    def trust_summary(self):
        history = self.trust_history
        return {'budget':self.trust_budget,'updates':len(history),'fullUpdates':sum(r['fraction']==1 for r in history),
                'backtrackedUpdates':sum(0<r['fraction']<1 for r in history),'rejectedUpdates':sum(r['rejected'] for r in history),
                'maxAcceptedMeanKl':max((r['acceptedMeanKl'] for r in history),default=0.),
                'meanAcceptedFraction':float(np.mean([r['fraction'] for r in history])) if history else 0.,
                'boundary':'Measured on a deterministic subset of real replay neuronal states, not a global behavioral or physical safety guarantee.'}
