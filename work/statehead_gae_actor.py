"""GAE advantage estimator for the research-only MaleCNS state-head PPO."""
import numpy as np


def advantages_gae(episodes, gamma=0.999, gae_lambda=0.95):
    if not np.isfinite(gamma) or not 0 < gamma <= 1:
        raise ValueError('Discount gamma must be in (0, 1]')
    if not np.isfinite(gae_lambda) or not 0 <= gae_lambda <= 1:
        raise ValueError('GAE lambda must be in [0, 1]')

    rows = [row for episode in episodes for row in episode['rows']]
    features = np.asarray([row['features'] for row in rows], dtype=np.float64)
    mask = np.asarray([row['active'] for row in rows], dtype=bool)
    if not rows or not mask.any():
        raise ValueError('Actual active neuronal observations required')

    returns = []
    for episode in episodes:
        total = 0.0
        values = []
        for row in reversed(episode['rows']):
            total = row['reward'] + gamma * total
            values.append(total)
        returns.extend(reversed(values))
    returns = np.asarray(returns, dtype=np.float64)

    # The critic sees only the actual neural/PCA features, never route or pose.
    penalty = 0.001 * np.eye(features.shape[1])
    penalty[0, 0] = 0
    coefficients = np.linalg.solve(
        features[mask].T @ features[mask] / mask.sum() + penalty,
        features[mask].T @ returns[mask] / mask.sum(),
    )
    value = features @ coefficients

    raw = np.empty(len(rows), dtype=np.float64)
    cursor = 0
    for episode in episodes:
        start = cursor
        end = start + len(episode['rows'])
        trace_advantage = 0.0
        for index in range(end - 1, start - 1, -1):
            next_value = 0.0 if index == end - 1 else value[index + 1]
            delta = rows[index]['reward'] + gamma * next_value - value[index]
            trace_advantage = delta + gamma * gae_lambda * trace_advantage
            raw[index] = trace_advantage
        cursor = end

    normalized = (raw - raw[mask].mean()) / (raw[mask].std() + 1e-8)
    metrics = {
        'controls': len(rows),
        'active': int(mask.sum()),
        'gamma': gamma,
        'gaeLambda': gae_lambda,
        'valueMse': float(np.mean((returns[mask] - value[mask]) ** 2)),
        'returnMin': float(returns.min()),
        'returnMax': float(returns.max()),
        'advantageMean': float(normalized[mask].mean()),
        'advantageStd': float(normalized[mask].std()),
        'activeAdvantageP01': float(np.quantile(normalized[mask], 0.01)),
        'activeAdvantageP50': float(np.quantile(normalized[mask], 0.50)),
        'activeAdvantageP99': float(np.quantile(normalized[mask], 0.99)),
    }
    return normalized.tolist(), metrics
