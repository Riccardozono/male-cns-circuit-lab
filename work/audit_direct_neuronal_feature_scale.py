"""Empirical scale of actual neuronal policy inputs; no policy edits."""
import json
import torch
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash

if __name__ == '__main__':
    torch.set_num_threads(2)
    d = ROOT/'.impeccable/review/neural-sacl/direct-neuronal-ppo64-from-line-r7'
    target = d/'neuronal-feature-scale-audit.json'
    assert not target.exists()
    verified = json.loads((d/'verification.json').read_text())
    assert verified['passed'] and verified['reportSha256'] == file_hash(d/'report.json')
    blocks = []
    for update in range(1,65):
        name = f'rollout-{update:03}.json'
        assert file_hash(d/name) == verified['recordHashes'][name]
        r = json.loads((d/name).read_text())
        blocks.append(torch.tensor([row['x'] for batch in r['environments'] for row in batch['rows']], dtype=torch.float64))
    x = torch.cat(blocks)
    assert x.shape == (65536,77) and torch.all(x[:,-1] == 1)
    std, mean = x.std(dim=0,unbiased=False), x.mean(dim=0)
    w = torch.tensor([((i*37+11)%101-50)/500 for i in range(64*77)],dtype=torch.float64).reshape(64,77)
    b = torch.tensor([((i*13)%23-11)/100 for i in range(64)],dtype=torch.float64)
    activation = x@w.T+b
    def numbers(t):
        return {'min':t.min().item(),'median':t.median().item(),'max':t.max().item()}
    proof = {'passed':True,'scriptSha256':file_hash(__file__),'sourceReportSha256':verified['reportSha256'],'actualTransitions':len(x),'mean':mean.tolist(),'std':std.tolist(),
             'neuronalStd':numbers(std[:64]),'contextStd':numbers(std[64:76]),'initialHiddenStd':numbers(activation.tanh().std(dim=0,unbiased=False)),
             'initialHiddenAbsArgumentUnder02Fraction':(activation.abs()<.2).double().mean().item(),
             'boundary':'Statistics of actual recorded R7-control experience. The .2 argument threshold is a descriptive choice, not a proof that scaling causes the driving failure. No synthetic driving examples or new observations were generated.'}
    atomic_json(target,proof)
    print(json.dumps({k:v for k,v in proof.items() if k not in ['mean','std']}))
