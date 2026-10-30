"""Numerically reconcile saved actual PPO batches; not a new physics replay."""
import argparse
import json
import math
import numpy as np
import torch
from torch import nn
from neuronal_experiment_io import ROOT, NODE, atomic_json, file_hash
from train_neural_ppo_brake_exploration import BASE, log_prob, advantages, KEYS, clean_better
from neural_ppo_wide_network import DIM, COUNT, make_actor, export_weights, clamp_actor
from neural_ppo_parallel import separate_advantages, COUNT as ENV_COUNT, STEPS, SEEDS

def verify(tag):
    if not tag.replace('-', '').isalnum():
        raise ValueError('Bounded local study name required')
    out = BASE/tag
    report = json.loads((out/'report.json').read_text(encoding='utf-8'))
    identity = report['identity']
    assert report['passed'] and report['phase'] == 'finished' and report['promoted'] is False
    assert file_hash(NODE) == identity['nodeExecutableSha256']
    for file, sha in {**identity['sourceHashes'], **identity['completeInferenceSourceClosure']}.items():
        assert file_hash(ROOT/file) == sha, file
    assert file_hash(identity['originFile']) == identity['originSha256']
    assert file_hash(identity['preparedFile']) == identity['preparedSha256']
    assert file_hash(identity['normalizationFile']) == identity['normalizationSha256']
    normalization = json.loads(open(identity['normalizationFile'], encoding='utf-8').read())
    assert normalization['sourceModelSha256'] == identity['originSha256']
    metadata = json.loads((out/'metadata.json').read_text(encoding='utf-8'))
    assert report['cuda']['stats']['gpuCalls'] > 0 and report['cuda']['stats']['cpuFallbacks'] == 0
    cuda_identity = report['cuda']['identity']
    assert cuda_identity == metadata['cuda']['identity']
    for file, sha in cuda_identity['sources'].items():
        assert file_hash(ROOT/file) == sha, file
    assert file_hash(cuda_identity['driverPath']) == cuda_identity['driverSha256']
    assert file_hash(ROOT/'.impeccable/review/neural-sacl/cuda-v3-kernel-prepared-r2/manifest.json') == cuda_identity['manifestSha256']
    assert metadata['normalizationSha256'] == identity['normalizationSha256']
    assert metadata['normalizationRevision'] == identity['normalizationRevision']
    origin = json.loads(json.loads(open(identity['originFile'], encoding='utf-8').read())['payloadJson'])
    preflight = json.loads((out/'preflight.json').read_text(encoding='utf-8'))
    assert preflight['passed']
    assert identity['environmentSeeds'] == SEEDS and identity['environmentCount'] == ENV_COUNT
    assert identity['stepsPerRollout'] == ENV_COUNT*STEPS and identity['minibatchSize'] == 256
    assert len(metadata['parallelEnvironments']) == ENV_COUNT
    assert len({e['physicalPid'] for e in metadata['parallelEnvironments']}) == ENV_COUNT
    assert [e['seed'] for e in metadata['parallelEnvironments']] == SEEDS
    assert len(report['cudaByEnvironment']) == ENV_COUNT
    for index, c in enumerate(report['cudaByEnvironment']):
        assert c['stats']['gpuCalls'] > 0 and c['stats']['cpuFallbacks'] == 0
        assert c['identity'] == metadata['parallelEnvironments'][index]['metadata']['cuda']['identity']
    assert len(preflight['independentPractices']) == ENV_COUNT
    for e in [preflight['full'], *preflight['independentPractices']]:
        assert e['complete'] and not e['censored'] and not e['overlap']
        assert all(e['result'][k] == origin['expectedResult'][k] for k in KEYS)
        assert e['actionTraceSha256'] == origin['fullTraceSha256']
    torch.set_num_threads(1)
    torch.manual_seed(161026)
    actor = make_actor()
    initial = export_weights(actor)
    assert json.loads((out/'initial-policy.json').read_text(encoding='utf-8'))['weights'] == initial
    critic = nn.Sequential(nn.Linear(DIM, 64), nn.Tanh(), nn.Linear(64, 64), nn.Tanh(), nn.Linear(64, 1)).double()
    log_std = nn.Parameter(torch.tensor([math.log(.12), math.log(.3)], dtype=torch.float64))
    assert identity['initialStd'] == log_std.exp().detach().tolist()
    optim = torch.optim.Adam([*actor.parameters(), *critic.parameters(), log_std], lr=3e-4)
    all_episodes = []
    best = best_weights = None
    hashes = {}
    for update, event in enumerate(report['events'], 1):
        file = out/f'rollout-{update:03}.json'
        hashes[file.name] = file_hash(file)
        batch = json.loads(file.read_text(encoding='utf-8'))
        assert len(batch['environments']) == ENV_COUNT
        for index, segment in enumerate(batch['environments']):
            assert segment['index'] == index and segment['seed'] == SEEDS[index]
            assert len(segment['rows']) == STEPS
            assert sum(row['done'] for row in segment['rows']) == len(segment['episodes'])
        assert batch['rows'] == [row for segment in batch['environments'] for row in segment['rows']]
        assert batch['episodes'] == [row for segment in batch['environments'] for row in segment['episodes']]
        rows = batch['rows']
        for row in rows:
            assert isinstance(row['done'], bool)
            if row['done']:
                assert row['terminalLaps'] in [0, 1, 2]
                expected = min(row['rawReward'], -40) if row['terminalLaps'] < 2 else row['rawReward']
            else:
                assert row['terminalLaps'] is None
                expected = row['rawReward']
            assert row['reward'] == expected
            assert row['auxiliaryPenalty'] == row['rawReward']-expected and row['auxiliaryPenalty'] >= 0
        assert len(rows) == ENV_COUNT*STEPS and event['actualTransitions'] == update*ENV_COUNT*STEPS and event['update'] == update
        all_episodes.extend(batch['episodes'])
        assert event['completedPracticeEpisodes'] == len(all_episodes)
        assert sum(r['done'] for r in rows) == len(batch['episodes'])
        tensor = lambda key: torch.tensor([r[key] for r in rows], dtype=torch.float64)
        x, action, mean = tensor('x'), tensor('action'), tensor('mean')
        rewards, dones, next_x = tensor('reward'), tensor('done'), tensor('next')
        assert x.shape == (ENV_COUNT*STEPS, DIM) and x.abs().max() <= 1 and torch.isfinite(rewards).all()
        assert torch.isfinite(action).all() and torch.isfinite(mean).all()
        with torch.no_grad():
            error = (actor(x)-mean).abs().max().item()
            assert error == event['nodeTorchMaxMeanError'] and error < 1e-12
            old_logp = log_prob(action, mean, log_std).clone()
            values, next_values = critic(x).squeeze(-1), critic(next_x).squeeze(-1)
            adv = separate_advantages(rewards, dones, values, next_values)
            returns = adv+values
            adv = (adv-adv.mean())/(adv.std(unbiased=False)+1e-8)
        losses, kls = [], []
        for epoch in range(4):
            for ids in torch.randperm(len(rows)).split(256):
                new_logp = log_prob(action[ids], actor(x[ids]), log_std)
                ratio = (new_logp-old_logp[ids]).exp()
                pl = -torch.minimum(ratio*adv[ids], ratio.clamp(.8, 1.2)*adv[ids]).mean()
                vl = .5*(critic(x[ids]).squeeze(-1)-returns[ids]).square().mean()
                entropy = (log_std+.5*math.log(2*math.pi*math.e)).sum()
                loss = pl+.5*vl-.0005*entropy
                optim.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_([*actor.parameters(), *critic.parameters(), log_std], .5)
                optim.step()
                with torch.no_grad():
                    clamp_actor(actor)
                    log_std.clamp_(math.log(.001), math.log(1))
                losses.append(loss.item())
            with torch.no_grad():
                lr = log_prob(action, actor(x), log_std)-old_logp
                kl = ((lr.exp()-1)-lr).mean().item()
                kls.append(kl)
            if kl > .03:
                break
        weights = export_weights(actor)
        assert event['loss'] == float(np.mean(losses)) and event['epochKL'] == kls
        assert event['std'] == log_std.detach().exp().tolist()
        assert event['changedActorParameters'] == sum(a != b for a, b in zip(weights, initial))
        if 'practiceEvaluation' in event and clean_better(event['practiceEvaluation'], best['result'] if best else origin['expectedResult']):
            best, best_weights = event['practiceEvaluation'], weights[:]
    assert len(report['events']) == identity['updatesRequested']
    assert report['actualTransitions'] == len(report['events'])*ENV_COUNT*STEPS
    assert report['completedPracticeEpisodes'] == all_episodes
    assert report['bestPractice'] == best and report['bestWeights'] == best_weights
    latest = json.loads((out/'latest-policy.json').read_text(encoding='utf-8'))
    assert latest['weights'] == weights and latest['logStd'] == log_std.detach().tolist()
    assert latest['status'] == 'research-unverified' and latest['identity'] == identity
    eligible = bool(best and len(report['fullProofs']) == 2
        and all(clean_better(e, origin['expectedResult']) for e in report['fullProofs'])
        and report['fullProofs'][0]['actionTraceSha256'] == report['fullProofs'][1]['actionTraceSha256'] == best['actionTraceSha256'])
    assert report['eligibleForIndependentNativeProof'] == eligible
    proof = {'passed': True, 'reportSha256': file_hash(out/'report.json'), 'rolloutHashes': hashes,
             'actualTransitions': report['actualTransitions'], 'updates': len(report['events']),
             'eligibleForIndependentNativeProof': eligible, 'promoted': False,
             'checks': ['exact source/runtime/origin identities', 'zero full/practice original trace',
                        'every actual batch used once on-policy before PPO epochs',
                        'all losses KL statistics exploration scales and final actor weights reproduced',
                        'four independent seeds, actual process IDs, segmented GAE and all CUDA counters reconciled',
                        'actual terminal episodes reconciled without counting evaluation interruptions'],
             'boundary': 'Numerical reconciliation of saved actual transitions, not another physical replay or independent native policy export proof. No app deployment.'}
    atomic_json(out/'verification.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'rolloutHashes'}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('tag')
    verify(parser.parse_args().tag)
