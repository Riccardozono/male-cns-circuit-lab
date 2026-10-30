"""Differentiable native-feature variance readout; no prescribed actions."""
import torch


def scale(features, config, weights):
    n = features.shape[-1]
    response = features@weights[:-2].reshape(n, 2)/(n**.5)+weights[-2:]
    low = torch.tensor(config['floor'], dtype=features.dtype, device=features.device).log()
    high = torch.tensor(config['ceiling'], dtype=features.dtype, device=features.device).log()
    initial = torch.tensor(config['initial'], dtype=features.dtype, device=features.device).log()
    fraction = (initial-low)/(high-low)
    offset = (fraction/(1-fraction)).log()
    return (low+(high-low)*torch.sigmoid(response+offset)).exp()
