"""All251descending cells,264inputs; calibrated critic and lambda1 PPO."""
import json
import math
import torch
from torch import nn
from direct_neuronal_ppo_nonlinear import Learner as Base, NonlinearActor
from direct_neuronal_ppo import log_prob, advantages as base_advantages
from neuronal_experiment_io_retry import ROOT, file_hash

PREPARED = ROOT/'.impeccable/review/neural-sacl/direct-motorpool-initial-calibration'

class ScaledActor(NonlinearActor):
    def __init__(self,linear,packed,dimension):
        super().__init__(linear,packed,dimension)
        s = json.loads((PREPARED/'scaler.json').read_text())
        assert dimension == s['dimension'] == 264 and s['clip'] == 5
        self.register_buffer('center',torch.tensor(s['center'],dtype=torch.float64))
        self.register_buffer('scale',torch.tensor(s['scale'],dtype=torch.float64))
        assert self.center.shape == self.scale.shape == (dimension,)
        assert torch.all(torch.isfinite(self.center)) and torch.all(self.scale >= .02)

    def forward(self,x):
        z = ((x-self.center)/self.scale).clamp(-5,5)
        return self.linear(x)+self.output(torch.tanh(self.hidden(z)))

def advantages(rewards,dones,values,next_values):
    return base_advantages(rewards,dones,values,next_values,gamma=1,lam=1)

class Learner(Base):
    def __init__(self,initial_weights,dimension,seed=171026):
        super().__init__(initial_weights,dimension,seed)
        self.actor = ScaledActor(self.actor.linear,initial_weights,dimension)
        self.actor_optim = torch.optim.Adam([*self.actor.parameters(),self.log_std],lr=.0003)
        fit = json.loads((PREPARED/'fit.json').read_text())
        proof = json.loads((PREPARED/'physical-verification.json').read_text())
        assert fit['passed'] and proof['passed'] and fit['dimension'] == dimension
        assert proof['fitSha256'] == file_hash(PREPARED/'fit.json')
        assert fit['scalerSha256'] == file_hash(PREPARED/'scaler.json')
        assert fit['dataSha256'] == file_hash(PREPARED/'actual-rollouts.json')
        assert fit['holdout']['calibratedRMSE'] < fit['holdout']['initialRMSE']
        for file,digest in proof['sourceHashes'].items():
            assert file_hash(ROOT/file) == digest,file
        with torch.no_grad():
            self.critic[-1].bias.add_(fit['offset'])

    def update(self, batches):
        lengths = {len(b['rows']) for b in batches}
        if len(batches) != 4 or len(lengths) != 1:
            raise ValueError('Four complete independent rollout segments required')
        steps = lengths.pop()
        rows = [r for b in batches for r in b['rows']]
        tensor = lambda key: torch.tensor([r[key] for r in rows], dtype=torch.float64)
        x, action, node_mean = tensor('x'), tensor('action'), tensor('mean')
        reward, done, active, next_x = tensor('reward'), tensor('done'), tensor('active'), tensor('next')
        with torch.no_grad():
            mean_error = (self.actor(x)-node_mean).abs().max().item()
            assert mean_error < 1e-12, 'Node/Torch direct latent mean mismatch'
            old_logp = log_prob(action, node_mean, self.log_std).clone()
            value = self.critic(x).squeeze(-1)
            next_value = self.critic(next_x).squeeze(-1)
            adv = advantages(*(t.reshape(4, steps) for t in [reward, done, value, next_value])).flatten()
            returns = adv+value
            observed = adv[active > 0]
            assert len(observed) > 0
            adv = (adv-observed.mean())/(observed.std(unbiased=False)+1e-8)
        actor_losses, critic_losses, kls = [], [], []
        for epoch in range(4):
            for ids in torch.randperm(len(rows)).split(128):
                ratio = (log_prob(action[ids], self.actor(x[ids]), self.log_std)-old_logp[ids]).clamp(-20, 20).exp()
                mask = active[ids]
                policy_loss = -(torch.minimum(ratio*adv[ids], ratio.clamp(.8, 1.2)*adv[ids])*mask).sum()/mask.sum().clamp_min(1)
                entropy = (self.log_std+.5*math.log(2*math.pi*math.e)).sum()
                actor_loss = policy_loss-.0005*entropy
                assert torch.isfinite(actor_loss)
                self.actor_optim.zero_grad()
                actor_loss.backward()
                nn.utils.clip_grad_norm_([*self.actor.parameters(), self.log_std], .5)
                self.actor_optim.step()
                with torch.no_grad():
                    for parameter in self.actor.parameters():
                        parameter.clamp_(-8, 8)
                    self.log_std.clamp_(math.log(.01), math.log(.7))
                critic_loss = .5*(self.critic(x[ids]).squeeze(-1)-returns[ids]).square().mean()
                assert torch.isfinite(critic_loss)
                self.critic_optim.zero_grad()
                critic_loss.backward()
                nn.utils.clip_grad_norm_(self.critic.parameters(), 1)
                self.critic_optim.step()
                actor_losses.append(actor_loss.item())
                critic_losses.append(critic_loss.item())
            with torch.no_grad():
                delta = log_prob(action, self.actor(x), self.log_std)-old_logp
                kl = (((delta.clamp(-20, 20).exp()-1)-delta)*active).sum()/active.sum()
                kls.append(kl.item())
            if kl > .03:
                break
        return {'nodeTorchMaxMeanError': mean_error, 'actorLoss': sum(actor_losses)/len(actor_losses), 'criticLoss': sum(critic_losses)/len(critic_losses), 'epochKL': kls, 'std': self.std(), 'weights': self.weights(), 'criticSha256': self.critic_hash(), 'actualTransitions': len(rows)}
