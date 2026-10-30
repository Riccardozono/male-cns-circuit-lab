"""Offline neural-context contrast; no route or desired action is fitted.

The stored function modulates zero-mean noise variance, never a motor mean.
"""
import importlib.util
import json
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

spec = importlib.util.spec_from_file_location('prefix_fit', ROOT/'work/fit-prefix-constrained-readout.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def run():
    source = ROOT/'.impeccable/review/learning-ml/v3-descending-readout-comparison-20261024-02'
    report = json.loads((source/'report.json').read_text())
    data = json.loads((source/'observations.private.json').read_text())
    assert report['passed'] and file_hash(source/'observations.private.json') == report['integrity']['observationsSha256']
    columns = [data['nodes'].index(n) for n in data['oldNodes']]
    features = np.array([r['features'] for r in data['observations']])[:, columns]
    design = np.column_stack([features/np.sqrt(len(columns)), np.ones(len(features))])
    prefix = design[:int(len(design)*.6)]
    target = design[int(len(design)*.85):].mean(axis=0)
    direction = module.direction(prefix, target, 1e-6)
    response = design@direction
    threshold = float(response[:len(prefix)].max()+.05)
    assert threshold < .8
    gate = np.clip((response-threshold)/(1-threshold), 0, 1)
    gate = gate*gate*(3-2*gate)
    config = {'format': 'neural-variance-ar1-v1', 'direction': direction.tolist(), 'threshold': threshold,
              'rho': .9, 'floor': [.00015, .0008], 'ceiling': [.045, .18]}
    out = ROOT/'.impeccable/review/learning-ml/v3-neural-exploration-calibration-20261024-01'
    out.mkdir(exist_ok=False)
    result = {'passed': True, 'learningSucceeded': False, 'parentSha256': data['parentSha256'], 'config': config,
              'observations': len(features), 'prefixSamples': len(prefix), 'targetSamples': len(design)-int(len(design)*.85),
              'sourceReportSha256': file_hash(source/'report.json'), 'sourceObservationsSha256': file_hash(source/'observations.private.json'),
              'sourceSha256': file_hash(Path(__file__)), 'profile': [
                  {'control': i, 'progressM': data['observations'][i]['progressM'], 'response': float(response[i]),
                   'gate': float(gate[i]), 'sigma': [floor+(ceiling-floor)*float(gate[i]) for floor, ceiling in zip(config['floor'], config['ceiling'])]}
                  for i in range(len(features))],
              'boundary': 'Contrast fitted to actual neural states: first60percent of controls versus last15percent of one observed episode, no desired motor actions. Time/progress annotate calibration only and are absent from the runtime variance function. No proof of physical exploration or learning gain. Correlated Gaussian AR1 is not the gSDE algorithm.'}
    atomic_json(out/'report.json', result)
    atomic_json(out/'config.private.json', config)
    print(json.dumps({'passed': True, 'threshold': threshold, 'prefixSamples': len(prefix),
                      'prefixMaximumGate': float(gate[:len(prefix)].max()), 'firstGateAbove01': int(np.flatnonzero(gate>.1)[0]),
                      'finalGate': float(gate[-1]), 'report': str(out/'report.json'), 'sha256': file_hash(out/'report.json')}))


if __name__ == '__main__':
    run()
