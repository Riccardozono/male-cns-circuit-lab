"""Private trainable nonlinear motor decoder, unchanged neuronal inputs and PPO."""
import hashlib
import json
import math
import torch
from torch import nn

def log_prob(action, mean, log_std):
    return (-.5*((action-mean)/log_std.exp())**2-log_std-.5*math.log(2*math.pi)).sum(-1)

def advantages(rewards, dones, values, next_values, gamma=1, lam=.98):
    if rewards.ndim != 2:
        raise ValueError('Separate environment-major rollout required')
    result = torch.zeros_like(rewards)
    for lane in range(len(rewards)):
        gae = torch.zeros((), dtype=rewards.dtype)
        for k in reversed(range(rewards.shape[1])):
            mask = 1-dones[lane, k]
            delta = rewards[lane, k]+gamma*next_values[lane, k]*mask-values[lane, k]
            gae = delta+gamma*lam*mask*gae
            result[lane, k] = gae
    return result


class NonlinearActor(nn.Module):
    hidden_units = 64

    def __init__(self, linear, packed, dimension):
        super().__init__()
        self.linear = linear
        with torch.random.fork_rng():
            self.hidden = nn.Linear(dimension, self.hidden_units, dtype=torch.float64)
            self.output = nn.Linear(self.hidden_units, 2, dtype=torch.float64)
        expected = dimension*2+self.hidden_units*dimension+self.hidden_units+2*self.hidden_units+2
        if len(packed) != expected or any(not math.isfinite(v) or abs(v) > 8 for v in packed):
            raise ValueError('Private nonlinear parameter layout required')
        cursor = dimension*2
        with torch.no_grad():
            for parameter in [self.hidden.weight, self.hidden.bias, self.output.weight, self.output.bias]:
                n = parameter.numel()
                parameter.copy_(torch.tensor(packed[cursor:cursor+n], dtype=torch.float64).reshape(parameter.shape))
                cursor += n
        assert cursor == len(packed)

    def forward(self, x):
        return self.linear(x)+self.output(torch.tanh(self.hidden(x)))

    def packed(self):
        return self.linear.weight.detach().T.flatten().tolist()+[
            v for p in [self.hidden.weight, self.hidden.bias, self.output.weight, self.output.bias]
            for v in p.detach().flatten().tolist()
        ]

class Learner:
    def __init__(self, initial_weights, dimension, seed=171026):
        torch.set_num_threads(2)
        torch.use_deterministic_algorithms(True)
        torch.manual_seed(seed)
        self.dimension = dimension
        self.actor = nn.Linear(dimension, 2, bias=False, dtype=torch.float64)
        with torch.no_grad():
            self.actor.weight.copy_(torch.tensor(initial_weights[:dimension*2], dtype=torch.float64).reshape(dimension, 2).T)
        self.critic = nn.Sequential(nn.Linear(dimension, 64, dtype=torch.float64), nn.Tanh(), nn.Linear(64, 64, dtype=torch.float64), nn.Tanh(), nn.Linear(64, 1, dtype=torch.float64))
        self.log_std = nn.Parameter(torch.tensor([math.log(.02), math.log(.02)], dtype=torch.float64))
        self.actor = NonlinearActor(self.actor, initial_weights, dimension)
        self.actor_optim = torch.optim.Adam([*self.actor.parameters(), self.log_std], lr=.0003)
        self.critic_optim = torch.optim.Adam(self.critic.parameters(), lr=.001)

    def weights(self):
        return self.actor.packed()

    def std(self):
        return self.log_std.detach().exp().tolist()

    def critic_hash(self):
        values = {k: v.detach().tolist() for k, v in self.critic.state_dict().items()}
        return hashlib.sha256(json.dumps(values, separators=(',', ':')).encode()).hexdigest()

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
