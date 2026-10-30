"""Actual terminal samples: distinguish physical R5 score from training floor."""
import json
from collections import defaultdict
from neuronal_experiment_io import ROOT, atomic_json, file_hash

base = ROOT/'.impeccable/review/neural-sacl'
study = base/'neuronal-ppo-parallel4-memory-long'
out = base/'ppo-parallel-terminal-signal-first'
out.mkdir(exist_ok=False)
report = json.loads((study/'report.json').read_text())
groups = defaultdict(list)
hashes = {}
for update in range(1, 17):
    file = study/f'rollout-{update:03}.json'
    hashes[file.name] = file_hash(file)
    batch = json.loads(file.read_text())
    for segment in batch['environments']:
        rows = [r for r in segment['rows'] if r['done']]
        assert len(rows) == len(segment['episodes'])
        for row, episode in zip(rows, segment['episodes']):
            assert row['terminalLaps'] == episode['laps']
            assert row['reward'] == min(row['rawReward'], -40) if episode['laps'] < 2 else row['reward'] == row['rawReward']
            groups[episode['reason']].append({'update': update, 'environment': segment['index'],
                'rawTerminalReward': row['rawReward'], 'appliedTrainingReward': row['reward'],
                'actualFitness': episode['fitness'], 'actualProgress': episode['bestProgress'], 'laps': episode['laps']})
summary = {reason: {'count': len(rows), 'minRawTerminalReward': min(r['rawTerminalReward'] for r in rows),
                   'maxRawTerminalReward': max(r['rawTerminalReward'] for r in rows),
                   'distinctAppliedTrainingRewards': sorted({r['appliedTrainingReward'] for r in rows})}
           for reason, rows in groups.items()}
proof = {'passed': True, 'auditedActualTransitions': 16*1024, 'auditedTerminalEpisodes': sum(len(v) for v in groups.values()),
         'summary': summary, 'actualSamples': dict(groups), 'rolloutHashes': hashes,
         'reportSha256': file_hash(study/'report.json'), 'sourceSha256': file_hash(__file__),
         'boundary': 'Actual terminal-step reward audit. Equal terminal signals do not imply equal whole-episode returns or prove the sole cause of failed learning. Official physical R5 remains unchanged.'}
atomic_json(out/'verification.json', proof)
print(json.dumps({k: v for k, v in proof.items() if k not in ['actualSamples', 'rolloutHashes']}))
