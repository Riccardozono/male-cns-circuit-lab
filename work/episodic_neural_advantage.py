"""Undiscounted reward-to-go with independent common-origin episode baselines."""
import numpy as np


def advantages(reward_sequences):
    if len(reward_sequences)<2 or any(not len(r) for r in reward_sequences):raise ValueError('Independent complete episodes required')
    returns=[np.cumsum(np.asarray(r,dtype=np.float64)[::-1])[::-1] for r in reward_sequences]
    result=[]
    for i,own in enumerate(returns):
        baseline=np.zeros(len(own))
        for j,other in enumerate(returns):
            if j!=i:baseline[:min(len(own),len(other))]+=other[:min(len(own),len(other))]/(len(returns)-1)
        result.append((own-baseline).astype(np.float32))
    return result,[r.astype(np.float32) for r in returns]
