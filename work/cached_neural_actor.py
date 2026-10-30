"""Exact motor/variance likelihood on recorded features with frozen encoder.

Fresh physical episodes still run the real recurrent MaleCNS. Reuse is valid
only when the first72 native coefficients remain unchanged. No sensory shortcut
is installed in the simulator or deterministic inference path.
"""
import torch
from learned_neural_exploration import scale


class CachedActor:
    def __init__(self, metadata, episodes, exploration, device='cuda:0', boundary='full-episode'):
        if boundary not in ['full-episode','recorded-chunk']:raise ValueError('Explicit AR1 boundary required')
        self.device=device;self.metadata=metadata;self.exploration=exploration
        self.tensor=lambda x:torch.tensor(x,dtype=torch.float64,device=device)
        baseline=metadata['genome']['policyWeights'];offset=metadata['graph']['readoutOffset']
        if offset!=72 or len(baseline)!=202:raise ValueError('Native V3 mean layout required')
        self.motor=torch.nn.Parameter(self.tensor(baseline[offset:]))
        self.variance=torch.nn.Parameter(self.tensor(exploration['weights']))
        rows=[];previous_rows=[];boundary_mean=[];boundary_sigma=[];boundary_action=[];factors=[]
        for episode in episodes:
            if episode['behaviorWeights'][:offset]!=baseline[:offset] or episode['exploration']!=exploration:
                raise ValueError('Cannot cache a changed encoder or behavior variance family')
            previous_index=None
            expected_start=0
            for chunk in episode['chunks']:
                if boundary=='full-episode' and chunk['startControl']!=expected_start:
                    raise ValueError('Full-episode likelihood requires contiguous history from control zero')
                expected_start+=len(chunk['rows'])
                for j,row in enumerate(chunk['rows']):
                    prior=chunk.get('previousPolicyState') if j==0 and boundary=='recorded-chunk' else None
                    if j==0 and boundary=='recorded-chunk':previous_index=None
                    i=len(rows);rows.append(row)
                    previous_rows.append(previous_index if previous_index is not None else i)
                    boundary_mean.append(prior['mean'] if prior else row['mean'])
                    boundary_sigma.append(prior['sigma'] if prior else row['sigma'])
                    boundary_action.append(prior['action'] if prior else row['action'])
                    factors.append(exploration['rho'] if previous_index is not None or prior else 0.)
                    previous_index=i
        self.rows=rows;self.features=self.tensor([r['features'] for r in rows]);self.actions=self.tensor([r['action'] for r in rows])
        self.mask=self.tensor([r['active'] for r in rows]);self.count=self.mask.sum()
        self.previous=torch.tensor(previous_rows,dtype=torch.int64,device=device)
        self.external=torch.tensor([i==p for i,p in enumerate(previous_rows)],dtype=torch.bool,device=device)[:,None]
        self.external_mean=self.tensor(boundary_mean);self.external_sigma=self.tensor(boundary_sigma);self.external_action=self.tensor(boundary_action)
        self.rho=self.tensor(factors)[:,None]
        self.old_mean=self.tensor([r['conditionalMean'] for r in rows]);self.old_std=self.tensor([r['conditionalStd'] for r in rows])
        self.old_logp=(-.5*((self.actions-self.old_mean)/self.old_std)**2-self.old_std.log()).sum(-1)

    def distribution(self):
        logits=(self.features@self.motor[:-2].reshape(64,2)/8+self.motor[-2:])*self.mask[:,None]
        sigma=scale(self.features,self.exploration,self.variance)
        previous_mean=torch.where(self.external,self.external_mean,logits[self.previous])
        previous_sigma=torch.where(self.external,self.external_sigma,sigma[self.previous])
        previous_action=torch.where(self.external,self.external_action,self.actions[self.previous])
        return logits+self.rho*sigma*(previous_action-previous_mean)/previous_sigma,sigma*torch.sqrt(1-self.rho*self.rho)

    def objective(self, advantages, clipped=True):
        mean,std=self.distribution();logp=(-.5*((self.actions-mean)/std)**2-std.log()).sum(-1)
        a=advantages if isinstance(advantages,torch.Tensor) else self.tensor(advantages)
        ratio=(logp-self.old_logp).clamp(-20,20).exp()
        value=torch.minimum(ratio*a,ratio.clamp(.8,1.2)*a) if clipped else logp*a
        kl=(std.log()-self.old_std.log()+(self.old_std**2+(self.old_mean-mean)**2)/(2*std**2)-.5).sum(-1)
        return (value*self.mask).sum()/self.count,(kl*self.mask).sum()/self.count

    def native_weights(self):
        return self.metadata['genome']['policyWeights'][:72]+self.motor.detach().cpu().tolist()

    def exploration_config(self):
        return {**self.exploration,'weights':self.variance.detach().cpu().tolist()}
