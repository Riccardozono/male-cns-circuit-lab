"""Experimental online TD3 with an explicit own-replay behavior regularizer.

Train-loop adaptation of Stable Baselines3 TD3 (MIT, Antonin Raffin2019).
Full license: licenses/SB3-MIT.txt. Regularizer follows the TD3+BC objective,
https://arxiv.org/abs/2106.06860, but this experiment also collects online data;
it is not a reproduction of the paper's offline benchmark or its results.
"""
import numpy as np
import torch
from stable_baselines3.common.utils import polyak_update
from neural_warm_td3 import WarmAsymmetricTD3


def replay_objective(predicted,q,actual_actions,alpha=2.5):
    if predicted.shape!=actual_actions.shape or q.shape!=(*predicted.shape[:-1],1) or not .1<=alpha<=10:
        raise ValueError('Matching own recorded actions and bounded regularization required')
    scale=alpha/q.detach().abs().mean().clamp_min(1e-6)
    deviation=torch.nn.functional.mse_loss(predicted,actual_actions.detach())
    return -scale*q.mean()+deviation,scale,deviation


class ReplayRegularizedTD3(WarmAsymmetricTD3):
    def __init__(self,*args,replay_alpha=2.5,**kwargs):
        self.replay_alpha=replay_alpha;self.regularization_history=[]
        if not .1<=replay_alpha<=10:raise ValueError('Bounded actual-replay regularizer required')
        super().__init__(*args,**kwargs)

    def train(self,gradient_steps,batch_size=100):
        self.policy.set_training_mode(True)
        self._update_learning_rate([self.actor.optimizer,self.critic.optimizer])
        losses=[];deviations=[];scales=[];actor_losses=[]
        for _ in range(gradient_steps):
            self._n_updates+=1;data=self.replay_buffer.sample(batch_size,env=self._vec_normalize_env)
            discounts=data.discounts if data.discounts is not None else self.gamma
            with torch.no_grad():
                noise=data.actions.clone().normal_(0,self.target_policy_noise).clamp(-self.target_noise_clip,self.target_noise_clip)
                following=(self.actor_target(data.next_observations)+noise).clamp(-1,1)
                future=torch.cat(self.critic_target(data.next_observations,following),dim=1).min(dim=1,keepdim=True).values
                target=data.rewards+(1-data.dones)*discounts*future
            critic_loss=sum(torch.nn.functional.mse_loss(value,target) for value in self.critic(data.observations,data.actions))
            self.critic.optimizer.zero_grad();critic_loss.backward();self.critic.optimizer.step();losses.append(float(critic_loss.detach()))
            if self._n_updates%self.policy_delay==0:
                predicted=self.actor(data.observations);q=self.critic.q1_forward(data.observations,predicted)
                actor_loss,scale,deviation=replay_objective(predicted,q,data.actions,self.replay_alpha)
                self.actor.optimizer.zero_grad();actor_loss.backward();self.actor.optimizer.step()
                polyak_update(self.critic.parameters(),self.critic_target.parameters(),self.tau)
                polyak_update(self.actor.parameters(),self.actor_target.parameters(),self.tau)
                polyak_update(self.critic_batch_norm_stats,self.critic_batch_norm_stats_target,1.)
                polyak_update(self.actor_batch_norm_stats,self.actor_batch_norm_stats_target,1.)
                actor_losses.append(float(actor_loss.detach()));scales.append(float(scale));deviations.append(float(deviation.detach()))
                self.regularization_history.append({'criticUpdate':self._n_updates,'scale':float(scale),'ownReplayActionMSEBeforeUpdate':float(deviation.detach()),'actorLoss':float(actor_loss.detach())})
        self.logger.record('train/n_updates',self._n_updates,exclude='tensorboard');self.logger.record('train/critic_loss',np.mean(losses))
        if actor_losses:
            self.logger.record('train/actor_loss',np.mean(actor_losses));self.logger.record('train/own_replay_action_mse',np.mean(deviations));self.logger.record('train/replay_scale',np.mean(scales))

    def regularization_summary(self):
        rows=self.regularization_history
        return {'alpha':self.replay_alpha,'actorUpdates':len(rows),'maxOwnReplayActionMSE':max((r['ownReplayActionMSEBeforeUpdate'] for r in rows),default=0.),'meanOwnReplayActionMSE':float(np.mean([r['ownReplayActionMSEBeforeUpdate'] for r in rows])) if rows else 0.,
                'boundary':'Penalty toward the agents own actual replay actions, not ideal controls or an external teacher. Not a hard movement/safety constraint; online data means this is not the original offline-only TD3+BC benchmark.'}
