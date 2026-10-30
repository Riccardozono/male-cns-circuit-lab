"""CUDA SAC over real CPU MaleCNS/vehicle dynamics, no route or teacher.

Training uses locally reached practice states. Every candidate is instead
validated from the start line using the EXPORTED numeric Node24 actor, not a
Torch prediction that might differ from native arithmetic. No time cap is
introduced into the physical episode.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import gymnasium as gym
import numpy as np
import torch
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import VecEnv
from neural_sac import GentleWarmSAC
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash

BRIDGE = ROOT / 'work/neural-projected-residual-env.cjs'
KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds']


def node(config):
    result = subprocess.run([str(NODE), str(ROOT / 'work/projected-residual-model-io.cjs'), json.dumps(config)],
                            cwd=ROOT, capture_output=True, text=True, encoding='utf-8', timeout=240,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return json.loads(result.stdout)


def encode(raw, mean, deviation):
    return np.clip((np.asarray(raw, dtype=np.float32) - mean) / deviation, -10, 10).astype(np.float32)


class ActualVec(VecEnv):
    def __init__(self, count, prepared_file, normalization):
        self.mean = np.asarray(normalization['mean'], dtype=np.float32)
        self.deviation = np.asarray(normalization['deviation'], dtype=np.float32)
        self.pipes, self.pending, self.episodes = [], None, 0
        self.best_practice = self.best_preserved_prior = 0.0
        self.rewards = np.zeros(count)
        self.lengths = np.zeros(count, dtype=int)
        errors = []
        with ThreadPoolExecutor(max_workers=count) as pool:
            futures = [pool.submit(Pipe, BRIDGE, {'configuration': {'preparedFile': str(prepared_file)}}) for _ in range(count)]
            for future in futures:
                try:
                    self.pipes.append(future.result())
                except Exception as error:
                    errors.append(error)
        if errors:
            self.close()
            raise errors[0]
        self.metadata_record = self.pipes[0].metadata
        if any(p.metadata != self.metadata_record for p in self.pipes):
            self.close()
            raise RuntimeError('Pinned environment identities differ')
        self.render_mode = None
        super().__init__(count, gym.spaces.Box(-10, 10, shape=(521,), dtype=np.float32),
                         gym.spaces.Box(-1, 1, shape=(2,), dtype=np.float32))

    def reset(self):
        requests = [p.send('reset', mode='practice') for p in self.pipes]
        states = [p.receive(r) for p, r in zip(self.pipes, requests)]
        self.rewards.fill(0)
        self.lengths.fill(0)
        self.reset_infos = [s['info'] for s in states]
        self._reset_seeds()
        self._reset_options()
        return encode([s['observation'] for s in states], self.mean, self.deviation)

    def step_async(self, actions):
        self.pending = [p.send('step', action=a.tolist()) for p, a in zip(self.pipes, actions)]

    def step_wait(self):
        states = [p.receive(r) for p, r in zip(self.pipes, self.pending)]
        observations, rewards, dones, infos = [], [], [], []
        for index, (p, state) in enumerate(zip(self.pipes, states)):
            if state['truncated']:
                raise RuntimeError('No artificial simulation time cap is allowed')
            reward, done, info = state['reward'], state['terminated'], state['info']
            self.rewards[index] += reward
            self.lengths[index] += 1
            if self.num_envs > 1 and index == self.num_envs - 1:
                self.best_preserved_prior = max(self.best_preserved_prior, info['bestProgress'])
            else:
                self.best_practice = max(self.best_practice, info['bestProgress'])
            info['TimeLimit.truncated'] = False
            observation = state['observation']
            if done:
                info['terminal_observation'] = encode(observation, self.mean, self.deviation)
                info['episode'] = {'r': float(self.rewards[index]), 'l': int(self.lengths[index])}
                self.rewards[index], self.lengths[index] = 0, 0
                self.episodes += 1
                observation = p.request('reset', mode='practice')['observation']
            observations.append(observation)
            rewards.append(reward)
            dones.append(done)
            infos.append(info)
        self.pending = None
        return (encode(observations, self.mean, self.deviation), np.asarray(rewards, dtype=np.float32),
                np.asarray(dones, dtype=bool), infos)

    def close(self):
        for p in self.pipes:
            p.close()

    def get_attr(self, name, indices=None):
        return [getattr(self, name, None) for _ in self._get_indices(indices)]

    def set_attr(self, name, value, indices=None):
        setattr(self, name, value)

    def env_method(self, method_name, *args, indices=None, **kwargs):
        return [None for _ in self._get_indices(indices)]

    def env_is_wrapped(self, wrapper_class, indices=None):
        return [False for _ in self._get_indices(indices)]


def export_actor(model, file):
    layers = []
    for module in model.actor.latent_pi:
        if isinstance(module, torch.nn.Linear):
            layers.append({'activation': 'relu', 'weights': module.weight.detach().cpu().tolist(),
                           'bias': module.bias.detach().cpu().tolist()})
    layers.append({'activation': 'tanh-unscale', 'weights': model.actor.mu.weight.detach().cpu().tolist(),
                   'bias': model.actor.mu.bias.detach().cpu().tolist()})
    if len(layers) != 3:
        raise RuntimeError('Unexpected actual actor architecture')
    atomic_json(file, {'dimensions': [521, 64, 64, 2], 'layers': layers})


def improves(candidate, previous):
    if candidate['censored'] or not candidate['complete'] or candidate['gasBrakeOverlapSteps']:
        return False
    a, b = candidate['result'], previous['result']
    return (not any(s in a['reason'] for s in ['urto', 'fuori pista', 'progresso non valido'])
            and a['fitness'] > b['fitness'] + 1e-6 and a['bestProgress'] >= b['bestProgress'] - 1e-6
            and a['laps'] >= b['laps'])


class Evaluation(BaseCallback):
    def __init__(self, out, pipe, baseline, interval):
        super().__init__()
        self.out, self.pipe, self.best, self.interval = out, pipe, baseline, interval
        self.last, self.evaluations, self.started = 0, [], time.monotonic()
        self.best_actor = out / 'initial-actor.json'

    def _on_step(self):
        if self.num_timesteps - self.last < self.interval:
            return True
        self.last = self.num_timesteps
        actor_file = self.out / f'actor-{self.num_timesteps:07d}.json'
        export_actor(self.model, actor_file)
        candidate = self.pipe.request('evaluate', actorFile=str(actor_file), mode='full')
        accepted = improves(candidate, self.best)
        if accepted:
            self.best, self.best_actor = candidate, actor_file
            self.model.save(self.out / 'best-own-residual.zip')
        row = {'steps': self.num_timesteps, 'gradientUpdates': self.model._n_updates,
               'exportedActorSha256': file_hash(actor_file), 'nativeFull': candidate, 'accepted': accepted,
               'practiceEpisodes': self.training_env.episodes, 'bestPracticeProgress': self.training_env.best_practice,
               'bestPreservedPriorProgress': self.training_env.best_preserved_prior,
               'wallSeconds': time.monotonic() - self.started}
        self.evaluations.append(row)
        self.model.save(self.out / 'latest-own-residual.zip')
        atomic_json(self.out / 'progress.json', {'phase': 'training', 'pid': os.getpid(), 'best': self.best,
                                              'bestActor': str(self.best_actor), 'evaluations': self.evaluations})
        print('PROJECTED_RESIDUAL_SAC_PROGRESS ' + json.dumps(row), flush=True)
        return not (accepted and candidate['result']['laps'] == 2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='projected-residual-3803-sac')
    parser.add_argument('--prepared', default='projected-residual-3803-prepared')
    parser.add_argument('--steps', type=int, default=20000)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--eval-every', type=int, default=4000)
    args = parser.parse_args()
    if not all(t.replace('-', '').isalnum() for t in [args.tag, args.prepared]) or not 1 <= args.workers <= 4 or not 128 <= args.steps <= 500000 or args.eval_every < 128:
        raise ValueError('Bounded independent private experiment required')
    if not torch.cuda.is_available():
        raise RuntimeError('Actual CUDA GPU required; no silent CPU fallback')
    base = ROOT / '.impeccable/review/neural-sacl'
    prepared_file, out = base / args.prepared / 'prepared.json', base / args.tag
    prepared = json.loads(prepared_file.read_text(encoding='utf-8'))
    out.mkdir(exist_ok=False)
    atomic_json(out / 'state.json', {'pid': os.getpid(), 'phase': 'initializing', 'configuration': vars(args)})
    torch.set_num_threads(1)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    env = pipe = None
    started = time.monotonic()
    try:
        env = ActualVec(args.workers, prepared_file, prepared['normalization'])
        pipe = Pipe(BRIDGE, {'configuration': {'preparedFile': str(prepared_file)}})
        if pipe.metadata != env.metadata_record:
            raise RuntimeError('Independent validation environment differs')
        model = GentleWarmSAC('MlpPolicy', env, learning_rate=1e-4, buffer_size=50000, learning_starts=1000,
                              batch_size=256, gamma=.999, train_freq=(1, 'step'), gradient_steps=1, ent_coef=.005,
                              policy_kwargs={'net_arch': {'pi': [64, 64], 'qf': [128, 128]}},
                              seed=15103803, device='cuda', verbose=0)
        with torch.no_grad():
            model.actor.mu.weight.zero_()
            model.actor.mu.bias.zero_()
            model.actor.log_std.weight.zero_()
            model.actor.log_std.bias.copy_(torch.tensor([-3., -.7], device='cuda'))
        gpu = {'name': torch.cuda.get_device_name(0), 'torch': torch.__version__, 'cuda': torch.version.cuda,
               'actorDevice': str(next(model.actor.parameters()).device), 'criticDevice': str(next(model.critic.parameters()).device)}
        if not all(gpu[k].startswith('cuda') for k in ['actorDevice', 'criticDevice']):
            raise RuntimeError('Actual CUDA actor and critic required')
        initial_actor = out / 'initial-actor.json'
        export_actor(model, initial_actor)
        baseline = pipe.request('evaluate', actorFile=str(initial_actor), mode='full')
        practice = pipe.request('evaluate', actorFile=str(initial_actor), mode='practice')
        if any(e['censored'] or e['gasBrakeOverlapSteps'] for e in [baseline, practice]) or any(baseline['result'][k] != prepared['sourceResult'][k] or practice['result'][k] != prepared['sourceResult'][k] for k in KEYS) or baseline['actionTraceSha256'] != prepared['actualSourceTraceSha256']:
            raise RuntimeError('Zero residual or actual cached parent memories change the verified frozen model')
        # Verify the standalone exported actor BEFORE using it for learning.
        zero_model = out / 'initial-model.malecns-neuronal-sac.json'
        node({'op': 'export', 'preparedFile': str(prepared_file), 'actorFile': str(initial_actor), 'file': str(zero_model), 'episode': baseline,
              'provenance': {'zeroResidualPreflight': True, 'preparationSha256': file_hash(prepared_file)}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            preflight = list(pool.map(lambda _: node({'op': 'verify', 'file': str(zero_model)}), range(2)))
        identity = {'configuration': vars(args), 'pid': os.getpid(), 'environment': pipe.metadata, 'gpu': gpu,
                    'preparationSha256': file_hash(prepared_file), 'nodeExecutableSha256': file_hash(NODE),
                    'learnedInferenceParameters': sum(p.numel() for module in [model.actor.latent_pi, model.actor.mu] for p in module.parameters()),
                    'sourceHashes': {str(f): file_hash(ROOT / f) for f in ['work/train_projected_residual_sac.py', 'work/neural_sac.py',
                        'work/neuronal_experiment_io.py', 'work/neural-projected-residual-env.cjs', 'work/neural-projected-residual.cjs',
                        'work/neural-projected-residual-model.cjs', 'work/projected-residual-model-io.cjs']}}
        atomic_json(out / 'identity.json', identity)
        atomic_json(out / 'preflight.json', {'passed': True, 'identity': identity, 'baseline': baseline,
                                           'practice': practice, 'nativeVerifications': preflight,
                                           'boundary': 'Zero-residual exported model parity, not a learned improvement or completed lap.'})
        model.save(out / 'initial-own-residual.zip')
        model.save(out / 'best-own-residual.zip')
        print('PROJECTED_RESIDUAL_SAC_READY ' + json.dumps({'gpu': gpu, 'baseline': baseline, 'practice': practice,
                                                         'nativePreflight': preflight, 'parameters': identity['learnedInferenceParameters']}), flush=True)
        atomic_json(out / 'state.json', {'pid': os.getpid(), 'phase': 'training', 'identity': identity})
        callback = Evaluation(out, pipe, baseline, args.eval_every)
        model.learn(total_timesteps=args.steps, callback=callback)
        final_actor = out / 'final-actor.json'
        export_actor(model, final_actor)
        final = pipe.request('evaluate', actorFile=str(final_actor), mode='full')
        if improves(final, callback.best):
            callback.best, callback.best_actor = final, final_actor
            model.save(out / 'best-own-residual.zip')
        model.save(out / 'final-own-residual.zip')
        model.save_replay_buffer(out / 'own-replay-buffer.pkl')
        repeat = pipe.request('evaluate', actorFile=str(callback.best_actor), mode='full')
        if any(repeat['result'][k] != callback.best['result'][k] for k in KEYS) or repeat['actionTraceSha256'] != callback.best['actionTraceSha256'] or repeat['censored']:
            raise RuntimeError('Best numeric actor does not independently repeat')
        best_actor = out / 'best-actor.json'
        shutil.copy2(callback.best_actor, best_actor)
        numeric_file = out / 'model.malecns-neuronal-sac.json'
        node({'op': 'export', 'preparedFile': str(prepared_file), 'actorFile': str(best_actor), 'file': str(numeric_file),
              'episode': repeat, 'provenance': {'trainingIdentitySha256': file_hash(out / 'identity.json'), 'actualSteps': model.num_timesteps,
                                              'actualGradientUpdates': model._n_updates, 'trainingDevice': gpu}})
        with ThreadPoolExecutor(max_workers=2) as pool:
            native = list(pool.map(lambda _: node({'op': 'verify', 'file': str(numeric_file)}), range(2)))
        report = {'passed': True, 'phase': 'finished', 'identity': identity, 'initialFull': baseline, 'initialPractice': practice,
                  'zeroResidualNativePreflight': preflight, 'best': callback.best, 'independentBestRepeat': repeat,
                  'improved': improves(callback.best, baseline), 'final': final, 'actualSteps': model.num_timesteps,
                  'gradientUpdates': model._n_updates, 'practiceEpisodes': env.episodes, 'evaluations': callback.evaluations,
                  'nativeVerifications': native, 'exportedModelFile': str(numeric_file), 'wallSeconds': time.monotonic()-started,
                  'boundary': 'Reward-trained CUDA residual over fixed CPU anatomical model and unchanged physics. Exported Node24 actor validates every full run. Practice is not a generation; retained prior is actually learned, no teacher/route. Warm-start V3 / Monza only; no convergence claim without laps. App, originals and release untouched.'}
        atomic_json(out / 'report.json', report)
        atomic_json(out / 'state.json', {'pid': os.getpid(), 'phase': 'finished', 'reportSha256': file_hash(out / 'report.json')})
        print('PROJECTED_RESIDUAL_SAC_DONE '+json.dumps({k: report[k] for k in ['passed', 'improved', 'actualSteps', 'gradientUpdates', 'best', 'practiceEpisodes', 'wallSeconds']}), flush=True)
    except Exception as error:
        atomic_json(out / 'state.json', {'pid': os.getpid(), 'phase': 'failed', 'error': repr(error),
                                       'actualSteps': model.num_timesteps if 'model' in locals() else 0,
                                       'gradientUpdates': model._n_updates if 'model' in locals() else 0})
        raise
    finally:
        if env:
            env.close()
        if pipe:
            pipe.close()


if __name__ == '__main__':
    main()
