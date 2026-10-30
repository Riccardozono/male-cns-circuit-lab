"""Unsupervised support fitted to the actually visited late mean-policy domain."""
import gzip
import json
import torch
from neuronal_experiment_io_retry import ROOT,atomic_json,file_hash

if __name__=='__main__':
    torch.set_num_threads(2)
    base=ROOT/'.impeccable/review/neural-sacl'
    source=base/'learned-prior-retention-inputs'
    proof=json.loads((source/'verification.json').read_text())
    assert proof['passed'] and proof['dataSha256']==file_hash(source/'actual-neuronal-inputs.json.gz')
    for file,digest in proof['sourceHashes'].items():
        assert file_hash(ROOT/file)==digest
    data=json.loads(gzip.decompress((source/'actual-neuronal-inputs.json.gz').read_bytes()))
    previous=json.loads((base/'learned-prior-local-support/support.json').read_text())
    out=base/'learned-prior-greedy-support'
    out.mkdir(exist_ok=False)
    # Identical fixed normalization/groups/radius rule; only observed domain changes.
    x=torch.tensor(data['afterFirstLapNeuronalInputs'],dtype=torch.float64)
    center=torch.tensor(previous['normalizationCenter'],dtype=torch.float64)
    scale=torch.tensor(previous['normalizationScale'],dtype=torch.float64)
    weights=torch.tensor(previous['featureWeights'],dtype=torch.float64)
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
        radii.append(max(.1,1.5*torch.linalg.vector_norm(selected-centres[k],dim=1).quantile(.95).item()) if len(selected) else .1)
    q=torch.cdist(z,centres)/torch.tensor(radii,dtype=torch.float64)
    h=torch.where(q<1,(1-q).pow(4)*(4*q+1),0)
    gates=h.max(dim=1).values
    capacity=x[:,641]+4*h.sum(dim=1)
    assert torch.all(capacity[-20:]>0),'Tail domain must admit throttle before training'
    packet={**{k:previous[k] for k in ['format','dimension','groups','featureWeights','normalizationCenter','normalizationScale']},'centres':centres.tolist(),'radii':radii,'fitObservations':len(x),'fitMinGate':gates.min().item(),'fitMeanGate':gates.mean().item(),'fitMaxGate':gates.max().item(),'tailMinMaxLongitudinalMean':capacity[-20:].min().item(),'sourceDataSha256':proof['dataSha256'],'sourceProofSha256':file_hash(source/'verification.json'),'normalizationSourceSha256':file_hash(base/'learned-prior-local-support/support.json'),'scriptSha256':file_hash(__file__),'boundary':'Statistical support fitted without actions/rewards to273actual late neuronal inputs of own mean policy. Five-group scaler and radius rule unchanged from stochastic-domain support. Historical first-lap partition is sampling only; no lap/pose/clock/route inputs or action labels. Tail coefficient authority is a local algebraic check, not a learned/physical escape or proof of preservation.'}
    atomic_json(out/'support.json',packet)
    print(json.dumps({k:v for k,v in packet.items() if k not in ['centres','featureWeights','normalizationCenter','normalizationScale']}),flush=True)
