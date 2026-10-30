"""Offline, seed-held-out comparison of causal critic inputs on real rollouts.

Research only: this does not train or export a controller.  Current-step
actions, route/pose/progress and outcome labels are not critic inputs.
"""
import gc
import gzip
import json
from pathlib import Path

import numpy as np
import torch

from neuronal_experiment_io import ROOT, file_hash
from statehead_gae_actor import advantages_gae
from statehead_reward_actor import StateheadActor

BASE = ROOT / '.impeccable/review/learning-ml'
OUT = BASE / 'statehead-critic-prior-history-offline-20261026-74'
SAVE = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
EXPECTED_SAVE = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
STUDIES = [
    ('run69', 'statehead-frontier-gae1-distance5-ppo-4up-20261026-69', [1, 2, 3, 4]),
    ('run70-post-promotion', 'statehead-frontier-gae1-distance5-ppo-rate2-4up-20261026-70', [2, 3, 4]),
]
GAMMA = .999
RIDGE = .001


def load_study(directory, updates):
    report_file = directory / 'report.json'
    report = json.loads(report_file.read_text(encoding='utf-8'))
    if not report.get('passed') or report.get('learningSucceeded') or report.get('approvedForApp'):
        raise RuntimeError('Expected an intact, research-only report without a promoted result')
    if report.get('originalSaveSha256', '').lower() != EXPECTED_SAVE:
        raise RuntimeError('Study save identity does not match the user-provided original')
    episodes, archive_hashes, update_hashes = [], {}, {}
    for update in updates:
        update_file = directory / f'update-{update:02}.json'
        update_hashes[update_file.name] = file_hash(update_file)
        event = json.loads(update_file.read_text(encoding='utf-8'))
        if event.get('update') != update or len(event.get('episodeSummaries', [])) != 8:
            raise RuntimeError('Expected eight recorded episodes per update')
        for summary in event['episodeSummaries']:
            name = summary['privateArchiveFile']
            archive = directory / name
            digest = file_hash(archive)
            if digest.lower() != summary['privateArchiveSha256'].lower():
                raise RuntimeError(f'Archive hash mismatch: {name}')
            with gzip.open(archive, 'rt', encoding='utf-8') as stream:
                episode = json.load(stream)
            if (episode['seed'] != summary['seed'] or episode['sign'] != summary['sign']
                    or episode['traceSha256'] != summary['traceSha256']
                    or episode['result'] != summary['result']
                    or not episode['fullFromLine'] or episode['gateFloor'] != 0
                    or episode['controls'] != len(episode['rows'])):
                raise RuntimeError(f'Archive does not match its update manifest: {name}')
            # The 516-value neuronal vectors are not used by this diagnostic.
            # Removing them only from memory keeps the original archives intact.
            for row in episode['rows']:
                row.pop('neuralInputVector', None)
            episodes.append(episode)
            archive_hashes[name] = digest
    signatures = {json.dumps([e['behaviorWeights'], e['exploration']], sort_keys=True)
                  for e in episodes}
    if len(signatures) != 1:
        raise RuntimeError('A study may contain only one unchanged behavior policy')
    by_seed = {}
    for e in episodes:
        by_seed.setdefault(e['seed'], []).append(e['sign'])
    if any(sorted(signs) != [-1, 1] for signs in by_seed.values()):
        raise RuntimeError('Every held-out group must contain exactly both exploration signs')
    return report, episodes, archive_hashes, update_hashes


def arrays(episodes):
    x_base, x_rich, returns, mask, groups, last30, reasons = [], [], [], [], [], [], []
    for episode in episodes:
        rows = episode['rows']
        episode_returns = [0.] * len(rows)
        total = 0.
        for i in range(len(rows) - 1, -1, -1):
            total = float(rows[i]['reward']) + GAMMA * total
            episode_returns[i] = total
        previous = None
        for i, row in enumerate(rows):
            active = bool(row['active'])
            feature = [float(v) for v in row['features']]
            prior = [float(v) for v in row['prior']]
            if len(feature) != 9 or len(prior) != 3 or abs(feature[0] - 1.) > 1e-12:
                raise RuntimeError('Unexpected archived neuronal feature or parent command layout')
            have_previous = active and previous is not None
            if have_previous:
                innovation = [(float(previous['action'][j]) - float(previous['mean'][j]))
                              / float(previous['sigma'][j]) for j in range(2)]
            else:
                innovation = [0., 0.]
            # Each added value is available before the current random action.
            # Previous innovation follows the AR(1) sampler's active/reset rule.
            extra = [prior[0], prior[1] - prior[2], float(row['gate']),
                     *innovation, float(have_previous)]
            x_base.append(feature)
            x_rich.append(feature + extra)
            returns.append(episode_returns[i])
            mask.append(active)
            groups.append(episode['seed'])
            last30.append(i >= len(rows) - 30)
            reasons.append(episode['result']['reason'])
            previous = row if active else None
    result = tuple(np.asarray(v) for v in (x_base, x_rich, returns, mask, groups, last30, reasons))
    if not all(np.isfinite(a).all() for a in result[:3]):
        raise RuntimeError('Non-finite feature or return')
    return result


def ridge_fit(x, y):
    penalty = RIDGE * np.eye(x.shape[1])
    penalty[0, 0] = 0.
    return np.linalg.solve(x.T @ x / len(x) + penalty, x.T @ y / len(x))


def crossfit(x, y, active, seeds):
    prediction = np.full(len(y), np.nan)
    for seed in np.unique(seeds):
        train, held = active & (seeds != seed), active & (seeds == seed)
        if not train.any() or not held.any():
            raise RuntimeError('Empty training or held-out fold')
        prediction[held] = x[held] @ ridge_fit(x[train], y[train])
    if not np.isfinite(prediction[active]).all():
        raise RuntimeError('Missing held-out prediction')
    return prediction


def metrics(y, prediction, active, subset):
    selected = active & subset
    if not selected.any():
        return None
    error = y[selected] - prediction[selected]
    sse = float(error @ error)
    centered = y[selected] - float(y[selected].mean())
    denom = float(centered @ centered)
    return {'controls': int(selected.sum()), 'mse': sse / int(selected.sum()),
            'r2': 1. - sse / denom if denom > 0 else None}


def normalized_advantage(y, prediction, active):
    residual = y - np.where(active, prediction, 0.)
    return (residual - residual[active].mean()) / (residual[active].std() + 1e-8)


def policy_gradient(meta, episodes, advantage):
    actor = StateheadActor(meta, episodes, episodes[0]['behaviorWeights'],
                           episodes[0]['exploration'], device='cpu')
    value, kl = actor.objective(advantage.tolist())
    value.backward()
    grad = torch.cat([actor.motor.grad, actor.variance.grad]).detach().numpy().copy()
    if abs(float(kl.detach())) > 1e-10 or not np.isfinite(grad).all():
        raise RuntimeError('Behavior policy identity or gradient check failed')
    return grad


def cosine(a, b):
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(a @ b / denominator) if denominator else None


def analyze(name, folder, updates):
    directory = BASE / folder
    report, episodes, archives, update_hashes = load_study(directory, updates)
    x0, x1, y, active, seeds, last30, reasons = arrays(episodes)
    full = x0 @ ridge_fit(x0[active], y[active])
    historical, _ = advantages_gae(episodes, gamma=GAMMA, gae_lambda=1.)
    historical = np.asarray(historical)
    algebraic = normalized_advantage(y, full, active)
    difference = float(np.max(np.abs(historical[active] - algebraic[active])))
    if difference > 1e-8:
        raise RuntimeError('Lambda=1 Monte Carlo residual does not match the archived GAE implementation')
    p0, p1 = crossfit(x0, y, active, seeds), crossfit(x1, y, active, seeds)
    meta = json.loads((directory / 'metadata.private.json').read_text(encoding='utf-8'))
    g_full = policy_gradient(meta, episodes, historical)
    g0 = policy_gradient(meta, episodes, normalized_advantage(y, p0, active))
    g1 = policy_gradient(meta, episodes, normalized_advantage(y, p1, active))
    subsets = {'all': np.ones(len(y), dtype=bool), 'last30': last30}
    for reason in sorted(set(reasons)):
        subsets['reason:' + str(reason)] = reasons == reason
    comparison = {key: {'neural9': metrics(y, p0, active, subset),
                        'causal15': metrics(y, p1, active, subset)}
                  for key, subset in subsets.items()}
    output = {
        'name': name, 'sourceReport': str((directory / 'report.json').relative_to(ROOT)),
        'sourceReportSha256': file_hash(directory / 'report.json'),
        'updates': updates, 'episodes': len(episodes), 'seedGroups': len(np.unique(seeds)),
        'controls': len(y), 'activeControls': int(active.sum()),
        'episodeReasons': {str(r): sum(e['result']['reason'] == r for e in episodes)
                           for r in sorted(set(reasons))},
        'archiveSha256': archives, 'updateSha256': update_hashes,
        'comparison': comparison, 'lambdaOneMaxAdvantageDifference': difference,
        'gradient': {'historicalFullFitNorm': float(np.linalg.norm(g_full)),
                     'neural9CrossfitNorm': float(np.linalg.norm(g0)),
                     'causal15CrossfitNorm': float(np.linalg.norm(g1)),
                     'cosineHistoricalVsNeural9Crossfit': cosine(g_full, g0),
                     'cosineNeural9VsCausal15Crossfit': cosine(g0, g1)},
    }
    print('CRITIC_DIAGNOSTIC ' + json.dumps({'name': name, 'episodes': len(episodes),
          'comparison': comparison['all'], 'last30': comparison['last30'],
          'gradient': output['gradient']}, ensure_ascii=False), flush=True)
    del episodes, x0, x1, y, active, seeds, last30, reasons, p0, p1
    gc.collect()
    return output


def main():
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original user save hash changed before analysis')
    if OUT.exists():
        raise RuntimeError('Preserve the existing diagnostic directory')
    torch.set_num_threads(2)
    results = [analyze(*study) for study in STUDIES]
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original user save hash changed during analysis')
    output = {
        'format': 'statehead-causal-critic-seed-heldout-diagnostic-v1',
        'completed': True, 'learningSucceeded': False, 'approvedForApp': False,
        'method': 'Actual archived from-line rollouts; leave both signs of each seed out together. Ridge 0.001 with unpenalized intercept; gamma 0.999; lambda 1.0. Critic inputs are only pre-action real neuronal features, parent motor commands, gate and previous active exploration innovation.',
        'additionalFeatures': ['parentSteer', 'parentThrottleMinusBrake', 'neuralGate',
                               'previousInnovationSteer', 'previousInnovationLongitudinal', 'previousActive'],
        'sourceSha256': {'analysis': file_hash(Path(__file__)),
                         'gae': file_hash(ROOT / 'work/statehead_gae_actor.py'),
                         'actor': file_hash(ROOT / 'work/statehead_reward_actor.py')},
        'originalSaveSha256': file_hash(SAVE), 'datasets': results,
        'boundary': 'Offline prediction and gradient diagnostics only. A lower held-out error or different gradient does not establish improved physical driving, safety, full laps, other seeds/circuits/models, or an app-ready policy.',
    }
    OUT.mkdir(parents=True, exist_ok=False)
    destination = OUT / 'report.json'
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('CRITIC_REPORT ' + json.dumps({'file': str(destination), 'sha256': file_hash(destination)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
