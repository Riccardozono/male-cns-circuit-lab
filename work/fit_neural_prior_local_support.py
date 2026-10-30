"""Unsupervised compact support in neuronal feature space, no motor targets."""
import json
import torch
from neuronal_experiment_io_retry import ROOT,atomic_json,file_hash

if __name__ == '__main__':
    torch.set_num_threads(2)
    prepared=ROOT/'.impeccable/review/neural-sacl/learned-prior-initial-calibration-r2'
    out=ROOT/'.impeccable/review/neural-sacl/learned-prior-local-support'
    out.mkdir(exist_ok=False)
    p=json.loads((prepared/'physical-verification.json').read_text())
    fit=json.loads((prepared/'fit.json').read_text())
    assert p['passed'] and p['fitSha256']==file_hash(prepared/'fit.json')
    assert fit['dataSha256']==file_hash(prepared/'actual-rollouts.json')
    data=json.loads((prepared/'actual-rollouts.json').read_text())
    scaler=json.loads((prepared/'scaler.json').read_text())
    x=torch.tensor([r['x'] for b in data['blocks'][0] for r in b['rows'][:256]],dtype=torch.float64)
    center=torch.tensor(scaler['center'],dtype=torch.float64)
    scale=torch.tensor(scaler['scale'],dtype=torch.float64)
    groups=[(0,512),(512,514),(514,516),(516,639),(640,642)]
    weights=torch.zeros(642,dtype=torch.float64)
    for a,b in groups:
        weights[a:b]=1/(len(groups)*(b-a))**.5
    z=(x-center)/scale*weights
    centres=[z[0]]
    for k in range(1,8):
        distances=torch.cdist(z,torch.stack(centres)).square().min(dim=1).values
        assert distances.max()>0
        centres.append(z[distances.argmax()])
    centres=torch.stack(centres)
    for _ in range(20):
        assigned=torch.cdist(z,centres).argmin(dim=1)
        centres=torch.stack([z[assigned==k].mean(dim=0) if torch.any(assigned==k) else centres[k] for k in range(8)])
    assigned=torch.cdist(z,centres).argmin(dim=1)
    radii=[]
    for k in range(8):
        selected=z[assigned==k]
        radius=max(.1,1.5*torch.linalg.vector_norm(selected-centres[k],dim=1).quantile(.95).item()) if len(selected) else .1
        radii.append(radius)
    q=torch.cdist(z,centres)/torch.tensor(radii,dtype=torch.float64)
    gates=torch.where(q<1,(1-q).pow(4)*(4*q+1),0).max(dim=1).values
    packet={'format':'male-cns-neuronal-local-support-v1','dimension':642,'groups':[list(g) for g in groups],'featureWeights':weights.tolist(),'normalizationCenter':center.tolist(),'normalizationScale':scale.tolist(),'centres':centres.tolist(),'radii':radii,'fitObservations':len(x),'fitMinGate':gates.min().item(),'fitMeanGate':gates.mean().item(),'fitMaxGate':gates.max().item(),'sourceDataSha256':fit['dataSha256'],'sourceProofSha256':file_hash(prepared/'physical-verification.json'),'scriptSha256':file_hash(__file__),'boundary':'Statistical centroids from actual neuronal observations, not invented physical states or action labels. Five equally weighted neuronal/history/internal-decoder groups avoid domination by repeated neural-history columns. Compact support has no pose, route, clock or lap input. Radius multiplier1.5/q95/min.1 are declared design settings, not evidence of learned driving.'}
    atomic_json(out/'support.json',packet)
    print(json.dumps({k:v for k,v in packet.items() if k not in ['centres','featureWeights','normalizationCenter','normalizationScale']}))
