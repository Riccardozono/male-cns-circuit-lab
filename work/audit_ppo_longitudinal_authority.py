"""Code/data diagnostic: numerical inverse features, not exact raw telemetry.

Bounds use the best possible gate=1, so no claim about actual motor outputs.
"""
import json
import math
from neuronal_experiment_io import ROOT, atomic_json, file_hash

base = ROOT/'.impeccable/review/neural-sacl'
out = base/'ppo-normalized-longitudinal-authority-first'
out.mkdir(exist_ok=False)
study = base/'neuronal-ppo-normalized520-cuda-long'
normalizer_file = base/'neuronal-normalization-520-prepared/normalization.json'
normalizer = json.loads(normalizer_file.read_text())
report = json.loads((study/'report.json').read_text())
assert file_hash(normalizer_file) == report['identity']['normalizationSha256']
count = unresolved = strong_throttle = impossible_reversal = no_sampled_reversal = 0
minimum, maximum = math.inf, -math.inf
hashes = {}
for k in range(1, len(report['events'])+1):
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
        minimum, maximum = min(minimum, parent), max(maximum, parent)
        if parent > .9:
            strong_throttle += 1
        # Float64 inverse roundoff cannot matter at this declared margin.
        if parent > math.tanh(2)+1e-10:
            impossible_reversal += 1
        if parent > 0:
            clipped = max(-1+1e-12, min(1-1e-12, parent))
            residual = math.tanh(row['action'][1])
            best_negative_correction = 2*min(0, residual)
            if math.atanh(clipped)+best_negative_correction > 1e-10:
                no_sampled_reversal += 1
assert count+unresolved == report['actualTransitions']
proof = {'passed': True, 'actualTransitions': report['actualTransitions'],
         'resolvedInverseFeatureRows': count, 'unresolvedSaturatedFeatures': unresolved,
         'reconstructedParentLongitudinalMin': minimum,
         'reconstructedParentLongitudinalMax': maximum,
         'strongThrottleRowsAbovePoint9': strong_throttle,
         'rowsWithNoPossibleSignReversalEvenAtGate1': impossible_reversal,
         'positiveParentRowsWithoutSampledReversalEvenAtBestGate': no_sampled_reversal,
         'normalizerSha256': file_hash(normalizer_file),
         'reportSha256': file_hash(study/'report.json'),
         'sourceSha256': file_hash(__file__), 'rolloutHashes': hashes,
         'boundary': 'Parent signed commands numerically reconstructed from fixed normalized features. Logit-residual bound only; not actual brake telemetry or proof this alone caused failed learning.'}
atomic_json(out/'verification.json', proof)
print(json.dumps({k: v for k, v in proof.items() if k != 'rolloutHashes'}))
