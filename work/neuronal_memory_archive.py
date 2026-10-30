"""Keep exploration parents separate from the safe official-score champion."""
import copy
import math
import random

UNSAFE = ('urto', 'fuori pista', 'progresso non valido')

def clean(row):
    return not any(s in row['episode']['result']['reason'] for s in UNSAFE)

def valid(row):
    e = row['episode']
    return (len(row['genes']) == 9 and all(math.isfinite(x) and abs(x) <= 8 for x in row['genes'])
            and e['complete'] and not e['censored'] and e['overlap'] == 0
            and all(math.isfinite(e['result'][k]) for k in ('bestProgress', 'fitness', 'laps')))

class Archive:
    def __init__(self, baseline, seed=201026):
        if not valid(baseline) or not clean(baseline):
            raise ValueError('Actual clean baseline required')
        self.random = random.Random(seed)
        self.cells = {}
        self.champion = copy.deepcopy(baseline)
        self.offers = 0
        self.offer(baseline)

    def offer(self, row):
        if not valid(row) or 'progresso non valido' in row['episode']['result']['reason']:
            raise ValueError('Actual complete finite physical candidate required')
        self.offers += 1
        r = row['episode']['result']
        key = (math.floor(r['bestProgress']/5), clean(row))
        old = self.cells.get(key)
        if old is None or r['fitness'] > old['episode']['result']['fitness']:
            self.cells[key] = copy.deepcopy(row)
        c = self.champion['episode']['result']
        if clean(row) and r['fitness'] > c['fitness']+1e-6 and r['bestProgress'] >= c['bestProgress'] and r['laps'] >= c['laps']:
            self.champion = copy.deepcopy(row)

    def ask(self):
        ordered = sorted(self.cells.values(), key=lambda row: (row['episode']['result']['bestProgress'], row['episode']['result']['fitness']), reverse=True)
        frontier = ordered[:min(8, len(ordered))]
        furthest = ordered[0]
        batch = [{'genes': self.champion['genes'][:], 'kind': 'protected-clean-champion'},
                 {'genes': furthest['genes'][:], 'kind': 'actually-reevaluated-frontier'}]
        scales = [.01, .03, .1, .3, 1]
        for pair in range(7):
            parent = self.champion if pair == 6 else self.random.choice(frontier)
            block = ['steering', 'steering', 'longitudinal', 'retention', 'joint', 'steering', 'joint'][pair]
            sigma = self.random.choice(scales)
            delta = []
            for j in range(9):
                allowed = block == 'joint' or block == 'steering' and j < 6 and j % 2 == 0 or block == 'longitudinal' and j < 6 and j % 2 == 1 or block == 'retention' and j >= 6
                delta.append(self.random.gauss(0, sigma)*(0.15 if j < 6 and j % 2 == 0 else 1) if allowed else 0)
            for sign in [1, -1]:
                batch.append({'genes': [max(-8, min(8, v+sign*d)) for v, d in zip(parent['genes'], delta)], 'kind': 'archive-block-antithetic', 'parentGenes': parent['genes'][:], 'parentProgress': parent['episode']['result']['bestProgress'], 'block': block, 'sigma': sigma, 'sign': sign})
        assert len(batch) == 16
        return batch

    def snapshot(self):
        return {'offers': self.offers, 'champion': self.champion, 'cells': [{'bin': key[0], 'clean': key[1], 'row': value} for key, value in sorted(self.cells.items())], 'randomState': self.random.getstate()}
