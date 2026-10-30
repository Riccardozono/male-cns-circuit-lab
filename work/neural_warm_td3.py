"""TD3 from an actually learned source policy, not uniform random warm-up."""
from stable_baselines3 import TD3


class WarmAsymmetricTD3(TD3):
    def _sample_action(self,learning_starts,action_noise=None,n_envs=1):
        return super()._sample_action(0,action_noise,n_envs)

    def _update_learning_rate(self,optimizers):
        super()._update_learning_rate(optimizers)
        # Explicit experimental profile: actor2e-5, critic1e-4. This does not
        # claim an isolated causal comparison with any preceding SAC run.
        for group in self.actor.optimizer.param_groups:
            group['lr']=self.lr_schedule(self._current_progress_remaining)*.2
