"""Exact likelihood of the protected head's pre-tanh latent action.

Inputs are the9 actual neural/PCA features. Retained gates and the frozen parent
are observed environment history, never a route or desired action. Original18
mean coefficients and20 log-variance coefficients are trainable.
"""
import numpy as np
import torch
from learned_neural_exploration import scale


class StateheadActor:
    def __init__(self,metadata,episodes,weights,exploration,device='cuda:0'):
        self.tensor=lambda x:torch.tensor(x,dtype=torch.float64,device=device)
        self.metadata=metadata;self.exploration=exploration;self.device=device
        self.motor=torch.nn.Parameter(self.tensor(weights));self.variance=torch.nn.Parameter(self.tensor(exploration['weights']))
        if len(weights)!=18 or len(exploration['weights'])!=20:raise ValueError('Explicit18/20 layout required')
        rows=[];indices=[];factors=[]
        for e in episodes:
            if e['behaviorWeights']!=weights or e['exploration']!=exploration:raise ValueError('Matching behavior policy required')
            previous=None
            for row in e['rows']:
                i=len(rows);rows.append(row);indices.append(previous if previous is not None else i)
                factors.append(exploration['rho'] if row['active'] and previous is not None else 0.)
                previous=i if row['active'] else None
        self.rows=rows;self.features=self.tensor([r['features'] for r in rows]);self.mask=self.tensor([r['active'] for r in rows]);self.count=self.mask.sum()
        if float(self.count)<=0:raise ValueError('Actual active head observations required')
        self.actions=self.tensor([r['action'] for r in rows]);self.previous=torch.tensor(indices,dtype=torch.int64,device=device)
        self.rho=self.tensor(factors)[:,None];self.old_mean=self.tensor([r['conditionalMean'] for r in rows]);self.old_std=self.tensor([r['conditionalStd'] for r in rows])
        self.old_logp=(-.5*((self.actions-self.old_mean)/self.old_std)**2-self.old_std.log()).sum(-1)

    def distribution(self):
        mu=(self.features@(self.motor.reshape(9,2)*self.metadata['motorGain']))/3*self.tensor([.2,1.])
        sigma=scale(self.features,self.exploration,self.variance)
        return mu+self.rho*sigma*(self.actions[self.previous]-mu[self.previous])/sigma[self.previous],sigma*torch.sqrt(1-self.rho*self.rho)

    def objective(self,advantages,clipped=True):
        mean,std=self.distribution();a=advantages if isinstance(advantages,torch.Tensor) else self.tensor(advantages)
        logp=(-.5*((self.actions-mean)/std)**2-std.log()).sum(-1)
        ratio=(logp-self.old_logp).clamp(-20,20).exp()
        score=torch.minimum(ratio*a,ratio.clamp(.8,1.2)*a) if clipped else logp*a
        kl=(std.log()-self.old_std.log()+(self.old_std**2+(self.old_mean-mean)**2)/(2*std**2)-.5).sum(-1)
        return (score*self.mask).sum()/self.count,(kl*self.mask).sum()/self.count

    def native_weights(self):return self.motor.detach().cpu().tolist()
    def exploration_config(self):return {**self.exploration,'weights':self.variance.detach().cpu().tolist()}


def advantages(episodes):
    rows=[r for e in episodes for r in e['rows']];rtg=[]
    for e in episodes:
        total=0.;values=[]
        for r in reversed(e['rows']):total+=r['reward'];values.append(total)
        rtg.extend(reversed(values))
    rtg=np.asarray(rtg);features=np.asarray([r['features'] for r in rows]);mask=np.asarray([r['active'] for r in rows],dtype=bool)
    # Features already include an intercept. This critic sees neural features,
    # not reset-mode, position, inherited laps, velocity targets or route.
    penalty=.001*np.eye(9);penalty[0,0]=0
    coefficients=np.linalg.solve(features[mask].T@features[mask]/mask.sum()+penalty,features[mask].T@rtg[mask]/mask.sum())
    value=features@coefficients;raw=rtg-value;a=(raw-raw[mask].mean())/(raw[mask].std()+1e-8)
    return a.tolist(),{'controls':len(rows),'active':int(mask.sum()),'valueMse':float(np.mean(raw[mask]**2)),
                       'returnMin':float(rtg.min()),'returnMax':float(rtg.max()),'advantageMean':float(a[mask].mean()),'advantageStd':float(a[mask].std())}
