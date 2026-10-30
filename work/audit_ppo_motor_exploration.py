"""Audit actual direct motor composition and Gaussian exploration, not a pilot."""
import json
import math
import subprocess
from neuronal_experiment_io import ROOT, NODE, atomic_json, file_hash

base = ROOT/'.impeccable/review/neural-sacl'
out = base/'ppo-normalized-direct-motor-exploration-first'
out.mkdir(exist_ok=False)
study = base/'neuronal-ppo-normalized520-cuda-long'
normalizer_file = base/'neuronal-normalization-520-prepared/normalization.json'
normalizer = json.loads(normalizer_file.read_text())
report = json.loads((study/'report.json').read_text())
assert file_hash(normalizer_file) == report['identity']['normalizationSha256']
motor_source = ROOT/'work/neural-command-residual.cjs'
motor_check = subprocess.check_output([str(NODE), '-e', "const M=require('./work/neural-command-residual.cjs'),assert=require('assert/strict');let n=0;for(const p of [-1,-.97,0,.5,.97,1])for(const g of [0,.01,.5,1])for(const a of [-4,-.5,0,.5,4]){const prior=[0,Math.max(0,p),Math.max(0,-p)],r=M.compose(prior,g,[0,Math.tanh(a)]),expected=Math.max(-1,Math.min(1,p+2*g*Math.tanh(a)));assert.equal(r[1]-r[2],expected);n++;}console.log(JSON.stringify({passed:true,cases:n}));"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
assert json.loads(motor_check)['passed']
count = unresolved = positive = strong = sampled_no_reverse = beyond_four_sigma = 0
probability_sum = 0
hashes = {}
for k, event in enumerate(report['events'], 1):
    std = report['events'][k-2]['std'][1] if k > 1 else math.exp(math.log(.08))
    file = study/f'rollout-{k:03}.json'
    hashes[file.name] = file_hash(file)
    for row in json.loads(file.read_text())['rows']:
        x = row['x'][517]
        if abs(x) >= 1:
            unresolved += 1
            continue
        parent = normalizer['mean'][517]+normalizer['scales'][517]*math.atanh(x)
        assert -1-1e-10 <= parent <= 1+1e-10
        count += 1
        strong += int(parent > .9)
        if parent > 0:
            positive += 1
            threshold = -math.atanh(parent/2)
            z = (threshold-row['mean'][1])/std
            probability_sum += .5*math.erfc(-z/math.sqrt(2))
            beyond_four_sigma += int(z < -4)
            sampled_no_reverse += int(parent+2*min(0, math.tanh(row['action'][1])) > 1e-10)
assert count+unresolved == report['actualTransitions']
proof = {'passed': True, 'actualTransitions': report['actualTransitions'],
         'actualMotorFormulaVerified': json.loads(motor_check),
         'motorSourceSha256': file_hash(motor_source),
         'resolvedInverseFeatureRows': count, 'unresolvedSaturatedFeatures': unresolved,
         'positiveParentRows': positive, 'strongThrottleRowsAbovePoint9': strong,
         'positiveParentRowsWithoutSampledSignReversalEvenAtBestGate': sampled_no_reverse,
         'positiveParentRowsWithBrakeThresholdBeyondFourGaussianSigmas': beyond_four_sigma,
         'meanBestGateBrakeProbabilityOverPositiveParents': probability_sum/positive,
         'normalizerSha256': file_hash(normalizer_file), 'reportSha256': file_hash(study/'report.json'),
         'sourceSha256': file_hash(__file__), 'rolloutHashes': hashes,
         'boundary': 'Numerically inverse-reconstructed parent commands. Gaussian/brake bounds use maximum gate1, not measured actual brake outputs. The actual direct motor decoder CAN reverse any bounded parent at gate1; this audit does not prove a causal explanation of failed learning.'}
atomic_json(out/'verification.json', proof)
print(json.dumps({k: v for k, v in proof.items() if k != 'rolloutHashes'}))
