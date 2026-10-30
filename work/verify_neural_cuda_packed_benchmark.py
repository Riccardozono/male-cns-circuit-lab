"""Paired complete native benchmark reconciliation, with honest timing scope."""
import json
import math
from neuronal_experiment_io import ROOT, NODE, atomic_json, file_hash

def verify():
    base = ROOT/'.impeccable/review/neural-sacl'
    a_file, b_file = base/'neuronal-cuda-packed-four-reference/report.json', base/'neuronal-cuda-packed-four/report.json'
    a, b = [json.loads(p.read_text(encoding='utf-8')) for p in [a_file, b_file]]
    assert a['passed'] and b['passed'] and a['phase'] == b['phase'] == 'finished'
    assert a['mode'] == 'reference' and b['mode'] == 'cuda'
    assert a['modelSha256'] == b['modelSha256'] == file_hash(a['modelFile'])
    assert a['sourceStudySha256'] == b['sourceStudySha256']
    assert a['nodeExecutableSha256'] == b['nodeExecutableSha256'] == file_hash(NODE)
    assert a['numericRuntime'] == b['numericRuntime'] == '24.19.0'
    assert a['benchmarkSourceSha256'] == b['benchmarkSourceSha256'] == file_hash(ROOT/'work/benchmark-neural-cuda-packed-batch.cjs')
    assert len(a['results']) == len(b['results']) == 4
    assert len({tuple(r['genes']) for r in a['results']}) == 4
    for x, y in zip(a['results'], b['results']):
        assert x == y
        assert x['result']['complete'] and x['overlap'] == 0 and x['expectedMatches']
        assert all(math.isfinite(x['result'][k]) for k in ['bestProgress','fitness','totalSimulationSeconds'])
    assert a['actualControlSteps'] == b['actualControlSteps'] == sum(r['controls'] for r in b['results'])
    memo = b['cuda']
    assert memo['calls'] == memo['gpuCalls'] == b['actualControlSteps']
    assert memo['kernelLaunches'] == memo['gpuCalls']*4 and memo['cpuFallbacks'] == 0
    assert memo['graphUploads'] == 1
    assert memo['hostToDeviceCopies'] == memo['gpuCalls']+3 and memo['deviceToHostCopies'] == memo['gpuCalls']
    assert b['experimentalEngineIdentity']['revision'] == 'state-head-exact-cuda-packed-driver-v1'
    for file, sha in b['experimentalEngineIdentity']['sources'].items():
        assert file_hash(ROOT/file) == sha, file
    cuda = b['experimentalEngineIdentity']['cuda']
    assert cuda['revision'] == 'cuda-exact-v3-packed-driver-v1'
    for file, sha in cuda['sources'].items():
        assert file_hash(ROOT/file) == sha, file
    assert file_hash(cuda['driverPath']) == cuda['driverSha256']
    packet = base/'cuda-v3-kernel-prepared-r2'
    assert file_hash(packet/'manifest.json') == cuda['manifestSha256']
    manifest = json.loads((packet/'manifest.json').read_text(encoding='utf-8'))
    assert manifest['ptxSha256'] == file_hash(packet/'kernel.ptx')
    assert manifest['sourceSha256'] == file_hash(packet/'licensed-kernel-source.cu')
    assert manifest['licenseSha256'] == file_hash(packet/'LICENSE.V8-fdlibm.txt')
    assert file_hash(ROOT/'work/cuda-exact-v3-packed-pass.cjs') == cuda['packedSourceSha256']
    cpu_a = sum(a['cpuMicroseconds'].values())/1e6
    cpu_b = sum(b['cpuMicroseconds'].values())/1e6
    report = {'passed': True, 'referenceSha256': file_hash(a_file), 'cudaSha256': file_hash(b_file),
              'completeDistinctAgents': 4, 'actualControlStepsEachRun': a['actualControlSteps'],
              'referenceWallSeconds': a['wallSeconds'], 'cudaWallSeconds': b['wallSeconds'],
              'throughputSpeedup': a['wallSeconds']/b['wallSeconds'],
              'wallReductionPercent': 100*(1-b['wallSeconds']/a['wallSeconds']),
              'referenceCpuSeconds': cpu_a, 'cudaHostCpuSeconds': cpu_b,
              'hostCpuReductionPercent': 100*(1-cpu_b/cpu_a), 'cuda': memo,
              'boundary': 'One fresh sequential original-then-exact-CUDA four-agent native pair, identical complete control/progress/time traces and results, actual GPUcalls and zero CPUfallback. No other owned learner/benchmark at dispatch. User apps/scheduler/turbo/cache/load/order not randomized. HostCPU time excludes device compute/energy. Not confidence interval, appFPS, allmodel/track performance, GPUbatch100 or faster convergence. Full brain/vehicle lockstep equivalence separate.'}
    atomic_json(base/'neuronal-cuda-packed-four/verification.json', report)
    print(json.dumps(report))
    return report

if __name__ == '__main__':
    verify()
