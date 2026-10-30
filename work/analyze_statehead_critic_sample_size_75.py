"""Check the causal critic on the smaller batches used early in PPO."""
import json
from pathlib import Path

import torch

from analyze_statehead_critic_prior_history_74 import (
    BASE, EXPECTED_SAVE, ROOT, SAVE, analyze, file_hash,
)

OUT = BASE / 'statehead-critic-batch-size-offline-20261026-75'
STUDIES = [
    ('run69-8episodes', 'statehead-frontier-gae1-distance5-ppo-4up-20261026-69', [1]),
    ('run69-16episodes', 'statehead-frontier-gae1-distance5-ppo-4up-20261026-69', [1, 2]),
    ('run69-24episodes', 'statehead-frontier-gae1-distance5-ppo-4up-20261026-69', [1, 2, 3]),
    ('run70-8episodes', 'statehead-frontier-gae1-distance5-ppo-rate2-4up-20261026-70', [2]),
    ('run70-16episodes', 'statehead-frontier-gae1-distance5-ppo-rate2-4up-20261026-70', [2, 3]),
]


def main():
    if OUT.exists() or file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Existing output or original-save identity prevents the analysis')
    torch.set_num_threads(2)
    results = [analyze(*study) for study in STUDIES]
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original save changed during the analysis')
    result = {
        'format': 'statehead-causal-critic-batch-size-diagnostic-v1',
        'completed': True, 'learningSucceeded': False, 'approvedForApp': False,
        'method': 'Nested batches of actual same-policy episodes; leave each paired seed out. Same ridge, gamma, causal inputs and gradient checks as diagnostic 74.',
        'sourceSha256': {'analysis': file_hash(Path(__file__)),
                         'diagnostic74': file_hash(ROOT / 'work/analyze_statehead_critic_prior_history_74.py')},
        'originalSaveSha256': file_hash(SAVE), 'datasets': results,
        'boundary': 'Prediction and gradients on archived trajectories only; no training update, physical improvement, causal effect, app export, or generalization to other policies, circuits or models is established.',
    }
    OUT.mkdir(parents=True, exist_ok=False)
    report = OUT / 'report.json'
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('BATCH_REPORT ' + json.dumps({'file': str(report), 'sha256': file_hash(report)}), flush=True)


if __name__ == '__main__':
    main()
