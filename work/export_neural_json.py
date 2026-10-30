"""Export our own learned weights as non-executable private JSON.

This is not a public .malecns-save and must not bypass that format's checks.
"""
import argparse
import json
import hashlib
import numpy as np
import torch
import neural_sac as NS
from search_neural_memory_feature import SOURCE

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',default='bilateral-readout-cma')
    parser.add_argument('--tag',default='native-neural-head');args=parser.parse_args()
    if any(not s.replace('-','').isalnum() for s in [args.run,args.tag]):raise ValueError('Invalid identifier')
    report_file=NS.ROOT/'.impeccable/review/neural-sacl'/args.run/'report.json'
    report=json.loads(report_file.read_text(encoding='utf-8'));environment=report['environment']
    actor_file=SOURCE/'best-own-model.zip'
    if not report['passed'] or NS.file_hash(actor_file)!=report['sourceActorSha256']:raise ValueError('Verified own actor required')
    causal_file=NS.ROOT/'.impeccable/review/neural-local-rbf/causal-single-axis-guard4/checkpoint.json'
    if NS.file_hash(causal_file)!=environment['sourceSha256']:raise ValueError('Causal source changed')
    causal=json.loads(causal_file.read_text(encoding='utf-8'))
    model=NS.GentleWarmSAC.load(actor_file,device='cpu');modules=list(model.actor.latent_pi.children())
    if [type(m).__name__ for m in modules]!=['Linear','ReLU','Linear','ReLU']:raise ValueError('Unexpected actor architecture')
    layers=[]
    for i,layer in enumerate([modules[0],modules[2],model.actor.mu]):
        weight=layer.weight.detach().cpu().numpy();bias=layer.bias.detach().cpu().numpy()
        if weight.dtype!=np.float32 or not np.isfinite(weight).all() or not np.isfinite(bias).all():raise ValueError('Finite float32 parameters required')
        layers.append({'weights':weight.tolist(),'bias':bias.tolist(),'activation':'relu' if i<2 else 'tanh-unscale'})
    payload={'format':'male-cns-private-neural-head','schema':1,'appVersion':'5.6.0',
        'environment':environment,'actor':{'dimensions':[516,256,256,2],'layers':layers},
        'learnedResidual':report['champion']['parameters'],
        'causalModel':{k:causal[k] for k in ['baseGenome','centres','explorerWeights','decay']},
        'verifiedCudaReference':report['champion']['result'],
        'sourceRecordHashes':{'actor':NS.file_hash(actor_file),'trainingReport':NS.file_hash(report_file),'causal':NS.file_hash(causal_file)},
        'boundary':'Mathematical learned coefficients only, no executable objects or recorded command sequence. Private incompatible decoder/objective, not a normal app save. Native numerical inference requires a separate physical validation.'}
    encoded=json.dumps(payload,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    envelope={'format':'male-cns-private-neural-envelope','schema':1,'payloadJson':encoded,
              'sha256':hashlib.sha256(encoded.encode('utf-8')).hexdigest()}
    out=NS.ROOT/'.impeccable/review/neural-sacl'/args.tag;out.mkdir(parents=True,exist_ok=False)
    NS.atomic_json(out/'learned-head.malecns-neural-exp.json',envelope)
    print('NEURAL_JSON_EXPORTED '+json.dumps({'sha256':envelope['sha256'],'dimensions':payload['actor']['dimensions'],
        'payloadBytes':len(encoded.encode('utf-8')),'cudaReference':payload['verifiedCudaReference']}),flush=True)

if __name__=='__main__':main()
