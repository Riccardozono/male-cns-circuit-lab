"""Versioned conditional policy for temporally persistent motor exploration.

Only actual MaleCNS observations enter the actor. Previous latent samples enter
the sampling distribution, never a position/time rule or a desired action.
"""
import torch
from neural_feedback_ppo import Actor, Critic, compute_gae


RHO = (0., .95)


def conditional(actor, observations, previous_observations, previous_actions, continuation):
    mean = actor.layers(observations)
    previous_mean = actor.layers(previous_observations)
    rho = mean.new_tensor(RHO) * continuation.reshape(-1, 1)
    # Both current and preceding neural means require gradients. Sigma is a
    # global learned vector, so its current/previous ratio is exactly one.
    center = mean + rho * (previous_actions - previous_mean)
    std = actor.log_std.clamp(-6, -.5).exp() * torch.sqrt(1 - rho.square())
    return torch.distributions.Normal(center, std)


def conditional_kl(old_center, old_std, distribution):
    return (torch.log(distribution.scale / old_std) +
            (old_std.square() + (old_center - distribution.loc).square()) /
            (2 * distribution.scale.square()) - .5).sum(-1)
