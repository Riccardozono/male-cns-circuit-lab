"""A bounded first reward-gradient comparison, not an installed app controller.

Complete native episodes provide Monte Carlo returns. Native neural history is
replayed for the final KL/surrogate check; gradients truncate history at32control
boundaries. The value baseline is fitted from actual neural features, not driving
labels. The gain quantization derivative follows the preflight's STE limitation.
"""
import numpy as np
import torch
from differentiable_v3_reservoir import DifferentiableV3
from neural_exploration_ar1 import scale as noise_scale, conditional as noise_conditional


def returns(rewards, gamma=1.):
    result, total = [], 0.
    for reward in reversed(rewards):
        total = reward + gamma*total
        result.append(total)
    return list(reversed(result))


def make_advantages(episodes, gae_lambda=1.):
    rows = [row for episode in episodes for chunk in episode['chunks'] for row in chunk['rows']]
    rtg = np.concatenate([returns([r['reward'] for c in e['chunks'] for r in c['rows']]) for e in episodes])
    x = np.column_stack([np.asarray([r['features'] for r in rows])/8., np.ones(len(rows))])
    active = np.asarray([r['active'] for r in rows], dtype=bool)
    penalty = .001*np.eye(x.shape[1]); penalty[-1, -1] = 0
    coefficients = np.linalg.solve(x[active].T@x[active]/active.sum()+penalty, x[active].T@rtg[active]/active.sum())
    values = x@coefficients
    raw = rtg-values
    if gae_lambda < 1:
        if not 0 <= gae_lambda <= 1:
            raise ValueError('Bounded GAE lambda required')
        raw = np.zeros_like(raw)
        offset = 0
        for episode in episodes:
            rewards = [r['reward'] for c in episode['chunks'] for r in c['rows']]
            carry = 0.
            for j in reversed(range(len(rewards))):
                next_value = values[offset+j+1] if j+1 < len(rewards) else 0.
                carry = rewards[j]+next_value-values[offset+j]+gae_lambda*carry
                raw[offset+j] = carry
            offset += len(rewards)
    advantage = (raw-raw[active].mean())/(raw[active].std()+1e-8)
    return advantage.tolist(), {'transitions': len(rows), 'active': int(active.sum()),
                              'returnMin': float(rtg.min()), 'returnMax': float(rtg.max()),
                              'neuralValueBaselineMse': float(np.mean((rtg[active]-values[active])**2)),
                              'advantageMean': float(advantage[active].mean()), 'advantageStd': float(advantage[active].std()), 'gaeLambda': gae_lambda}


def gradient(metadata, episodes, advantages, on_chunk=None, device='cpu', estimate_fisher=False):
    torch.set_num_threads(2)
    model = DifferentiableV3(metadata['graph'], metadata['genome']['policyWeights']).to(device)
    active = sum(r['active'] for e in episodes for c in e['chunks'] for r in c['rows'])
    cursor, maximum_error, maximum_conditional_error, maximum_std_error, chunks = 0, 0., 0., 0., 0
    fisher = np.zeros((len(metadata['genome']['policyWeights']),)*2) if estimate_fisher else None
    for e in episodes:
        std = torch.tensor(e['std'], dtype=torch.float64, device=device)
        for c in e['chunks']:
            n = len(c['rows'])
            result = model(torch.tensor([r['sensors'] for r in c['rows']], dtype=torch.float64, device=device),
                           torch.tensor(c['initialActivity'], dtype=torch.float64, device=device))
            native = torch.tensor([r['mean'] for r in c['rows']], dtype=torch.float64, device=device)
            maximum_error = max(maximum_error, float((result['logits'].detach()-native).abs().max()))
            if maximum_error > 1e-10:
                raise ValueError('On-policy neuronal mean differs from native trajectory')
            action = torch.tensor([r['action'] for r in c['rows']], dtype=torch.float64, device=device)
            mask = torch.tensor([r['active'] for r in c['rows']], dtype=torch.float64, device=device)
            advantage = torch.tensor(advantages[cursor:cursor+n], dtype=torch.float64, device=device)
            if e.get('exploration'):
                features = torch.tanh(8*result['states'][:, model.readout])
                sigma = noise_scale(features, e['exploration'])
                means, scales = noise_conditional(result['logits'], sigma, action, c.get('previousPolicyState'), e['exploration']['rho'])
            else:
                means, scales = result['logits'], std
            native_conditional = torch.tensor([r.get('conditionalMean', r['mean']) for r in c['rows']], dtype=torch.float64, device=device)
            native_std = torch.tensor([r.get('conditionalStd', e['std']) for r in c['rows']], dtype=torch.float64, device=device)
            maximum_conditional_error = max(maximum_conditional_error, float((means.detach()-native_conditional).abs().max()))
            maximum_std_error = max(maximum_std_error, float((scales.detach()-native_std).abs().max()))
            if max(maximum_conditional_error, maximum_std_error) > 1e-9:
                raise ValueError('Conditional AR1 distribution differs from native sampling')
            logp = (-.5*((action-means)/scales)**2-scales.log()).sum(-1)
            if estimate_fisher:
                score_gradient = torch.autograd.grad((logp*mask).sum(), model.weights, retain_graph=True)[0].detach().cpu().numpy()
                fisher += np.outer(score_gradient, score_gradient)/active
            loss = -(logp*mask*advantage).sum()/active
            loss.backward()
            cursor += n; chunks += 1
            if on_chunk:
                on_chunk(chunks, cursor, maximum_error)
    if cursor != len(advantages):
        raise ValueError('Episode/advantage alignment failed')
    direction = -model.weights.grad.detach().cpu().numpy()
    if not np.isfinite(direction).all():
        raise ValueError('Finite recurrent gradient required')
    offset = metadata['graph']['readoutOffset']
    blocks = [('sensoryScale', 0, 28), ('sensoryBias', 28, 56), ('recurrentGain', 56, offset),
              ('motorReadoutAndBias', offset, len(direction))]
    metrics = {'chunks': chunks, 'transitions': cursor, 'maximumNativeMeanError': maximum_error, 'device': str(model.weights.device),
                       'maximumConditionalMeanError': maximum_conditional_error, 'maximumConditionalStdError': maximum_std_error,
                       'torchVersion': torch.__version__,
                       'gradientNorms': {name: float(np.linalg.norm(direction[a:b])) for name, a, b in blocks}}
    if estimate_fisher:
        metrics['chunkEmpiricalFisher'] = fisher.tolist()
    return direction, metrics


def natural_direction(metadata, direction, fisher, damping=.1):
    """Regularized empirical-chunk Fisher; not an exact TRPO/Fisher solution."""
    scales = np.asarray(metadata['scales'])
    fisher = np.asarray(fisher)
    metric = fisher*scales[:, None]*scales[None, :]
    white = np.linalg.solve((metric+metric.T)*.5+damping*np.eye(len(scales)), direction*scales)
    norm = float(np.sqrt(max(1e-24, white@metric@white)))
    result = white*scales/norm
    if not np.isfinite(result).all():
        raise ValueError('Finite natural direction required')
    return result, {'damping': damping, 'empiricalMetricNormBeforeScaling': norm, 'coefficientDirectionNorm': float(np.linalg.norm(result))}


def candidates(metadata, direction, steps=(.01, .03, .1, .3, 1.)):
    parent, scales = np.asarray(metadata['genome']['policyWeights']), np.asarray(metadata['scales'])
    rows = []
    for block in ['readout-only', 'all202']:
        g = direction.copy()
        if block == 'readout-only':
            g[:metadata['graph']['readoutOffset']] = 0
        norm = float(np.linalg.norm(g*scales))
        if norm < 1e-12:
            raise ValueError('No trainable reward direction')
        delta = g*scales**2/norm
        for step in steps:
            if not np.isfinite(step) or step <= 0 or step > 10:
                raise ValueError('Bounded positive step required')
            weights = np.clip(parent+step*delta, -8, 8)
            rows.append({'id': f'{block}:{step}', 'block': block, 'step': step,
                         'weightDeltaNorm': float(np.linalg.norm(weights-parent)), 'weights': weights.tolist()})
    return rows
