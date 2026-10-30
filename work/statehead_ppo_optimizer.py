"""Research PPO optimizer with a gradient-aligned Adam momentum recovery."""
import math

import torch


def optimize(actor, advantages, state, epochs, rate_scale=1.0):
    if not math.isfinite(rate_scale) or rate_scale <= 0:
        raise ValueError('A positive finite optimizer rate scale is required')
    params = [actor.motor, actor.variance]
    base = torch.cat([parameter.detach() for parameter in params]).clone()
    best = base.clone()
    best_score = -float('inf')
    m = actor.tensor(state['m'])
    v = actor.tensor(state['v'])
    t = state['t']
    history = []
    gain = actor.metadata['motorGain']
    sigma = actor.exploration['initial']
    rates = actor.tensor([3 * sigma[0] / (.2 * gain), 3 * sigma[1] / gain] * 9 + [1.] * 20) * (.03 * rate_scale)

    def assign(vector):
        with torch.no_grad():
            actor.motor.copy_(vector[:18])
            actor.variance.copy_(vector[18:])

    advantages = actor.tensor(advantages)
    for epoch in range(epochs):
        for parameter in params:
            parameter.grad = None
        score, _ = actor.objective(advantages)
        (-score).backward()
        gradient = -torch.cat([parameter.grad for parameter in params])
        before = torch.cat([parameter.detach() for parameter in params]).clone()

        t += 1
        m = .9 * m + .1 * gradient
        v = .999 * v + .001 * gradient * gradient

        def adam_direction(moment, square_moment, step):
            return rates * (moment / (1 - .9 ** step)) / (
                (square_moment / (1 - .999 ** step)).sqrt() + 1e-8)

        delta = adam_direction(m, v, t)
        alignment = torch.dot(gradient, delta)
        momentum_reset = float(alignment) <= 0.0
        if momentum_reset:
            # Old momentum can point against the current policy gradient after
            # an unsafe rollout changes the sampled-state distribution.
            m = gradient.detach().clone()
            v = gradient.detach().square().clone()
            t = 1
            delta = adam_direction(m, v, t)

        accepted = None
        for fraction in [1., .5, .25, .125, .0625]:
            proposal = (before + fraction * delta).clamp(-8, 8)
            assign(proposal)
            with torch.no_grad():
                value, kl = actor.objective(advantages)
            if float(kl) <= .02 and float(value) >= float(score.detach()) - 1e-12:
                accepted = {
                    'epoch': epoch + 1,
                    'fraction': fraction,
                    'score': float(value),
                    'kl': float(kl),
                    'gradientNorm': float(gradient.norm()),
                    'momentumReset': momentum_reset,
                    'preResetGradientAlignment': float(alignment),
                }
                if float(value) > best_score:
                    best_score = float(value)
                    best = proposal.clone()
                break

        if accepted is None and not momentum_reset:
            # If aligned momentum still fails backtracking, retry once with a
            # fresh Adam direction before treating this batch as a no-op.
            m = gradient.detach().clone()
            v = gradient.detach().square().clone()
            t = 1
            delta = adam_direction(m, v, t)
            for fraction in [1., .5, .25, .125, .0625]:
                proposal = (before + fraction * delta).clamp(-8, 8)
                assign(proposal)
                with torch.no_grad():
                    value, kl = actor.objective(advantages)
                if float(kl) <= .02 and float(value) >= float(score.detach()) - 1e-12:
                    accepted = {
                        'epoch': epoch + 1,
                        'fraction': fraction,
                        'score': float(value),
                        'kl': float(kl),
                        'gradientNorm': float(gradient.norm()),
                        'momentumReset': True,
                        'preResetGradientAlignment': float(alignment),
                    }
                    if float(value) > best_score:
                        best_score = float(value)
                        best = proposal.clone()
                    break

        if accepted is None:
            assign(before)
            break
        history.append(accepted)

    assign(best if history else base)
    return {'m': m.detach().cpu().tolist(), 'v': v.detach().cpu().tolist(), 't': t}, history
