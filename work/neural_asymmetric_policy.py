"""TD3 actor cannot read training-only critic columns, including at export."""
import torch
from stable_baselines3.td3.policies import TD3Policy,Actor
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor


class NeuronalOnly(BaseFeaturesExtractor):
    def __init__(self,observation_space):
        super().__init__(observation_space,features_dim=521)
    def forward(self,observations):
        if observations.shape[-1]!=557:
            raise ValueError('Explicit557column training observation required')
        return observations[...,:521]


class AsymmetricTD3Policy(TD3Policy):
    def make_actor(self,features_extractor=None):
        # The critic keeps the policy's ordinary full557column extractor.
        extractor=NeuronalOnly(self.observation_space)
        kwargs=self._update_features_extractor(self.actor_kwargs,extractor)
        return Actor(**kwargs).to(self.device)


def import_actor(model,numeric):
    layers=[m for m in model.actor.mu if isinstance(m,torch.nn.Linear)]
    if numeric['dimensions']!=[521,64,64,2] or len(layers)!=3:
        raise ValueError('Strict neuronal-only numerical actor required')
    with torch.no_grad():
        for layer,data in zip(layers,numeric['layers']):
            w=torch.tensor(data['weights'],dtype=torch.float32,device=model.device);b=torch.tensor(data['bias'],dtype=torch.float32,device=model.device)
            if w.shape!=layer.weight.shape or b.shape!=layer.bias.shape:raise ValueError('Numeric actor shape mismatch')
            layer.weight.copy_(w);layer.bias.copy_(b)
        model.actor_target.load_state_dict(model.actor.state_dict())


def numeric_actor(model):
    layers=[m for m in model.actor.mu if isinstance(m,torch.nn.Linear)]
    if len(layers)!=3 or layers[0].in_features!=521:
        raise ValueError('No privileged signals may enter exported actor')
    return {'dimensions':[521,64,64,2],'layers':[{'activation':'relu' if i<2 else 'tanh-unscale','weights':m.weight.detach().cpu().tolist(),'bias':m.bias.detach().cpu().tolist()} for i,m in enumerate(layers)]}
