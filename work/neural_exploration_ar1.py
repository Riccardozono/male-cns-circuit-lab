"""Differentiable conditional distribution of neural-scaled AR1 exploration."""
import torch


def scale(features, config):
    direction = torch.tensor(config['direction'], dtype=features.dtype, device=features.device)
    response = (features*direction[:-1]/features.shape[-1]**.5).sum(-1)+direction[-1]
    gate = ((response-config['threshold'])/(1-config['threshold'])).clamp(0, 1)
    gate = gate*gate*(3-2*gate)
    floor = torch.tensor(config['floor'], dtype=features.dtype, device=features.device)
    ceiling = torch.tensor(config['ceiling'], dtype=features.dtype, device=features.device)
    return floor+(ceiling-floor)*gate[:, None]


def conditional(means, sigmas, actions, previous, rho):
    tensor = lambda values: torch.tensor(values, dtype=means.dtype, device=means.device)
    previous_means = torch.cat([(tensor(previous['mean']) if previous else means[0])[None], means[:-1]])
    previous_sigmas = torch.cat([(tensor(previous['sigma']) if previous else sigmas[0])[None], sigmas[:-1]])
    previous_actions = torch.cat([(tensor(previous['action']) if previous else actions[0])[None], actions[:-1]])
    factors = torch.full((len(means), 1), rho, dtype=means.dtype, device=means.device)
    if previous is None:
        factors[0] = 0
    return (means+factors*sigmas*(previous_actions-previous_means)/previous_sigmas,
            sigmas*torch.sqrt(1-factors*factors))
