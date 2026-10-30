"""Fit fixed decoder preprocessing on the first actual control rollout only."""
import json
import torch
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash

if __name__ == '__main__':
    torch.set_num_threads(2)
    d = ROOT/'.impeccable/review/neural-sacl/direct-neuronal-ppo64-from-line-r7'
    source = d/'rollout-001.json'
    target = ROOT/'.impeccable/review/neural-sacl/direct-neuronal-scaler.json'
    assert not target.exists()
    proof = json.loads((d/'verification.json').read_text())
    assert proof['passed'] and file_hash(source) == proof['recordHashes'][source.name]
    r = json.loads(source.read_text())
    x = torch.tensor([row['x'] for batch in r['environments'] for row in batch['rows']], dtype=torch.float64)
    assert x.shape == (1024,77) and torch.all(x[:,-1] == 1)
    center, scale = x.mean(dim=0), x.std(dim=0,unbiased=False).clamp_min(.02)
    center[-1], scale[-1] = 0, 1
    normalized = ((x-center)/scale).clamp(-5,5)
    w = torch.tensor([((i*37+11)%101-50)/500 for i in range(64*77)],dtype=torch.float64).reshape(64,77)
    b = torch.tensor([((i*13)%23-11)/100 for i in range(64)],dtype=torch.float64)
    data = {'format':'male-cns-fixed-neuronal-decoder-scaler-v1','dimension':77,'center':center.tolist(),'scale':scale.tolist(),'clip':5,'stdFloor':.02,'actualFitTransitions':1024,'sourceSha256':file_hash(source),'sourcePath':source.relative_to(ROOT).as_posix(),'scriptSha256':file_hash(__file__),
            'initialHiddenStdMedianBefore':(x@w.T+b).tanh().std(dim=0,unbiased=False).median().item(),'initialHiddenStdMedianAfter':(normalized@w.T+b).tanh().std(dim=0,unbiased=False).median().item(),
            'boundary':'Unsupervised fixed preprocessing from first1024actual control training observations; no actions, rewards, route, pose or evaluation data fitted. Floor .02 and clip5 are declared experiment settings. Original linear path uses raw inputs, preserving initial policy exactly.'}
    atomic_json(target,data)
    print(json.dumps({k:v for k,v in data.items() if k not in ['center','scale']}))
