"""Same scaled actor/PPO; initialize critic bias from actual completed returns."""
import json
import torch
from direct_neuronal_ppo_scaled import Learner as Base
from neuronal_experiment_io_retry import ROOT, file_hash

class Learner(Base):
    def __init__(self,initial_weights,dimension,seed=171026):
        super().__init__(initial_weights,dimension,seed)
        directory = ROOT/'.impeccable/review/neural-sacl/direct-critic-initial-return-calibration'
        fit = json.loads((directory/'fit.json').read_text())
        proof = json.loads((directory/'physical-verification.json').read_text())
        assert fit['passed'] and proof['passed'] and proof['fitSha256'] == file_hash(directory/'fit.json')
        assert fit['dataSha256'] == file_hash(directory/'actual-rollouts.json')
        assert fit['holdout']['calibratedRMSE'] < fit['holdout']['initialRMSE']
        for file,digest in proof['sourceHashes'].items():
            assert file_hash(ROOT/file) == digest
        with torch.no_grad():
            self.critic[-1].bias.add_(fit['offset'])
