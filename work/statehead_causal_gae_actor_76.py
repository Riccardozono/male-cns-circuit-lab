"""Cross-fitted Monte Carlo critic for the private state-head PPO study.

Only information known before the current action is added to the critic.
The actor, vehicle physics, native reward and action sampling remain unchanged.
"""
import json

import numpy as np


def observations_and_returns(episodes, gamma):
    rows, observations, returns, masks, seeds = [], [], [], [], []
    for episode in episodes:
        trajectory = episode['rows']
        episode_returns = [0.] * len(trajectory)
        total = 0.
        for index in range(len(trajectory) - 1, -1, -1):
            total = float(trajectory[index]['reward']) + gamma * total
            episode_returns[index] = total
        previous = None
        for index, row in enumerate(trajectory):
            active = bool(row['active'])
            features = [float(value) for value in row['features']]
            prior = [float(value) for value in row['prior']]
            if len(features) != 9 or len(prior) != 3 or abs(features[0] - 1.) > 1e-12:
                raise ValueError('Nine neuronal features and three actual parent commands required')
            has_previous = active and previous is not None
            if has_previous:
                sigma = [float(value) for value in previous['sigma']]
                if len(sigma) != 2 or any(value <= 0 for value in sigma):
                    raise ValueError('Positive previous active exploration scales required')
                innovation = [(float(previous['action'][j]) - float(previous['mean'][j]))
                              / sigma[j] for j in range(2)]
            else:
                innovation = [0., 0.]
            observations.append(features + [prior[0], prior[1] - prior[2],
                float(row['gate']), *innovation, float(has_previous)])
            returns.append(episode_returns[index])
            masks.append(active)
            seeds.append(episode['seed'])
            rows.append(row)
            previous = row if active else None
    if not rows:
        raise ValueError('Real, nonempty on-policy episodes are required')
    x = np.asarray(observations, dtype=np.float64)
    y = np.asarray(returns, dtype=np.float64)
    active = np.asarray(masks, dtype=bool)
    groups = np.asarray(seeds)
    if not active.any() or not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError('Finite active neuronal observations and rewards are required')
    return x, y, active, groups


def advantages_causal(episodes, gamma=.999, gae_lambda=1.):
    if not np.isfinite(gamma) or not 0 < gamma <= 1 or gae_lambda != 1.:
        raise ValueError('This diagnostic critic requires gamma in (0,1] and lambda exactly 1')
    if len({json.dumps([e['behaviorWeights'], e['exploration']], sort_keys=True)
            for e in episodes}) != 1:
        raise ValueError('All episodes must share the current behavior policy')
    pairs = {}
    for episode in episodes:
        pairs.setdefault(episode['seed'], []).append(episode['sign'])
    if len(pairs) < 2 or any(sorted(signs) != [-1, 1] for signs in pairs.values()):
        raise ValueError('At least two complete paired seed groups are required')
    x, y, active, groups = observations_and_returns(episodes, gamma)
    prediction = np.empty(len(y), dtype=np.float64)
    regularizer = .001 * np.eye(x.shape[1])
    regularizer[0, 0] = 0.
    for seed in pairs:
        train = active & (groups != seed)
        held = groups == seed
        coefficients = np.linalg.solve(x[train].T @ x[train] / train.sum() + regularizer,
                                       x[train].T @ y[train] / train.sum())
        prediction[held] = x[held] @ coefficients
    raw = y - prediction
    normalized = (raw - raw[active].mean()) / (raw[active].std() + 1e-8)
    mse = float(np.mean(raw[active] ** 2))
    variance = float(np.mean((y[active] - y[active].mean()) ** 2))
    metrics = {
        'controls': len(y), 'active': int(active.sum()), 'gamma': gamma,
        'gaeLambda': gae_lambda, 'critic': 'causal15-leave-paired-seed-out',
        'criticInputs': 15, 'heldOutSeedGroups': len(pairs), 'valueMse': mse,
        'valueR2': 1. - mse / variance if variance > 0 else None,
        'returnMin': float(y.min()), 'returnMax': float(y.max()),
        'advantageMean': float(normalized[active].mean()),
        'advantageStd': float(normalized[active].std()),
        'activeAdvantageP01': float(np.quantile(normalized[active], .01)),
        'activeAdvantageP50': float(np.quantile(normalized[active], .50)),
        'activeAdvantageP99': float(np.quantile(normalized[active], .99)),
    }
    return normalized.tolist(), metrics
