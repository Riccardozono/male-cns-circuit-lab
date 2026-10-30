"""Compare recorded neuronal context resolution, then propose bounded weights.

This is a local weight probe, not supervised driving data or a route controller.
"""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np

_spec = importlib.util.spec_from_file_location('prefix_fit', Path(__file__).with_name('fit-prefix-constrained-readout.py'))
_prefix_fit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_prefix_fit)


def generate(data):
    features = np.asarray([r['features'] for r in data['observations']], dtype=np.float64)
    progress = np.asarray([r['progressM'] for r in data['observations']])
    all_nodes, old_nodes = data['nodes'], data['oldNodes']
    old_columns = [all_nodes.index(n) for n in old_nodes]
    variants, diagnostics, representations = [], [], []
    requests = [(.1, 0), (-.1, 0), (0, .1), (0, -.1),
                (.1, .1), (-.1, .1), (.1, -.1), (-.1, -.1)]
    for name, columns in [('current64', old_columns), ('allDescending', list(range(len(all_nodes))))]:
        matrix = features[:, columns]
        singular = np.linalg.svd(matrix - matrix.mean(axis=0), compute_uv=False)
        variance = matrix.var(axis=0)
        representations.append({'name': name, 'neurons': len(columns),
                                'varyingNeuronsAt1e10': int((variance > 1e-10).sum()),
                                'saturatedFractionAt098': float((np.abs(matrix) > .98).mean()),
                                'centeredRankRelative1e6': int((singular > singular[0]*1e-6).sum()),
                                'centeredSingularValues': singular.tolist()})
        design = np.column_stack([matrix / np.sqrt(len(columns)), np.ones(len(matrix))])
        for fraction in [.85, .93, .98]:
            target_index = int(np.flatnonzero(progress >= data['baseline']['progressM'] * fraction)[0])
            target = design[target_index]
            retained = design[progress <= progress[target_index] * .8]
            vector = _prefix_fit.direction(retained, target, 1e-6)
            unit_prefix = float(np.max(np.abs(retained @ vector)))
            nearest = float(np.min(np.sqrt(np.mean((retained[:, :-1] - target[:-1])**2, axis=1))))
            scale = min(1., 8./max(1e-30, .1*float(np.max(np.abs(vector)))),
                        .001/max(1e-30, .1*unit_prefix)) * (1.-1e-12)
            diagnostics.append({'name': name, 'fraction': fraction, 'targetIndex': target_index,
                                'targetProgressM': float(progress[target_index]), 'retainedSamples': len(retained),
                                'nearestRetainedRmsNormalized': nearest, 'unitPrefixMax': unit_prefix,
                                'unitTarget': float(target @ vector), 'scale': scale,
                                'maxTargetChangeForRequested01': float(.1*scale*(target @ vector))})
            for steer, longitudinal in requests:
                weights = np.column_stack([vector*steer*scale, vector*longitudinal*scale])
                assert np.isfinite(weights).all() and np.abs(weights).max() <= 8
                assert max(np.abs(retained @ weights).max(), 0) <= .001 + 1e-12
                variants.append({'id': f'{name}:{fraction}:{steer}:{longitudinal}', 'name': name,
                                 'fraction': fraction, 'targetIndex': target_index, 'request': [steer, longitudinal],
                                 'actualTargetLogitDelta': (target @ weights).tolist(),
                                 'actualPrefixLogitMax': float(np.abs(retained @ weights).max()),
                                 'spec': {'nodes': [all_nodes[i] for i in columns], 'weights': weights.reshape(-1).tolist()}})
    return {'format': 'private-descending-readout-comparison-v1', 'numpyVersion': np.__version__,
            'parentSha256': data['parentSha256'], 'representations': representations,
            'diagnostics': diagnostics, 'variants': variants,
            'boundary': 'These are static neuronal residual weights over a fixed learned parent; not cold-start training. Recorded-state constraints do not guarantee closed-loop prefix retention.'}


if __name__ == '__main__':
    source, target = map(Path, sys.argv[1:3])
    result = generate(json.loads(source.read_text(encoding='utf-8')))
    with target.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, allow_nan=False)
    print(json.dumps({'variants': len(result['variants']), 'diagnostics': result['diagnostics'],
                      'representations': [{k: v for k, v in r.items() if k != 'centeredSingularValues'} for r in result['representations']]}))
