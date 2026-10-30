"""Paired physical comparisons assign credit to one learned coefficient at a time."""
import copy
import math

def improves(row, reference):
    e, r = row['episode'], row['episode']['result']
    return (e['complete'] and not e['censored'] and e['overlap'] == 0
            and not any(x in r['reason'] for x in ('urto', 'fuori pista', 'progresso non valido'))
            and r['fitness'] > reference['fitness']+1e-6 and r['bestProgress'] >= reference['bestProgress'] and r['laps'] >= reference['laps'])

class Search:
    def __init__(self, genes):
        if len(genes) != 18 or any(not math.isfinite(x) or abs(x) > 8 for x in genes):
            raise ValueError('Eighteen bounded feedback coefficients required')
        self.genes = genes[:]
        self.radius = .02
        self.updates = 0

    def ask(self, indices):
        if not indices or len(indices) > 4 or len(set(indices)) != len(indices) or any(not 0 <= i < 18 for i in indices):
            raise ValueError('Up to four distinct coefficient axes required')
        proposals = [{'genes': self.genes[:], 'kind': 'actually-reevaluated-clean-champion'}]
        for index in indices:
            for sign in [1, -1]:
                genes = self.genes[:]
                genes[index] = max(-8, min(8, genes[index]+sign*self.radius*(.25 if index % 2 == 0 else 1)))
                proposals.append({'genes': genes, 'kind': 'single-coordinate-physical-comparison', 'index': index, 'sign': sign, 'radius': self.radius})
        return proposals

    def tell(self, evaluated, reference):
        selected = None
        for row in evaluated:
            if improves(row, selected['episode']['result'] if selected else reference):
                selected = row
        if selected:
            self.genes = selected['genes'][:]
            self.updates += 1
        return copy.deepcopy(selected)

    def finish_cycle(self, improved):
        self.radius = min(.16, self.radius*1.5) if improved else max(.0005, self.radius/2)

    def snapshot(self):
        return {'genes': self.genes[:], 'radius': self.radius, 'updates': self.updates}
