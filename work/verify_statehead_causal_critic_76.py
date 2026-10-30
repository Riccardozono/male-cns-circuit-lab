"""Verify the private causal critic against the archived-rollout diagnostic."""
import json
from pathlib import Path

import numpy as np

from analyze_statehead_critic_prior_history_74 import (
    BASE, EXPECTED_SAVE, ROOT, SAVE, arrays, crossfit, file_hash, load_study,
    normalized_advantage,
)
from statehead_causal_gae_actor_76 import advantages_causal, observations_and_returns

OUT = BASE / 'statehead-causalcritic-verification-20261026-76'
REPORT75 = BASE / 'statehead-critic-batch-size-offline-20261026-75/report.json'
STUDIES = [
    ('run69-8episodes', 'statehead-frontier-gae1-distance5-ppo-4up-20261026-69', [1]),
    ('run70-8episodes', 'statehead-frontier-gae1-distance5-ppo-rate2-4up-20261026-70', [2]),
]


def main():
    if OUT.exists() or file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Existing output or original save identity prevents verification')
    reference = json.loads(REPORT75.read_text(encoding='utf-8'))
    checked = []
    for label, folder, updates in STUDIES:
        _, episodes, _, _ = load_study(BASE / folder, updates)
        expected = next(d for d in reference['datasets'] if d['name'] == label)
        x0, x1, y, active, seeds, _, _ = arrays(episodes)
        prediction = crossfit(x1, y, active, seeds)
        expected_adv = normalized_advantage(y, prediction, active)
        actual, metrics = advantages_causal(episodes, gamma=.999, gae_lambda=1.)
        actual = np.asarray(actual)
        delta = float(np.max(np.abs(expected_adv[active] - actual[active])))
        expected_mse = expected['comparison']['all']['causal15']['mse']
        expected_r2 = expected['comparison']['all']['causal15']['r2']
        if (delta > 1e-10 or abs(metrics['valueMse'] - expected_mse) > 1e-8
                or abs(metrics['valueR2'] - expected_r2) > 1e-10):
            raise RuntimeError('Training critic does not match the independent held-out diagnostic')
        # Modifying an action in memory must affect only future critic history,
        # never the observation for the same action or the recorded return.
        episode = episodes[0]
        i = next(i for i in range(len(episode['rows']) - 1)
                 if episode['rows'][i]['active'] and episode['rows'][i + 1]['active'])
        before, before_y, _, _ = observations_and_returns([episode], .999)
        row = episode['rows'][i]
        original = row['action'][0]
        try:
            row['action'][0] = original + .5 * row['sigma'][0]
            after, after_y, _, _ = observations_and_returns([episode], .999)
        finally:
            row['action'][0] = original
        if (not np.array_equal(before[i], after[i]) or np.array_equal(before[i + 1], after[i + 1])
                or not np.array_equal(before_y, after_y)):
            raise RuntimeError('The critic is not strictly causal across consecutive actions')
        try:
            advantages_causal(episodes, gamma=.999, gae_lambda=.95)
        except ValueError:
            pass
        else:
            raise RuntimeError('Unsupported lambda must be rejected')
        checked.append({'dataset': label, 'episodes': len(episodes), 'seedGroups': metrics['heldOutSeedGroups'],
                        'activeControls': metrics['active'], 'maxAdvantageDifference': delta,
                        'heldOutMse': metrics['valueMse'], 'heldOutR2': metrics['valueR2'],
                        'currentActionExcluded': True, 'pastActionVisibleAtNextControl': True})
        print('CAUSAL_CRITIC_CHECK ' + json.dumps(checked[-1]), flush=True)
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original save changed during verification')
    result = {
        'format': 'statehead-causalcritic-verification-v1', 'passed': True,
        'checks': checked, 'sourceHashes': {
            'verifier': file_hash(Path(__file__)),
            'critic': file_hash(ROOT / 'work/statehead_causal_gae_actor_76.py'),
            'offlineAnalysis': file_hash(ROOT / 'work/analyze_statehead_critic_prior_history_74.py'),
            'offlineReport75': file_hash(REPORT75)},
        'originalSaveSha256': file_hash(SAVE),
        'boundary': 'Numerical parity and causal-input checks on actual archived trajectories only. No physical learning or app compatibility is demonstrated.',
    }
    OUT.mkdir(parents=True, exist_ok=False)
    path = OUT / 'report.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('CAUSAL_CRITIC_VERIFICATION ' + json.dumps({'file': str(path), 'sha256': file_hash(path)}), flush=True)


if __name__ == '__main__':
    main()
