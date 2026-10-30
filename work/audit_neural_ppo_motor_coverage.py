"""Sampled correction authority, not desired driving commands or teacher data."""
import argparse
import json
import math
from neuronal_experiment_io import ROOT, atomic_json, file_hash

def run(tag):
    if not tag.replace('-', '').isalnum():
        raise ValueError('Isolated actual study required')
    out = ROOT/'.impeccable/review/neural-sacl'/tag
    files = sorted(out.glob('rollout-*.json'))
    assert files
    total = strong = reversed_upper = amplitude_upper = 0
    maximum = 0
    for file in files:
        batch = json.loads(file.read_text(encoding='utf-8'))
        for row in batch['rows']:
            assert len(row['x']) == 520
            parent = row['x'][516]
            latent = row['action'][0]
            assert math.isfinite(parent) and math.isfinite(latent)
            delta = 2*math.tanh(.2*latent)
            total += 1
            maximum = max(maximum, abs(delta))
            if abs(parent) > .8:
                strong += 1
                reversed_upper += parent*(parent+delta) <= 0
                amplitude_upper += abs(delta) >= abs(parent)
    report = {'format': 'male-cns-actual-ppo-motor-coverage-v1',
              'rolloutHashes': {f.name: file_hash(f) for f in files},
              'actualRows': total, 'strongParentSteerRowsAbsAbove08': strong,
              'opposingSignAtFullGateUpperBound': reversed_upper,
              'sufficientMagnitudeAtFullGateUpperBound': amplitude_upper,
              'maximumSampledAbsSteerCorrectionAtFullGate': maximum,
              'sourceSha256': file_hash(__file__),
              'boundary': 'Arithmetic on actual sampled latent actions and actual parent commands. Gate is set to1ONLY for this diagnostic upper bound, not in the controller. A lower real gate cannot increase correction amplitude. Reversing parent steering is NOT labeled correct or needed. No physical replay, target actions or training examples; this does not prove the cause of failed learning.'}
    atomic_json(out/'motor-coverage-audit.json', report)
    print(json.dumps({k: v for k, v in report.items() if k != 'rolloutHashes'}))

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('tag')
    run(p.parse_args().tag)
