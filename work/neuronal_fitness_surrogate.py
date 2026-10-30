"""Parameter-to-measured-fitness model used ONLY to propose physical trials."""
import hashlib
import json
import math
import torch

torch.set_num_threads(2)
torch.use_deterministic_algorithms(True)
DTYPE = torch.float64

def key(genes):
    if len(genes) != 18 or any(not math.isfinite(v) or abs(v) > 8 for v in genes):
        raise ValueError('Eighteen bounded actual feedback weights required')
    return json.dumps([0.0 if v == 0 else float(v) for v in genes], separators=(',', ':'))

def dataset(rows):
    unique = {}
    for row in rows:
        e = row['episode']
        if not e['complete'] or e['censored'] or e['overlap'] or not math.isfinite(e['result']['fitness']):
            raise ValueError('Actual completed finite episode required')
        k = key(row['genes'])
        if k in unique and (unique[k]['episode']['result']['fitness'] != e['result']['fitness'] or unique[k]['episode']['actionTraceSha256'] != e['actionTraceSha256']):
            raise ValueError('Repeated actual genotype must have identical score and commands')
        unique.setdefault(k, row)
    return [unique[k] for k in sorted(unique)]

def partition(rows):
    groups = [[], [], []]
    for row in rows:
        bucket = int(hashlib.sha256(key(row['genes']).encode()).hexdigest()[:8], 16) % 10
        groups[0 if bucket < 6 else 1 if bucket < 8 else 2].append(row)
    if min(map(len, groups)) < 10:
        raise ValueError('Independent unique-genotype train/validation/test partitions required')
    return groups

class Model:
    def __init__(self, rows, length=.5, ridge=.01):
        self.length, self.ridge = length, ridge
        self.raw = torch.tensor([r['genes'] for r in rows], dtype=DTYPE)
        self.mean = self.raw.mean(0)
        self.scale = self.raw.std(0, unbiased=False).clamp_min(.01)
        self.x = (self.raw-self.mean)/self.scale
        y = torch.tensor([r['episode']['result']['fitness'] for r in rows], dtype=DTYPE)
        self.ymean = y.mean()
        self.yscale = y.std(unbiased=False).clamp_min(1)
        self.chol = torch.linalg.cholesky(self.kernel(self.x, self.x)+ridge*torch.eye(len(rows), dtype=DTYPE))
        self.alpha = torch.cholesky_solve(((y-self.ymean)/self.yscale)[:, None], self.chol)

    def kernel(self, x, y):
        distance = torch.cdist(x, y, compute_mode='donot_use_mm_for_euclid_dist')
        return torch.exp(-.5*(distance/(math.sqrt(18)*self.length))**2)

    def predict(self, genes):
        x = (torch.tensor(genes, dtype=DTYPE)-self.mean)/self.scale
        k = self.kernel(x, self.x)
        mean = self.ymean+self.yscale*(k@self.alpha)[:, 0]
        solved = torch.linalg.solve_triangular(self.chol, k.T, upper=False)
        uncertainty = (1-solved.square().sum(0)).clamp_min(0).sqrt()*self.yscale
        return mean, uncertainty

def mae(model, rows):
    pred, _ = model.predict([r['genes'] for r in rows])
    actual = torch.tensor([r['episode']['result']['fitness'] for r in rows], dtype=DTYPE)
    return (pred-actual).abs().mean().item()

def calibrate(rows):
    rows = dataset(rows)
    train, validation, test = partition(rows)
    choices = []
    for length in [.25, .5, 1, 2]:
        for ridge in [.0001, .01, .1]:
            model = Model(train, length, ridge)
            choices.append({'length': length, 'ridge': ridge, 'validationMAE': mae(model, validation)})
    best = min(choices, key=lambda c: c['validationMAE'])
    fitted = Model(train+validation, best['length'], best['ridge'])
    constant = sum(r['episode']['result']['fitness'] for r in train+validation)/len(train+validation)
    baseline_mae = sum(abs(r['episode']['result']['fitness']-constant) for r in test)/len(test)
    test_mae = mae(fitted, test)
    return {'uniqueGenotypes': len(rows), 'train': len(train), 'validation': len(validation), 'test': len(test), 'partitions': [[hashlib.sha256(key(r['genes']).encode()).hexdigest() for r in g] for g in [train, validation, test]], 'choices': choices, 'selected': best, 'testMAE': test_mae, 'constantTestMAE': baseline_mae, 'eligibleForPhysicalTrial': test_mae < .9*baseline_mae, 'boundary': 'Test genotypes not used for hyperparameter choice; duplicate genotypes grouped before splitting. Retrospective fitness prediction, not independent driving or calibrated safety probability.'}

def propose(rows, champion, length, ridge, seed, count=16):
    rows = dataset(rows)
    model = Model(rows, length, ridge)
    generator = torch.Generator().manual_seed(seed)
    best = sorted(rows, key=lambda r: r['episode']['result']['fitness'], reverse=True)[:8]
    frontier = sorted(rows, key=lambda r: r['episode']['result']['bestProgress'], reverse=True)[:8]
    parents = [champion]+[r['genes'] for r in best+frontier]
    indices = torch.randint(len(parents), (4096,), generator=generator)
    centres = torch.tensor(parents, dtype=DTYPE)[indices]
    scales = torch.tensor([.01, .03, .1, .3, .6], dtype=DTYPE)[torch.randint(5, (4096,), generator=generator)]
    noise = torch.randn((4096, 18), generator=generator, dtype=DTYPE)*scales[:, None]
    noise[:, ::2] *= .25
    pool = (centres+noise).clamp(-8, 8)
    mean, uncertainty = model.predict(pool.tolist())
    acquisition = mean+1.5*uncertainty
    result = [{'genes': champion[:], 'kind': 'protected-actual-champion'}]
    seen = {key(r['genes']) for r in rows}
    chosen = []
    for index in torch.argsort(acquisition, descending=True, stable=True).tolist():
        genes = pool[index].tolist()
        k = key(genes)
        normalized = (pool[index]-model.mean)/model.scale
        if k in seen or any(torch.linalg.vector_norm(normalized-prev).item() < .05 for prev in chosen):
            continue
        chosen.append(normalized)
        seen.add(k)
        result.append({'genes': genes, 'kind': 'surrogate-proposal-not-a-measured-score', 'predictedFitness': mean[index].item(), 'kernelUncertainty': uncertainty[index].item(), 'acquisition': acquisition[index].item()})
        if len(result) == count:
            return result
    raise RuntimeError('Insufficient distinct bounded candidates')
