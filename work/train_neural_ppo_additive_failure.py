"""Separate on-policy experiment using actual Node physics and neuronal inputs.

Clipped PPO objective: https://arxiv.org/abs/1707.06347
This is a project-specific residual-policy experiment, not a paper reproduction.
No precomputed driving labels or fabricated transitions enter its updates.
"""
import argparse
import json
import math
import subprocess
import time
from pathlib import Path
import numpy as np
import torch
from torch import nn
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from neural_ppo_wide_network import DIM, COUNT, make_actor, export_weights, clamp_actor
from neural_ppo_parallel import Environments, separate_advantages, COUNT as ENV_COUNT, STEPS, SEEDS

BASE = ROOT/'.impeccable/review/neural-sacl'
SOURCE = BASE/'neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'
PREPARED = BASE/'neuronal-clean-6584-statehead-early1024-prepared/prepared.json'
NORMALIZATION = BASE/'neuronal-normalization-520-prepared/normalization.json'
KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds', 'lapTimes']

def clean_better(e, prior):
    r = e['result']
    return (e['complete'] and not e['censored'] and not e['overlap']
            and not any(s in r['reason'] for s in ['urto', 'fuori pista', 'progresso non valido'])
            and r['fitness'] > prior['fitness']+1e-6
            and r['bestProgress'] >= prior['bestProgress'] and r['laps'] >= prior['laps'])

def log_prob(action, mean, log_std):
    return (-.5*((action-mean)/log_std.exp())**2-log_std-.5*math.log(2*math.pi)).sum(-1)

def advantages(rewards, dones, values, next_values, gamma=.995, lam=.95):
    result = torch.zeros_like(rewards)
    gae = torch.zeros((), dtype=rewards.dtype)
    for k in reversed(range(len(rewards))):
        mask = 1-dones[k]
        delta = rewards[k]+gamma*next_values[k]*mask-values[k]
        gae = delta+gamma*lam*mask*gae
        result[k] = gae
    return result

def run(tag, updates):
    if not tag.replace('-', '').isalnum() or not 1 <= updates <= 256:
        raise ValueError('Explicit isolated bounded study required')
    out = BASE/tag
    out.mkdir(exist_ok=False)
    torch.set_num_threads(1)
    torch.manual_seed(161026)
    np.random.seed(161026)
    actor = make_actor()
    critic = nn.Sequential(nn.Linear(DIM, 64), nn.Tanh(), nn.Linear(64, 64), nn.Tanh(), nn.Linear(64, 1)).double()
    log_std = nn.Parameter(torch.tensor([math.log(.12), math.log(.3)], dtype=torch.float64))
    optim = torch.optim.Adam([*actor.parameters(), *critic.parameters(), log_std], lr=3e-4)
    origin = json.loads(json.loads(SOURCE.read_text(encoding='utf-8'))['payloadJson'])
    started = time.monotonic()
    env = None
    events, completed = [], []
    best = best_weights = None
    zero = export_weights(actor)
    source_files = ['work/train_neural_ppo_additive_failure.py', 'work/neural-ppo-steering-policy.cjs', 'work/neural-ppo-additive-cost-cuda-env.cjs', 'work/neural-ppo-additive-failure-cost.cjs', 'work/neural-observation-normalization.cjs',
                    'work/neuronal_experiment_io.py', 'work/neural_ppo_wide_network.py', 'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    closure = json.loads(subprocess.check_output([str(NODE), '-e',
        "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-ppo-additive-cost-cuda-env.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"],
        cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    identity = {'format': 'male-cns-neuronal-ppo-parallel-additive-failure-study-v1', 'computeBackend': 'exact-v3-cuda-packed-driver-v1', 'appVersion': '5.6.0',
                'normalizationFile': str(NORMALIZATION), 'normalizationSha256': file_hash(NORMALIZATION),
                'normalizationRevision': 'fixed-observed520-tanh-normalization-v1',
                'motorRevision': 'symmetric-latent-residual-scale1-zero-authority-memory-v1',
                'trainingRewardRevision': 'ppo-incomplete-2lap-additive40-v1',
                'originFile': str(SOURCE), 'originSha256': file_hash(SOURCE),
                'preparedFile': str(PREPARED), 'preparedSha256': file_hash(PREPARED),
                'nodeExecutableSha256': file_hash(NODE),
                'sourceHashes': {file: file_hash(ROOT/file) for file in source_files},
                'completeInferenceSourceClosure': closure,
                'initialStd': log_std.exp().detach().tolist(), 'comparison': 'Only extra terminal cost changes from floor to additive40 versus the .3 longitudinal exploration comparison; same steering scale .12, seeds, network, four environments, physical R5 and physics', 'seed': 161026, 'environmentSeeds': SEEDS, 'environmentCount': ENV_COUNT, 'updatesRequested': updates, 'stepsPerEnvironment': STEPS, 'stepsPerRollout': ENV_COUNT*STEPS, 'minibatchSize': 256,
                'device': 'cpu', 'torchVersion': torch.__version__,
                'actor': '520 neuronal/controller features -> 64 tanh units -> 2 Gaussian latent residuals; 33474 learned parameters',
                'hyperparameters': {'gamma': .995, 'lambda': .95, 'clip': .2, 'epochs': 4,
                                    'learningRate': .0003, 'maxGradientNorm': .5, 'targetKL': .03},
                'boundary': 'Four independently reached and separately seeded V3/Monza environments, environment-major data and per-environment GAE. One warm-start experiment. Actual cached-prefix rollouts are not full laps or app generations. No deployment or save compatibility implied.'}
    atomic_json(out/'identity.json', identity)
    atomic_json(out/'initial-policy.json', {'status': 'research-unverified', 'identity': identity, 'weights': zero})
    def progress(phase, **fields):
        atomic_json(out/'state.json', {'phase': phase, 'elapsedWallSeconds': time.monotonic()-started,
                                      'physicalPid': env.process.pid if env else None, 'physicalPids': [e.process.pid for e in env.envs] if env else [], **fields})
    def weights():
        return export_weights(actor)
    try:
        progress('starting-actual-neural-environment')
        env = Environments(ROOT/'work/neural-ppo-additive-cost-cuda-env.cjs', {'modelFile': str(SOURCE), 'preparedFile': str(PREPARED), 'normalizationFile': str(NORMALIZATION)})
        assert env.metadata['cuda']['stats']['gpuCalls'] > 0 and env.metadata['cuda']['stats']['cpuFallbacks'] == 0
        assert env.metadata['motorRevision'] == identity['motorRevision']
        assert env.metadata['features'] == DIM and env.metadata['weights'] == COUNT
        assert env.metadata['trainingRewardRevision'] == identity['trainingRewardRevision']
        assert env.metadata['normalizationRevision'] == identity['normalizationRevision']
        assert env.metadata['normalizationSha256'] == identity['normalizationSha256']
        atomic_json(out/'metadata.json', env.metadata)
        progress('zero-policy-full-identity-preflight')
        full = env.request('evaluate', weights=zero, mode='full')
        practices = env.all('evaluate', weights=zero, mode='practice')
        practice = practices[0]
        for e in [full, *practices]:
            assert e['complete'] and not e['censored'] and not e['overlap']
            assert all(e['result'][k] == origin['expectedResult'][k] for k in KEYS)
            assert e['actionTraceSha256'] == origin['fullTraceSha256']
        atomic_json(out/'preflight.json', {'passed': True, 'full': full, 'practice': practice, 'independentPractices': practices})
        env.all('reset')
        for update in range(1, updates+1):
            progress('collecting-actual-on-policy-transitions', update=update, transitions=(update-1)*ENV_COUNT*STEPS)
            with torch.no_grad():
                std = log_std.exp().tolist()
            batch = env.request('rollout', weights=weights(), std=std, steps=256)
            # Preserve exact real observations, actions, Node means and outcomes.
            atomic_json(out/f'rollout-{update:03}.json', batch)
            rows = batch['rows']
            completed.extend(batch['episodes'])
            tensor = lambda key: torch.tensor([r[key] for r in rows], dtype=torch.float64)
            x, action, node_mean = tensor('x'), tensor('action'), tensor('mean')
            rewards, dones, next_x = tensor('reward'), tensor('done'), tensor('next')
            with torch.no_grad():
                mean_error = (actor(x)-node_mean).abs().max().item()
                assert mean_error < 1e-12, 'Node/Torch policy arithmetic disagreement'
                old_logp = log_prob(action, node_mean, log_std).clone()
                values, next_values = critic(x).squeeze(-1), critic(next_x).squeeze(-1)
                adv = separate_advantages(rewards, dones, values, next_values)
                returns = adv+values
                adv = (adv-adv.mean())/(adv.std(unbiased=False)+1e-8)
            losses, kls = [], []
            for epoch in range(4):
                permutation = torch.randperm(len(rows))
                for ids in permutation.split(256):
                    new_logp = log_prob(action[ids], actor(x[ids]), log_std)
                    ratio = (new_logp-old_logp[ids]).exp()
                    policy_loss = -torch.minimum(ratio*adv[ids], ratio.clamp(.8, 1.2)*adv[ids]).mean()
                    value_loss = .5*(critic(x[ids]).squeeze(-1)-returns[ids]).square().mean()
                    entropy = (log_std+.5*math.log(2*math.pi*math.e)).sum()
                    loss = policy_loss+.5*value_loss-.0005*entropy
                    assert torch.isfinite(loss)
                    optim.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_([*actor.parameters(), *critic.parameters(), log_std], .5)
                    optim.step()
                    with torch.no_grad():
                        clamp_actor(actor)
                        log_std.clamp_(math.log(.001), math.log(1))
                    losses.append(loss.item())
                with torch.no_grad():
                    log_ratio = log_prob(action, actor(x), log_std)-old_logp
                    kl = ((log_ratio.exp()-1)-log_ratio).mean().item()
                    kls.append(kl)
                if kl > .03:
                    break
            record = {'update': update, 'actualTransitions': update*ENV_COUNT*STEPS, 'completedPracticeEpisodes': len(completed),
                      'loss': float(np.mean(losses)), 'epochKL': kls, 'nodeTorchMaxMeanError': mean_error,
                      'changedActorParameters': sum(a != b for a, b in zip(weights(), zero)), 'std': log_std.exp().detach().tolist()}
            if update % 8 == 0 or update == updates:
                evaluation = env.request('evaluate', weights=weights(), mode='practice')
                record['practiceEvaluation'] = evaluation
                if clean_better(evaluation, best['result'] if best else origin['expectedResult']):
                    best, best_weights = evaluation, weights()
                # Evaluation interrupted a possibly partial practice rollout.
                # Do not count that interruption as a completed episode.
                env.request('reset')
            events.append(record)
            atomic_json(out/'training.json', {'events': events, 'completedPracticeEpisodes': completed})
            atomic_json(out/'latest-policy.json', {'status': 'research-unverified', 'identity': identity,
                        'weights': weights(), 'logStd': log_std.detach().tolist(), 'update': update})
            if update % 8 == 0 or update == updates:
                torch.save({'actor': actor.state_dict(), 'critic': critic.state_dict(),
                            'optimizer': optim.state_dict(), 'logStd': log_std.detach(),
                            'torchRNG': torch.get_rng_state(), 'update': update,
                            'identity': identity, 'boundary': 'Private training state, not an app save; no physical mid-episode resume.'},
                           out/'training-checkpoint.pt')
            print('PPO_UPDATE '+json.dumps(record), flush=True)
        full_proofs = []
        if best is not None:
            progress('candidate-full-from-line-check')
            full_proofs = [env.request('evaluate', weights=best_weights, mode='full') for _ in range(2)]
        report = {'passed': True, 'phase': 'finished', 'identity': identity, 'actualTransitions': updates*ENV_COUNT*STEPS,
                  'completedPracticeEpisodes': completed, 'events': events, 'bestPractice': best,
                  'bestWeights': best_weights, 'fullProofs': full_proofs,
                  'eligibleForIndependentNativeProof': bool(best and len(full_proofs) == 2
                    and all(clean_better(e, origin['expectedResult']) for e in full_proofs)
                    and full_proofs[0]['actionTraceSha256'] == full_proofs[1]['actionTraceSha256'] == best['actionTraceSha256']),
                  'cuda': env.request('metadata')['cuda'], 'cudaByEnvironment': [m['cuda'] for m in env.request('metadata_all')], 'promoted': False, 'wallSeconds': time.monotonic()-started,
                  'boundary': 'No deployment. Even a full Bridge improvement needs separate data-only export, independent native replay and verification before promotion.'}
        atomic_json(out/'report.json', report)
        progress('finished', actualTransitions=updates*ENV_COUNT*STEPS, eligibleForIndependentNativeProof=report['eligibleForIndependentNativeProof'])
        print('PPO_FINISHED '+json.dumps({k: report[k] for k in ['actualTransitions', 'eligibleForIndependentNativeProof', 'wallSeconds']}), flush=True)
    except Exception as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'events': events, 'elapsedWallSeconds': time.monotonic()-started})
        raise
    finally:
        if env:
            env.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    parser.add_argument('--updates', type=int, default=64)
    args = parser.parse_args()
    run(args.tag, args.updates)
