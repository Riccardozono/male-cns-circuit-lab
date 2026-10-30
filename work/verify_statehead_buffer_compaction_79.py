"""Check that removing archived neural-vector duplicates changes no PPO math."""
import gzip
import json
from pathlib import Path

import numpy as np
import torch

from analyze_statehead_critic_prior_history_74 import BASE, EXPECTED_SAVE, ROOT, SAVE, file_hash
from statehead_causal_gae_actor_76 import advantages_causal
from statehead_reward_actor import StateheadActor

RUN = BASE / 'statehead-frontier-causalcritic-gae1-distance5-ppo-4up-20261026-76'
OUT = BASE / 'statehead-buffer-compaction-verification-20261026-79'


def score_and_gradient(metadata, episodes, advantages):
    actor = StateheadActor(metadata, episodes, episodes[0]['behaviorWeights'],
                           episodes[0]['exploration'], device='cpu')
    score, kl = actor.objective(advantages)
    score.backward()
    return float(score.detach()), float(kl.detach()), torch.cat(
        [actor.motor.grad, actor.variance.grad]).detach().numpy().copy()


def main():
    if OUT.exists() or file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Existing output or original save identity prevents verification')
    update = json.loads((RUN / 'update-01.json').read_text(encoding='utf-8'))
    metadata = json.loads((RUN / 'metadata.private.json').read_text(encoding='utf-8'))
    episodes, archive_hashes = [], {}
    for summary in update['episodeSummaries']:
        path = RUN / summary['privateArchiveFile']
        digest = file_hash(path)
        if digest != summary['privateArchiveSha256']:
            raise RuntimeError('Archived trajectory hash mismatch')
        with gzip.open(path, 'rt', encoding='utf-8') as stream:
            episodes.append(json.load(stream))
        archive_hashes[path.name] = digest
    if len(episodes) != 8:
        raise RuntimeError('Eight actual paired episodes are required')
    before, before_metrics = advantages_causal(episodes, gamma=.999, gae_lambda=1.)
    score_before, kl_before, gradient_before = score_and_gradient(metadata, episodes, before)
    removed = 0
    for episode in episodes:
        for row in episode['rows']:
            vector = row.pop('neuralInputVector', None)
            if not isinstance(vector, list) or len(vector) != 516:
                raise RuntimeError('The full actual neuronal vector must already be archived')
            removed += 1
    after, after_metrics = advantages_causal(episodes, gamma=.999, gae_lambda=1.)
    score_after, kl_after, gradient_after = score_and_gradient(metadata, episodes, after)
    if (not np.array_equal(np.asarray(before), np.asarray(after)) or before_metrics != after_metrics
            or score_before != score_after or kl_before != kl_after
            or not np.array_equal(gradient_before, gradient_after)):
        raise RuntimeError('Compaction changed a PPO input, advantage, score, KL or gradient')
    if any(file_hash(RUN / name) != digest for name, digest in archive_hashes.items()):
        raise RuntimeError('An archived trajectory changed during verification')
    if file_hash(SAVE).lower() != EXPECTED_SAVE:
        raise RuntimeError('Original save changed during verification')
    result = {
        'format': 'statehead-buffer-compaction-verification-v1', 'passed': True,
        'episodes': len(episodes), 'archivedVectorsRemovedFromMemory': removed,
        'advantageBitIdentical': True, 'metricsIdentical': True,
        'objectiveIdentical': True, 'klIdentical': True, 'gradientBitIdentical': True,
        'archiveSha256': archive_hashes, 'sourceHashes': {
            'verifier': file_hash(Path(__file__)),
            'critic': file_hash(ROOT / 'work/statehead_causal_gae_actor_76.py'),
            'actor': file_hash(ROOT / 'work/statehead_reward_actor.py'),
            'analysis': file_hash(ROOT / 'work/analyze_statehead_critic_prior_history_74.py')},
        'originalSaveSha256': file_hash(SAVE),
        'boundary': 'Eight real archived episodes. Proves only that dropping duplicate neuronal vectors from the Python buffer after archival preserves the tested PPO math. It does not prove physical learning or app performance.',
    }
    OUT.mkdir(parents=True, exist_ok=False)
    path = OUT / 'report.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('BUFFER_VERIFICATION ' + json.dumps({'file': str(path), 'sha256': file_hash(path),
          'episodes': len(episodes), 'archivedVectorsRemovedFromMemory': removed,
          'advantageBitIdentical': True, 'gradientBitIdentical': True}), flush=True)


if __name__ == '__main__':
    torch.set_num_threads(2)
    main()
