"""Paired complete native benchmark reconciliation, with honest timing scope."""
import json
import math
from neuronal_experiment_io import ROOT, NODE, atomic_json, file_hash

def verify():
    base = ROOT/'.impeccable/review/neural-sacl'
    a_file, b_file = base/'neuronal-incoming-four-reference/report.json', base/'neuronal-coo-prepared-four/report.json'
    a, b = [json.loads(p.read_text(encoding='utf-8')) for p in [a_file, b_file]]
    assert a['passed'] and b['passed'] and a['phase'] == b['phase'] == 'finished'
    assert a['mode'] == 'reference' and b['mode'] == 'prepared'
    assert a['modelSha256'] == b['modelSha256'] == file_hash(a['modelFile'])
    assert a['sourceStudySha256'] == b['sourceStudySha256']
    assert a['nodeExecutableSha256'] == b['nodeExecutableSha256'] == file_hash(NODE)
    assert a['numericRuntime'] == b['numericRuntime'] == '24.19.0'
    assert a['benchmarkSourceSha256'] == file_hash(ROOT/'work/benchmark-neural-incoming-batch.cjs')
    assert b['benchmarkSourceSha256'] == file_hash(ROOT/'work/benchmark-neural-prepared-batch.cjs')
    assert len(a['results']) == len(b['results']) == 4
    assert len({tuple(r['genes']) for r in a['results']}) == 4
    for x, y in zip(a['results'], b['results']):
        assert x == y
        assert x['result']['complete'] and x['overlap'] == 0 and x['expectedMatches']
        assert all(math.isfinite(x['result'][k]) for k in ['bestProgress','fitness','totalSimulationSeconds'])
    assert a['actualControlSteps'] == b['actualControlSteps'] == sum(r['controls'] for r in b['results'])
    memo = b['preparedKernel']
    assert memo['calls'] >= b['actualControlSteps']
    assert memo['weightRefreshes'] == memo['gainRefreshes'] == 1 and memo['fallbacks'] == 0
    for file, sha in b['experimentalEngineIdentity']['sources'].items():
        assert file_hash(ROOT/file) == sha, file
    cpu_a = sum(a['cpuMicroseconds'].values())/1e6
    cpu_b = sum(b['cpuMicroseconds'].values())/1e6
    report = {'passed': True, 'referenceSha256': file_hash(a_file), 'preparedSha256': file_hash(b_file),
              'completeDistinctAgents': 4, 'actualControlStepsEachRun': a['actualControlSteps'],
              'referenceWallSeconds': a['wallSeconds'], 'preparedWallSeconds': b['wallSeconds'],
              'wallReductionPercent': 100*(1-b['wallSeconds']/a['wallSeconds']),
              'referenceCpuSeconds': cpu_a, 'preparedCpuSeconds': cpu_b,
              'cpuReductionPercent': 100*(1-cpu_b/cpu_a), 'preparedKernel': memo,
              'boundary': 'One sequential three-way native series: original, stable-incoming, prepared-COO; this comparison reuses the ORIGINAL first measurement, not a fresh randomized pair. Explicit different harness identities, same four actual parameter vectors, results and entire control/progress/time traces. No other owned learner/benchmark at dispatch; brief unit/diagnostic commands and user apps/scheduler/turbo/cache/load order not controlled. Not a confidence interval, FPS, GPU, whole Windows app speedup or faster-learning proof. Full brain/vehicle lockstep equivalence is a separate requirement.'}
    atomic_json(base/'neuronal-coo-prepared-four/verification.json', report)
    print(json.dumps(report))
    return report

if __name__ == '__main__':
    verify()
