"""Likelihood of own AR1 exploration samples; no teacher or driving target."""
import torch
RHO=.9

def conditional_mean(actor,x,previous_x,previous_action,has_previous):
    return actor(x)+RHO*has_previous.unsqueeze(-1)*(previous_action-actor(previous_x))
