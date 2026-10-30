"""Same calibrated actor/critic; full within-segment reward credit (lambda1)."""
import math
import torch
from torch import nn
from direct_neuronal_ppo import log_prob, advantages as base_advantages
from direct_neuronal_ppo_calibrated import Learner as Calibrated

def advantages(rewards,dones,values,next_values):
    return base_advantages(rewards,dones,values,next_values,gamma=1,lam=1)

class Learner(Calibrated):
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
