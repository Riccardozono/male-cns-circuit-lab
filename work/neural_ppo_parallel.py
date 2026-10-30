"""Four real independent physical processes and per-environment GAE.

Not GPU batched inference: the existing qualified CUDA backend is unchanged.
Every prefix is actually reached separately; no fabricated transitions.
"""
from concurrent.futures import ThreadPoolExecutor
import torch
from neuronal_experiment_io import Pipe
from train_neural_ppo_normalized_cuda import advantages

COUNT, STEPS = 4, 256
SEEDS = [161026+104729*k for k in range(COUNT)]

def separate_advantages(rewards, dones, values, next_values):
    if any(t.shape != (COUNT*STEPS,) for t in [rewards, dones, values, next_values]):
        raise ValueError('Four complete environment-major rollout segments required')
    parts = [t.reshape(COUNT, STEPS) for t in [rewards, dones, values, next_values]]
    return torch.stack([advantages(*(t[k] for t in parts)) for k in range(COUNT)]).reshape(-1)

class Environments:
    def __init__(self, script, configuration):
        self.pool = ThreadPoolExecutor(max_workers=COUNT)
        self.envs = [None]*COUNT
        self.closed = False
        def create(index):
            env = Pipe(script, {'configuration': {**configuration, 'seed': SEEDS[index]}})
            self.envs[index] = env
            return env
        try:
            futures = [self.pool.submit(create, k) for k in range(COUNT)]
            for f in futures:
                f.result()
            self.process = self.envs[0].process
            self.metadata = {**self.envs[0].metadata,
                             'parallelEnvironments': [
                                 {'index': k, 'seed': SEEDS[k], 'physicalPid': e.process.pid,
                                  'metadata': e.metadata} for k, e in enumerate(self.envs)]}
        except BaseException:
            self.close()
            raise

    def all(self, op, **fields):
        futures = [self.pool.submit(e.request, op, **fields) for e in self.envs]
        return [f.result() for f in futures]

    def request(self, op, **fields):
        if op == 'rollout':
            batches = self.all(op, **fields)
            return {'environments': [{'index': k, 'seed': SEEDS[k], **b}
                                     for k, b in enumerate(batches)],
                    'rows': [r for b in batches for r in b['rows']],
                    'episodes': [r for b in batches for r in b['episodes']]}
        if op == 'metadata_all':
            return self.all('metadata')
        return self.envs[0].request(op, **fields)

    def close(self):
        if self.closed:
            return
        self.closed = True
        self.pool.shutdown(wait=True, cancel_futures=True)
        for env in self.envs:
            if env is not None:
                env.close()
