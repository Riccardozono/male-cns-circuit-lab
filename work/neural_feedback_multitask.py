"""Two actual-reset objectives with a shared, checked ascent direction.

Reset categories affect training gradients only. The driving policy still sees
the same518 actual neuronal/own-command observations and no category label.
"""
import torch
from neural_feedback_ar1 import conditional,conditional_kl


def update_actor(actor,x,px,pz,mask,actions,oldlog,oldcenter,oldstd,advantages,cold,steps=8):
    parameters=list(actor.parameters());cold=cold.bool();groups=[cold,~cold]
    if not all(bool(group.any()) for group in groups):
        raise ValueError('Both physically sampled reset categories are required')
    def objectives():
        d=conditional(actor,x,px,pz,mask);ratio=(d.log_prob(actions).sum(-1)-oldlog).exp()
        gain=torch.minimum(ratio*advantages,ratio.clamp(.8,1.2)*advantages)
        kl=conditional_kl(oldcenter,oldstd,d)
        return [gain[g].mean() for g in groups],[kl[g].mean() for g in groups]
    def flat_grad(value,retain):
        gradients=torch.autograd.grad(value,parameters,retain_graph=retain)
        return torch.cat([g.flatten() for g in gradients])
    def vector():return torch.cat([p.detach().flatten() for p in parameters])
    def assign(v):
        offset=0
        with torch.no_grad():
            for p in parameters:
                n=p.numel();p.copy_(v[offset:offset+n].view_as(p));offset+=n
    records=[]
    for step in range(steps):
        old,oldkl=objectives();ga=flat_grad(old[0],True);gb=flat_grad(old[1],False)
        # Positive diagonal scaling, followed by a minimum-norm convex mixture
        # in the scaled coordinates, gives a common ascent direction whenever
        # one exists. It is not a hand-specified throttle/steering direction.
        inverse_scale=(.5*(ga.square()+gb.square())+1e-8).rsqrt()
        qa=ga*inverse_scale.sqrt();qb=gb*inverse_scale.sqrt();difference=qa-qb
        denominator=difference.square().sum()
        alpha=((qb.square().sum()-torch.dot(qa,qb))/denominator.clamp_min(1e-20)).clamp(0,1)
        direction=inverse_scale*(alpha*ga+(1-alpha)*gb)
        norm=direction.norm();direction=direction*(.005/norm.clamp_min(1e-20))
        slopes=[float(torch.dot(ga,direction)),float(torch.dot(gb,direction))]
        if min(slopes)<-1e-7:raise AssertionError('Claimed common gradient is descending on an actual objective')
        before=vector();oldvalues=[float(v.detach()) for v in old];accepted=0.;newvalues=oldvalues;newkl=[float(k.detach()) for k in oldkl]
        for fraction in [1.,.5,.25,.125,.0625,.03125,.015625,.0078125,.00390625,0.]:
            assign(before+fraction*direction)
            with torch.no_grad():
                values,kls=objectives();newvalues=[float(v) for v in values];newkl=[float(k) for k in kls]
            if all(torch.isfinite(torch.tensor(newvalues+newkl))) and min(v-o for v,o in zip(newvalues,oldvalues))>=-2e-7 and max(newkl)<=.0100001:
                accepted=fraction;break
        if accepted==0.:
            assign(before)
            with torch.no_grad():values,kls=objectives();newvalues=[float(v) for v in values];newkl=[float(k) for k in kls]
        records.append({'step':step+1,'coldWeight':float(alpha),'predictedGroupSlopes':slopes,'acceptedFraction':accepted,
                        'beforeGroupSurrogates':oldvalues,'afterGroupSurrogates':newvalues,'postGroupMeanKL':newkl})
        if accepted==0.:break
    return records
