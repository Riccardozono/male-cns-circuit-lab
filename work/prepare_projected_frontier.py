"""Fit eight artificial axes on actual late neuronal observations, no action targets."""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['OMP_NUM_THREADS'] = '2'
import argparse
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--basis', default='.impeccable/review/neural-sacl/progressive-3652-first/stage-03/prepared.json')
    parser.add_argument('--out', default='.impeccable/review/neural-sacl/projected-frontier-3680/prepared.json')
    args = parser.parse_args()
    basis_file, out = ROOT / args.basis, ROOT / args.out
    if out.exists():
        raise RuntimeError('Preserve the existing projection')
    prepared = json.loads(basis_file.read_text(encoding='utf-8'))
    trace_file = basis_file.parent / 'parent-actual-trace.json'
    observations = np.asarray([r['observation'] for r in json.loads(trace_file.read_text(encoding='utf-8'))], dtype=np.float64)
    if observations.ndim != 2 or observations.shape[1] != 516 or not np.isfinite(observations).all() or file_hash(prepared['parentModelFile']) != prepared['parentModelSha256']:
        raise RuntimeError('Matching finite actual parent observations required')
    samples = observations[prepared['basis']['protectedCount']:]
    mean, scales = samples.mean(axis=0), np.asarray(prepared['basis']['scales'])
    centered = (samples - mean) / scales
    _, singular, components = np.linalg.svd(centered, full_matrices=False)
    components = components[:8]
    deviation = np.maximum((centered @ components.T).std(axis=0), .05)
    projection = {'mean': mean.tolist(), 'scales': scales.tolist(), 'components': components.tolist(), 'componentStd': deviation.tolist()}
    result = {'format': 'male-cns-private-projected-frontier-basis', 'schema': 1, 'projection': projection, 'basis': prepared['basis'],
              'parentModelFile': prepared['parentModelFile'], 'parentModelSha256': prepared['parentModelSha256'], 'maxProgress': prepared['maxProgress'],
              'sourceTraceSha256': file_hash(trace_file), 'gateBasisSha256': file_hash(basis_file), 'sourceSha256': file_hash(Path(__file__)),
              'explainedVarianceFraction': float(np.sum(singular[:8] ** 2) / np.sum(singular ** 2)), 'observationsFitted': len(samples),
              'learnableParameters': 18, 'boundary': 'Eight mathematical axes from actual neuronal values, not biological neurons. No position/time/route or control-target examples. Retained neural gate protects the observed prefix; current projected observations condition later learned commands.'}
    out.parent.mkdir(exist_ok=False)
    atomic_json(out, result)
    print(json.dumps({k: result[k] for k in ['learnableParameters', 'explainedVarianceFraction', 'observationsFitted', 'parentModelSha256']}))

if __name__ == '__main__':
    main()
