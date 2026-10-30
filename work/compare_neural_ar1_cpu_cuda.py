"""Compare the completed first gradient on identical actual stochastic data."""
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

base = ROOT/'.impeccable/review/learning-ml'
cpu = base/'v3-neural-ar1-natural-cpu-first-20261024-01'
gpu = base/'v3-neural-ar1-natural-cuda-4update-20261024-01'
left = json.loads((cpu/'update-01-gradient.private.json').read_text())
right = json.loads((gpu/'update-01-gradient.private.json').read_text())
inputs = []
for i in range(1, 9):
    a = json.loads((cpu/f'update-01-episode-{i:02}.private.json').read_text())
    b = json.loads((gpu/f'update-01-episode-{i:02}.private.json').read_text())
    assert a == b
    inputs.append(a['actionTraceSha256'])
comparisons = {}
for key in ['gradient', 'fisher', 'naturalDirection']:
    a, b = np.asarray(left[key]), np.asarray(right[key])
    comparisons[key] = {'maximumAbsoluteDifference': float(np.abs(a-b).max()),
                        'relativeL2Difference': float(np.linalg.norm(a-b)/max(1e-30, np.linalg.norm(a)))}
out = base/'v3-neural-ar1-cpu-cuda-comparison-20261024-01'
out.mkdir(exist_ok=False)
result = {'passed': True, 'learningSucceeded': False, 'identicalFullEpisodeInputs': 8, 'actionTraces': inputs,
          'gradientMetricsCpu': left['metrics'], 'gradientMetricsCuda': right['metrics'], 'comparisons': comparisons,
          'inputHashes': {'cpuGradient': file_hash(cpu/'update-01-gradient.private.json'), 'cudaGradient': file_hash(gpu/'update-01-gradient.private.json')},
          'sourceSha256': file_hash(Path(__file__)),
          'boundary': 'Same entire recorded first-batch data and parameter initialization, numerical CPU/CUDA comparison of gradient, empirical chunk Fisher and regularized natural direction. Not bitwise identity, an end-to-end speed benchmark, physical two-lap success or equal later training trajectories.'}
atomic_json(out/'report.json', result)
print(json.dumps(result))
