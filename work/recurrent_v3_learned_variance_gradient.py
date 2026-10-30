"""Reward likelihood gradients for native202 mean plus130 variance coefficients.

Recurrent credit is truncated at recorded chunk boundaries. The shared-gain
Float32 cast derivative retains the previously documented STE approximation.
"""
import numpy as np
import torch
from differentiable_v3_reservoir import DifferentiableV3
from learned_neural_exploration import scale
from neural_exploration_ar1 import conditional


def gradient(metadata, episodes, advantages, exploration, on_chunk=None, device='cuda:0', estimate_fisher=True):
    torch.set_num_threads(2)
    model = DifferentiableV3(metadata['graph'], metadata['genome']['policyWeights']).to(device)
    variance = torch.nn.Parameter(torch.tensor(exploration['weights'], dtype=torch.float64, device=device))
    count = len(model.weights)+len(variance)
    active = sum(r['active'] for e in episodes for c in e['chunks'] for r in c['rows'])
    fisher = np.zeros((count, count)) if estimate_fisher else None
    cursor, chunks, maximum_error, conditional_error, std_error = 0, 0, 0., 0., 0.
    for episode in episodes:
        if episode['exploration'] != exploration:
            raise ValueError('On-policy variance parameters required')
        for chunk in episode['chunks']:
            rows = chunk['rows']; n = len(rows)
            tensor = lambda values: torch.tensor(values, dtype=torch.float64, device=device)
            result = model(tensor([r['sensors'] for r in rows]), tensor(chunk['initialActivity']))
            maximum_error = max(maximum_error, float((result['logits'].detach()-tensor([r['mean'] for r in rows])).abs().max()))
            features = torch.tanh(8*result['states'][:, model.readout])
            sigma = scale(features, exploration, variance)
            action = tensor([r['action'] for r in rows])
            mean, std = conditional(result['logits'], sigma, action, chunk.get('previousPolicyState'), exploration['rho'])
            conditional_error = max(conditional_error, float((mean.detach()-tensor([r['conditionalMean'] for r in rows])).abs().max()))
            std_error = max(std_error, float((std.detach()-tensor([r['conditionalStd'] for r in rows])).abs().max()))
            if maximum_error > 1e-10 or max(conditional_error, std_error) > 1e-9:
                raise ValueError('Learned distribution differs from native sampling')
            mask = tensor([r['active'] for r in rows]); advantage = tensor(advantages[cursor:cursor+n])
            logp = (-.5*((action-mean)/std)**2-std.log()).sum(-1)
            if estimate_fisher:
                scores = torch.autograd.grad((logp*mask).sum(), (model.weights, variance), retain_graph=True)
                vector = np.concatenate([v.detach().cpu().numpy() for v in scores])
                fisher += np.outer(vector, vector)/active
            (-(logp*mask*advantage).sum()/active).backward()
            cursor += n; chunks += 1
            if on_chunk:
                on_chunk(chunks, cursor, maximum_error)
    if cursor != len(advantages):
        raise ValueError('Trajectory advantage alignment failed')
    direction = -np.concatenate([model.weights.grad.detach().cpu().numpy(), variance.grad.detach().cpu().numpy()])
    if not np.isfinite(direction).all():
        raise ValueError('Nonfinite joint likelihood gradient')
    offset = metadata['graph']['readoutOffset']; native_count = len(model.weights)
    blocks = [('sensoryScale', 0, 28), ('sensoryBias', 28, 56), ('recurrentGain', 56, offset),
              ('motorReadoutAndBias', offset, native_count), ('varianceReadout', native_count, len(direction))]
    metrics = {'transitions':cursor,'chunks':chunks,'device':str(model.weights.device),'torchVersion':torch.__version__,
               'maximumNativeMeanError':maximum_error,'maximumConditionalMeanError':conditional_error,
               'maximumConditionalStdError':std_error,
               'gradientNorms':{name:float(np.linalg.norm(direction[a:b])) for name,a,b in blocks}}
    if estimate_fisher:
        metrics['chunkEmpiricalFisher'] = fisher.tolist()
    return direction, metrics
