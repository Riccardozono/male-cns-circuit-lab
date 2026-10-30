"""On-policy PPO for a two-action readout of fixed actual neural GRU features."""
import os
os.environ['OMP_NUM_THREADS'] = '2'
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['CUBLAS_WORKSPACE_CONFIG'] = ':16:8'
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import shutil
import time
import torch
from torch import nn
from direct_neuronal_ppo import advantages, log_prob

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = ROOT / '.impeccable/review/learning-ml'
sha = lambda value: hashlib.sha256(value).hexdigest()


def enforce_kl_step(parameters, saved_parameters, optimizer, saved_optimizer, measure, budget=.02):
    """Backtrack a PPO proposal while preserving Adam moments for accepted steps."""
    proposed = [parameter.detach().clone() for parameter in parameters]
    proposed_optimizer = copy.deepcopy(optimizer.state_dict())
    for exponent in range(13):
        scale = 2.0 ** -exponent
        with torch.no_grad():
            for parameter, old, new in zip(parameters, saved_parameters, proposed):
                parameter.copy_(old + (new - old) * scale)
        optimizer.load_state_dict(proposed_optimizer)
        measured = float(measure())
        if math.isfinite(measured) and measured <= budget:
            return True, scale, measured
    with torch.no_grad():
        for parameter, old in zip(parameters, saved_parameters):
            parameter.copy_(old)
    optimizer.load_state_dict(saved_optimizer)
    return False, 0.0, float(measure())


def write(path, data):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--updates', type=int, default=4)
    parser.add_argument('--population', type=int, default=16)
    parser.add_argument('--steps', type=int, default=256)
    parser.add_argument('--seed', type=int, default=850820)
    parser.add_argument('--exploration-std', type=float, nargs=2, default=(.1, .3), metavar=('STEER', 'LONGITUDINAL'))
    parser.add_argument('--critic-prior', choices=('zero', 'common-failure'), default='common-failure')
    parser.add_argument('--reward-mode', choices=('fitness', 'optimizer-progress-curriculum'), default='fitness')
    parser.add_argument('--unsafe-terminal-penalty-track-lengths', type=float, default=6.0)
    args = parser.parse_args()
    model, output = args.model.resolve(), args.output.resolve()
    if not model.is_relative_to(RESEARCH) or not output.is_relative_to(RESEARCH) or output.exists():
        raise ValueError('Use a new private research output and existing owned model.')
    if not 1 <= args.updates <= 16 or not 1 <= args.population <= 16 or not 16 <= args.steps <= 512:
        raise ValueError('Bounded actual on-policy training required.')
    if any(not math.isfinite(value) or not .003 <= value <= .3 for value in args.exploration_std):
        raise ValueError('Finite exploration standard deviations in [.003,.3] required.')
    if args.reward_mode == 'optimizer-progress-curriculum' and args.critic_prior != 'zero':
        raise ValueError('The shaped progress objective requires a zero critic prior.')
    if not math.isfinite(args.unsafe_terminal_penalty_track_lengths) or not 0 <= args.unsafe_terminal_penalty_track_lengths <= 6:
        raise ValueError('Unsafe terminal penalty must be in [0,6] track lengths.')
    raw = model.read_bytes()
    envelope = json.loads(raw)
    if envelope['format'] != 'male-cns-neural-self-gru-envelope-v1' or sha(envelope['payloadJson'].encode()) != envelope['sha256']:
        raise ValueError('Actual own recurrent model checksum required.')
    data = json.loads(envelope['payloadJson'])
    if not torch.cuda.is_available() or 'RTX 4060' not in torch.cuda.get_device_name(0):
        raise RuntimeError('Actual RTX 4060 required, no CPU fallback.')
    torch.set_num_threads(2)
    torch.manual_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    actor = nn.Linear(data['hiddenSize'], 2, device='cuda', dtype=torch.float64)
    with torch.no_grad():
        actor.weight.copy_(torch.tensor(data['weightOut'], device='cuda', dtype=torch.float64).reshape(2, -1))
        actor.bias.copy_(torch.tensor(data['biasOut'], device='cuda', dtype=torch.float64))
    critic = nn.Sequential(nn.Linear(data['hiddenSize'], 64), nn.Tanh(), nn.Linear(64, 64), nn.Tanh(), nn.Linear(64, 1)).to(device='cuda', dtype=torch.float64)
    if args.critic_prior == 'common-failure':
        with torch.no_grad():
            critic[-1].weight.zero_()
            critic[-1].bias.fill_(-4.4)
    initial_value_prior = -4.4 if args.critic_prior == 'common-failure' else 0.0
    log_std = nn.Parameter(torch.log(torch.tensor(args.exploration_std, device='cuda', dtype=torch.float64)))
    actor_parameters = list(actor.parameters()) + [log_std]
    actor_optimizer = torch.optim.Adam(actor_parameters, lr=.0003)
    critic_optimizer = torch.optim.Adam(critic.parameters(), lr=.001)
    flatten = lambda: actor.weight.detach().reshape(-1).cpu().tolist() + actor.bias.detach().cpu().tolist()
    output.mkdir()
    shutil.copyfile(__file__, output / 'trainer-used.py')
    shutil.copyfile(ROOT / 'work/neural-self-gru-env.cjs', output / 'neural-self-gru-env.cjs.source')
    shutil.copyfile(ROOT / 'work/neural-self-gru.cjs', output / 'neural-self-gru.cjs.source')
    stderr = (output / 'environment.stderr.log').open('x', encoding='utf-8')
    proc = subprocess.Popen(['node', 'work/neural-self-gru-env.cjs'], cwd=ROOT, stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=stderr, text=True, encoding='utf-8', bufsize=1)
    serial = 0
    def request(op, **kwargs):
        nonlocal serial
        serial += 1
        proc.stdin.write(json.dumps({'id': serial, 'op': op, **kwargs}, allow_nan=False) + '\n')
        proc.stdin.flush()
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError(f'Physical environment terminated, code {proc.poll()}')
        reply = json.loads(line)
        if reply.get('id') != serial or 'error' in reply:
            raise RuntimeError(reply)
        return reply['result']
    started = time.perf_counter()
    try:
        metadata = request('init', configuration={'modelFile': str(model), 'population': args.population,
                                                   'seed': args.seed, 'rewardMode': args.reward_mode,
                                                   'unsafeTerminalPenaltyTrackLengths': args.unsafe_terminal_penalty_track_lengths})
        baseline = request('evaluate', weights=flatten())
        print('NEURAL_SELF_PPO_BASELINE ' + json.dumps(baseline), flush=True)
        records = []
        for update in range(1, args.updates + 1):
            before = flatten()
            batch = request('rollout', weights=before, std=log_std.detach().exp().cpu().tolist(), steps=args.steps)
            rows = [row for lane in batch['batches'] for row in lane]
            tensor = lambda key: torch.tensor([row[key] for row in rows], device='cuda', dtype=torch.float64)
            x, action, next_x = tensor('x'), tensor('action'), tensor('next')
            reward = tensor('reward').reshape(args.population, args.steps) / 1000
            done = tensor('done').reshape(args.population, args.steps)
            actor_enabled = tensor('actorEnabled')
            with torch.no_grad():
                old_mean = actor(x)
                parity = (old_mean - tensor('mean')).abs().max().item()
                if parity > 1e-10:
                    raise RuntimeError('Actual Torch/Node actor mean mismatch.')
                old_logp = log_prob(action, old_mean, log_std)
                value = critic(x).reshape(args.population, args.steps)
                next_value = critic(next_x).reshape(args.population, args.steps)
                advantage = advantages(reward, done, value, next_value, gamma=1, lam=.98)
                returns = (advantage + value).reshape(-1)
                advantage = advantage.reshape(-1)
                advantage = (advantage - advantage.mean()) / advantage.std().clamp_min(1e-8)
            kl, stopped, actor_steps, backtracked_steps, min_step_scale = 0., False, 0, 0, 1.0
            for epoch in range(8):
                order = torch.randperm(len(x), device='cuda')
                for start in range(0, len(x), 512):
                    indices = order[start:start + 512]
                    prediction = actor(x[indices])
                    new_logp = log_prob(action[indices], prediction, log_std)
                    log_ratio = new_logp - old_logp[indices]
                    ratio = log_ratio.exp()
                    mask = actor_enabled[indices]
                    objective = torch.minimum(ratio * advantage[indices], ratio.clamp(.8, 1.2) * advantage[indices])
                    policy_loss = -(objective * mask).sum() / mask.sum().clamp_min(1) - .001 * log_std.sum()
                    value_loss = ((critic(x[indices]).flatten() - returns[indices]) ** 2).mean()
                    if not torch.isfinite(policy_loss + value_loss):
                        raise RuntimeError('Finite on-policy losses required.')
                    actor_optimizer.zero_grad(set_to_none=True)
                    policy_loss.backward()
                    nn.utils.clip_grad_norm_(actor_parameters, .5)
                    saved_parameters = [parameter.detach().clone() for parameter in actor_parameters]
                    saved_optimizer = copy.deepcopy(actor_optimizer.state_dict())
                    actor_optimizer.step()
                    with torch.no_grad():
                        log_std.clamp_(math.log(.003), math.log(.3))
                    def measure_kl():
                        with torch.no_grad():
                            log_ratio = log_prob(action, actor(x), log_std) - old_logp
                            return ((log_ratio.exp() - 1) - log_ratio).mean().item()
                    accepted, step_scale, kl = enforce_kl_step(actor_parameters, saved_parameters,
                                                               actor_optimizer, saved_optimizer,
                                                               measure_kl, budget=.02)
                    if not accepted:
                        stopped = True
                        break
                    backtracked_steps += int(step_scale < 1.0)
                    min_step_scale = min(min_step_scale, step_scale)
                    critic_optimizer.zero_grad(set_to_none=True)
                    value_loss.backward()
                    nn.utils.clip_grad_norm_(critic.parameters(), 1)
                    critic_optimizer.step()
                    actor_steps += 1
                with torch.no_grad():
                    full_log_ratio = log_prob(action, actor(x), log_std) - old_logp
                    kl = ((full_log_ratio.exp() - 1) - full_log_ratio).mean().item()
                if not math.isfinite(kl) or kl > .02 + 1e-12:
                    raise RuntimeError('Finite bounded PPO KL required.')
                if stopped:
                    break
            current = flatten()
            if any(not math.isfinite(v) or abs(v) > 100 for v in current):
                raise RuntimeError('Finite bounded learned motor head required.')
            evaluation = request('evaluate', weights=current)
            candidate = copy.deepcopy(data)
            candidate['weightOut'], candidate['biasOut'] = current[:-2], current[-2:]
            candidate['training'] = {'kind': 'on-policy-PPO', 'reinforcementUpdates': update,
                                     'warmStart': data['training'], 'parentModelSha256': sha(raw),
                                     'seed': args.seed, 'initialExplorationStd': list(args.exploration_std),
                                     'criticPrior': args.critic_prior, 'rewardMode': args.reward_mode,
                                     'unsafeTerminalPenaltyTrackLengths': args.unsafe_terminal_penalty_track_lengths,
                                     'fitOnly': False,
                                     'independentDrivingValidation': True}
            payload = json.dumps(candidate, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
            filename = f'update-{update}.malecns-neural-gru.json'
            write(output / filename, {'format': 'male-cns-neural-self-gru-envelope-v1', 'payloadJson': payload,
                                      'sha256': sha(payload.encode())})
            record = {'update': update, 'onPolicyTransitions': len(rows), 'actorSteps': actor_steps,
                      'actorActiveTransitions': int(actor_enabled.sum().item()),
                      'actorMeanParityMaxError': parity, 'kl': kl, 'klStopped': stopped,
                      'klBacktracking': True, 'backtrackedSteps': backtracked_steps,
                      'minimumAcceptedStepScale': min_step_scale,
                      'criticPriorMode': args.critic_prior, 'initialValuePrior': initial_value_prior,
                      'trainingRewardMode': args.reward_mode,
                      'unsafeTerminalPenaltyTrackLengths': args.unsafe_terminal_penalty_track_lengths,
                      'headDeltaL2': math.dist(before, current), 'std': log_std.detach().exp().cpu().tolist(),
                      'trainingEpisodes': batch['episodes'], 'trainingLanes': batch['lanes'],
                      'evaluation': evaluation, 'gpu': batch['gpu'],
                      'file': filename, 'sha256': sha((output / filename).read_bytes()),
                      'wallSeconds': time.perf_counter() - started}
            records.append(record)
            write(output / f'update-{update}-report.json', record)
            print('NEURAL_SELF_PPO_UPDATE ' + json.dumps({k: record[k] for k in ['update', 'onPolicyTransitions', 'headDeltaL2', 'kl', 'evaluation', 'wallSeconds']}), flush=True)
        request('close')
        proc.stdin.close()
        proc.wait(timeout=15)
        if proc.returncode != 0:
            raise RuntimeError(f'Physical environment exited with code {proc.returncode}.')
        report = {'format': 'male-cns-neural-self-ppo-v1', 'metadata': metadata, 'baseline': baseline,
                  'records': records, 'torchVersion': torch.__version__, 'device': torch.cuda.get_device_name(0),
                  'rewardScale': 1000, 'gamma': 1, 'lambda': .98, 'clip': .2, 'actorLearningRate': .0003,
                  'criticPriorMode': args.critic_prior, 'initialValuePrior': initial_value_prior,
                  'explorationStdInitial': list(args.exploration_std), 'klBacktracking': True,
                  'trainingRewardMode': args.reward_mode,
                  'trainerSha256': sha(Path(__file__).read_bytes()),
                  'environmentExitCode': proc.returncode,
                  'learningSucceeded': any(r['evaluation']['meetsTwoLapPhysicalGoal'] for r in records),
                  'wallSeconds': time.perf_counter() - started,
                  'limits': 'Bounded on-policy PPO on the real current Monza physics and actual current neural observations. Only the two-action head and exploration are updated. Training reward mode is recorded separately from official fitness; deterministic cold evaluations always report official strict fitness/progress. Model is research-unverified; no app/save/release changes.'}
        write(output / 'report.json', report)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=10)
        stderr.close()


if __name__ == '__main__':
    main()
