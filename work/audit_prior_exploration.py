"""First-step throttle probability and actual paired probe score audit."""
import json
import math
from neuronal_experiment_io_retry import ROOT,atomic_json,file_hash,NODE
import subprocess

if __name__ == '__main__':
    directory=ROOT/'.impeccable/review/neural-sacl/learned-prior-exploration-escape'
    target=directory/'exploration-and-score-audit.json'
    assert not target.exists()
    proof=json.loads((directory/'verification.json').read_text())
    assert proof['passed'] and file_hash(directory/'actual-probe-records.json')==proof['recordsSha256']
    for file,digest in proof['sourceHashes'].items():
        assert file_hash(ROOT/file)==digest
    mu=proof['initialActualState']['mean'][1]
    probabilities=[{'sigma':sigma,'firstStepThrottleProbability':.5*math.erfc(-mu/(sigma*math.sqrt(2)))} for sigma in [.02,.7]]
    crash=next(r for r in proof['results'] if r['complete'] and r['reason']=='urto')
    baseline=proof['fullRestoredBaseline']
    script="const A=require('./work/neural-direct-training-objective-r7.cjs'),B=require('./work/neural-prior-training-objective-r8.cjs');let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const x=JSON.parse(s);console.log(JSON.stringify({stallR7:A.fitness(x.idle),crashR7:A.fitness(x.crash),stallR8:B.fitness(x.idle),crashR8:B.fitness(x.crash)}))})"
    scores=json.loads(subprocess.check_output([str(NODE),'-e',script],input=json.dumps({'idle':baseline,'crash':crash}),text=True,cwd=ROOT,creationflags=subprocess.CREATE_NO_WINDOW))
    assert scores['crashR7']>scores['stallR7'] and scores['crashR8']<scores['stallR8']
    audit={'passed':True,'physicalProofSha256':file_hash(directory/'verification.json'),'scriptSha256':file_hash(__file__),'actualLateMeanLongitudinal':mu,'firstStepProbabilities':probabilities,'scores':scores,'boundary':'Gaussian first-step probabilities at ONE actual reached late state; not all-state escape probabilities. Three paired six-second physical probes: lower noise tried no throttle; higher noise moved only centimetres and one crashed. R8 fixes this observed score ordering, not universal objective optimality or successful learned driving.'}
    atomic_json(target,audit)
    print(json.dumps(audit))
