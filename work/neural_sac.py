"""Private, real-reward SAC experiment over a fixed MaleCNS reservoir.

The actor receives neuronal history only. Practice and complete from-line
validation are separate; never describe a practice episode as a generation.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import queue
import subprocess
import threading
import time
from pathlib import Path
import numpy as np
import gymnasium as gym
import torch
from stable_baselines3 import SAC
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import VecEnv

ROOT = Path(__file__).resolve().parent.parent
BRIDGE = ROOT / 'work' / 'neural-rl-bridge.cjs'

def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def atomic_json(path, value):
    pending = Path(str(path) + '.pending')
    pending.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(pending, path)

class NodePipe:
    def __init__(self):
        self.process = subprocess.Popen(['node', str(BRIDGE)], cwd=ROOT, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, encoding='utf-8', bufsize=1,
                                        creationflags=subprocess.CREATE_NO_WINDOW)
        self.responses = queue.Queue()
        self.request_id = 0
        self.closed = False
        threading.Thread(target=self._read, daemon=True).start()
        try:
            self.metadata = self.request('init')
        except Exception:
            self.close()
            raise

    def _read(self):
        for line in self.process.stdout:
            try:
                self.responses.put(json.loads(line))
            except Exception as error:
                self.responses.put({'error': str(error)})
        self.responses.put({'error': 'Node transport ended', 'exit': self.process.poll()})

    def send(self, operation, **fields):
        self.request_id += 1
        self.process.stdin.write(json.dumps({'id': self.request_id, 'op': operation, **fields}) + '\n')
        self.process.stdin.flush()
        return self.request_id

    def receive(self, request_id):
        result = self.responses.get(timeout=60)
        if result.get('error'):
            raise RuntimeError(result['error'])
        if result.get('id') != request_id:
            raise RuntimeError('Out-of-order Node response')
        return result['result']

    def request(self, operation, **fields):
        return self.receive(self.send(operation, **fields))

    def close(self):
        if self.closed:
            return
        self.closed = True
        self.process.stdin.close()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            self.process.wait(timeout=5)

class NeuralVec(VecEnv):
    """Dispatch fixed physical control steps to independent Node processes."""
    def __init__(self, count):
        self.pipes = []
        try:
            for _ in range(count):
                self.pipes.append(NodePipe())
        except Exception:
            self.close()
            raise
        self.metadata_record = self.pipes[0].metadata
        if any(pipe.metadata != self.metadata_record for pipe in self.pipes):
            self.close()
            raise RuntimeError('Environment identities differ')
        self.render_mode = None
        self.observation_space = gym.spaces.Box(-1, 1, shape=(516,), dtype=np.float32)
        self.action_space = gym.spaces.Box(-1, 1, shape=(2,), dtype=np.float32)
        self.pending = None
        self.rewards = np.zeros(count)
        self.lengths = np.zeros(count, dtype=int)
        self.episodes = 0
        self.best_practice = 0.0
        self.best_preserved_prior = 0.0
        super().__init__(count, self.observation_space, self.action_space)

    def reset(self):
        ids = [pipe.send('reset', mode='practice') for pipe in self.pipes]
        states = [pipe.receive(request_id) for pipe, request_id in zip(self.pipes, ids)]
        self.rewards.fill(0)
        self.lengths.fill(0)
        self.reset_infos = [state['info'] for state in states]
        self._reset_seeds()
        self._reset_options()
        return np.asarray([state['observation'] for state in states], dtype=np.float32)

    def step_async(self, actions):
        self.pending = [pipe.send('step', action=action.tolist()) for pipe, action in zip(self.pipes, actions)]

    def step_wait(self):
        states = [pipe.receive(request_id) for pipe, request_id in zip(self.pipes, self.pending)]
        observations, rewards, dones, infos = [], [], [], []
        for index, (pipe, state) in enumerate(zip(self.pipes, states)):
            reward = state['reward']
            done = state['terminated'] or state['truncated']
            info = state['info']
            self.rewards[index] += reward
            self.lengths[index] += 1
            if self.num_envs > 1 and index == self.num_envs - 1:
                self.best_preserved_prior = max(self.best_preserved_prior, info['bestProgress'])
            else:
                self.best_practice = max(self.best_practice, info['bestProgress'])
            info['TimeLimit.truncated'] = state['truncated'] and not state['terminated']
            observation = state['observation']
            if done:
                info['terminal_observation'] = np.asarray(observation, dtype=np.float32)
                info['episode'] = {'r': float(self.rewards[index]), 'l': int(self.lengths[index])}
                self.rewards[index] = 0
                self.lengths[index] = 0
                self.episodes += 1
                reset = pipe.request('reset', mode='practice')
                observation = reset['observation']
            observations.append(observation)
            rewards.append(reward)
            dones.append(done)
            infos.append(info)
        self.pending = None
        return (np.asarray(observations, dtype=np.float32), np.asarray(rewards, dtype=np.float32),
                np.asarray(dones, dtype=bool), infos)

    def close(self):
        for pipe in self.pipes:
            pipe.close()

    def get_attr(self, attr_name, indices=None):
        return [getattr(self, attr_name, None) for _ in self._get_indices(indices)]

    def set_attr(self, attr_name, value, indices=None):
        setattr(self, attr_name, value)

    def env_method(self, method_name, *args, indices=None, **kwargs):
        return [None for _ in self._get_indices(indices)]

    def env_is_wrapped(self, wrapper_class, indices=None):
        return [False for _ in self._get_indices(indices)]

class GentleWarmSAC(SAC):
    """SAC core; retain one genuinely learned prior behavior in the replay data.

    This is a protected zero-residual member, not a route/teacher controller.
    Validation always uses the learned actor alone from the start line.
    """
    def _sample_action(self, learning_starts, action_noise=None, n_envs=1):
        if self.num_timesteps < learning_starts:
            action, _ = self.predict(self._last_obs, deterministic=False)
            scaled = self.policy.scale_action(action)
        else:
            action, scaled = super()._sample_action(learning_starts, action_noise, n_envs)
        if n_envs > 1:
            action[-1] = 0
            scaled[-1] = 0
        return action, scaled

def validate(model, pipe, mode):
    state = pipe.request('reset', mode=mode)
    controls = 0
    while True:
        action, _ = model.predict(np.asarray(state['observation'], dtype=np.float32), deterministic=True)
        state = pipe.request('step', action=action.tolist())
        controls += 1
        if state['terminated'] or state['truncated']:
            return {**state['info'], 'censored': state['truncated'], 'validationMode': mode,
                    'actualActorControls': controls}

class Progress(BaseCallback):
    def __init__(self, output, validation, interval, identity):
        super().__init__()
        self.output = output
        self.validation = validation
        self.interval = interval
        self.identity = identity
        self.last = 0
        self.started = time.monotonic()
        self.evaluations = []
        self.best = None

    def _on_step(self):
        if self.num_timesteps - self.last < self.interval:
            return True
        self.last = self.num_timesteps
        candidate = validate(self.model, self.validation, 'full')
        row = {'steps': self.num_timesteps, 'wallSeconds': time.monotonic()-self.started,
               'practiceEpisodes': self.training_env.episodes,
               'bestPracticeProgress': self.training_env.best_practice,
               'bestPreservedPriorProgress': self.training_env.best_preserved_prior,
               'independentFullValidation': candidate, 'gradientUpdates': self.model._n_updates}
        self.evaluations.append(row)
        if not candidate['censored'] and (self.best is None or candidate['laps'] > self.best['laps'] or
                candidate['laps'] == self.best['laps'] and candidate['bestProgress'] > self.best['bestProgress']):
            self.best = candidate
            self.model.save(self.output / 'best-own-model.zip')
        self.model.save(self.output / 'latest-own-model.zip')
        atomic_json(self.output / 'progress.json', {'identity': self.identity, 'last': row, 'best': self.best,
                                                    'evaluations': self.evaluations})
        print('NEURAL_SAC_PROGRESS ' + json.dumps(row), flush=True)
        return not (candidate['complete'] and candidate['laps'] == 2 and not candidate['censored'])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='sac-first')
    parser.add_argument('--steps', type=int, default=10000)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--eval-every', type=int, default=2000)
    args = parser.parse_args()
    if not args.tag.replace('-', '').isalnum() or args.workers not in (1, 2, 3, 4) or args.steps < 100:
        raise ValueError('Invalid experimental settings')
    output = ROOT / '.impeccable' / 'review' / 'neural-sacl' / args.tag
    output.mkdir(parents=True, exist_ok=False)
    if not torch.cuda.is_available():
        raise RuntimeError('Verified CUDA GPU required; no silent CPU fallback')
    torch.set_num_threads(1)
    torch.manual_seed(1406717)
    np.random.seed(1406717)
    gpu = {'name': torch.cuda.get_device_name(0), 'torch': torch.__version__, 'cuda': torch.version.cuda}
    tensor = torch.randn((512,512), device='cuda', requires_grad=True)
    (tensor @ tensor.T).mean().backward()
    torch.cuda.synchronize()
    gpu['actualMatrixGradientFinite'] = bool(torch.isfinite(tensor.grad).all().item())
    env = None
    validation = None
    try:
        env = NeuralVec(args.workers)
        validation = NodePipe()
        model = GentleWarmSAC('MlpPolicy', env, learning_rate=3e-4, buffer_size=50000,
                             learning_starts=1000, batch_size=256, gamma=.999,
                             train_freq=(1,'step'), gradient_steps=1, ent_coef=.01,
                             policy_kwargs={'net_arch':[256,256]}, seed=1406717, device='cuda', verbose=0)
        with torch.no_grad():
            model.actor.mu.weight.zero_()
            model.actor.mu.bias.zero_()
            model.actor.log_std.weight.zero_()
            model.actor.log_std.bias.fill_(-3)
        gpu['actorDevice'] = str(next(model.actor.parameters()).device)
        gpu['criticDevice'] = str(next(model.critic.parameters()).device)
        if not gpu['actorDevice'].startswith('cuda') or not gpu['criticDevice'].startswith('cuda'):
            raise RuntimeError('Actor and critic must actually use CUDA')
        initial_full = validate(model, validation, 'full')
        initial_practice = validate(model, validation, 'practice')
        keys = ['bestProgress','fitness','laps','reason','totalSimulationSeconds']
        if any(initial_full[k] != initial_practice[k] for k in keys):
            raise RuntimeError('Zero residual full/practice validation differs')
        identity = {'format':'male-cns-private-residual-sac-v1', 'environment':env.metadata_record,
                    'gpu':gpu, 'configuration':{**vars(args),'protectedPriorMembers':int(args.workers>1)},
                    'algorithm':'SAC with small-Gaussian residual warm-up and one genuinely learned protected prior',
                    'sourceHashes':{'work/neural_sac.py':file_hash(__file__),
                                    'work/neural-rl-bridge.cjs':file_hash(BRIDGE)}}
        atomic_json(output / 'identity.json', identity)
        print('NEURAL_SAC_READY ' + json.dumps({'gpu':gpu,'initialFull':initial_full,
                                               'practicePrefixMatchesFull':True}), flush=True)
        callback = Progress(output, validation, args.eval_every, identity)
        # Preserve the actually verified starting policy. A later regression
        # cannot become "best" merely because it was the first logged update.
        callback.best = initial_full
        model.save(output / 'initial-own-model.zip')
        model.save(output / 'best-own-model.zip')
        model.learn(total_timesteps=args.steps, callback=callback)
        final = validate(model, validation, 'full')
        model.save(output / 'final-own-model.zip')
        model.save_replay_buffer(output / 'own-replay-buffer.pkl')
        atomic_json(output / 'report.json', {'identity':identity,'initialFull':initial_full,
                    'finalIndependentFullValidation':final,'bestValidated':callback.best,
                    'evaluations':callback.evaluations,'gradientUpdates':model._n_updates,
                    'actualTrainingSteps':model.num_timesteps,
                    'boundary':'Private generated model files only, never load untrusted pickle/zip. '
                    'Practice transitions are not full generations or laps; full validation is separate. '
                    'No current app/release/save modification. Installation or updates do not prove convergence.'})
        print('NEURAL_SAC_DONE '+json.dumps({'steps':model.num_timesteps,'gradientUpdates':model._n_updates,
                                          'final':final,'best':callback.best}), flush=True)
    finally:
        if env is not None:
            env.close()
        if validation is not None:
            validation.close()

if __name__ == '__main__':
    main()
