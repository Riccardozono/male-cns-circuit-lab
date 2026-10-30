"""Output-wise parameter exploration, not hand-authored driving commands."""
import numpy as np

def propose(archive, random, population=16):
    champion = archive['champion']
    if not 4 <= population <= 100 or len(champion['weights']) != 18:
        raise ValueError('Observed18-parameter archive and bounded population required')
    cells = archive['cells']
    furthest = max(row['progress'] for row in cells)
    frontier = [row for row in cells if row['progress'] >= furthest - 150]
    candidates = [{'weights': champion['weights'][:], 'kind': 'protected-champion'}]
    pair = 0
    while len(candidates) < population:
        parent = champion if random.random() < .7 else frontier[int(random.integers(len(frontier)))]
        mode = ['longitudinal', 'longitudinal', 'steering', 'joint'][pair % 4]
        sigma = float(random.choice([.02, .05, .1, .2, .5, 1., 2.]))
        delta = random.normal(0, sigma, 18)
        if mode == 'longitudinal':
            delta[0::2] = 0
        elif mode == 'steering':
            delta[1::2] = 0
            delta[0::2] *= .15
        else:
            delta[0::2] *= .15
        for sign in [1, -1]:
            if len(candidates) >= population:
                break
            weights = np.clip(np.asarray(parent['weights']) + sign * delta, -8, 8).tolist()
            candidates.append({'weights': weights, 'kind': 'block-antithetic-mutation', 'block': mode,
                               'pair': pair, 'sign': sign, 'sigma': sigma, 'parentWeights': parent['weights'][:],
                               'parentProgress': parent['progress']})
        pair += 1
    return candidates
