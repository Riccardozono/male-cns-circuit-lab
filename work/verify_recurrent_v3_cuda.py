"""Bounded CUDA mirror/gradient comparison on one actual eight-control chunk.

This is a numerical microbenchmark, not a physical driving or learning result.
"""
import json
import statistics
import time
from pathlib import Path
import torch
from differentiable_v3_reservoir import DifferentiableV3
from neuronal_experiment_io import ROOT, atomic_json, file_hash


def run():
    out = ROOT/'.impeccable/review/learning-ml/v3-recurrent-cuda-preflight-20261024-01'
    out.mkdir(exist_ok=False)
    parent_dir = ROOT/'.impeccable/review/learning-ml/v3-differentiable-recurrent-preflight-20261024-01'
    proof = json.loads((parent_dir/'report.json').read_text())
    data = json.loads((parent_dir/'native-sequence.private.json').read_text())
    model_file = ROOT/'work/differentiable_v3_reservoir.py'
    assert proof['passed'] and file_hash(model_file) == proof['integrity']['sourceHashes']['work/differentiable_v3_reservoir.py']
    assert file_hash(parent_dir/'native-sequence.private.json') == proof['integrity']['inputSha256']
    if not torch.cuda.is_available():
        raise RuntimeError('No available CUDA device; no fallback counted as success')
    torch.set_num_threads(2)
    chunk = data['chunks'][1]
    sensors = torch.tensor([r['sensors'] for r in chunk['rows']], dtype=torch.float64)
    initial = torch.tensor(chunk['initialActivity'], dtype=torch.float64)
    outputs, times = {}, {}
    for device in ['cpu', 'cuda:0']:
        model = DifferentiableV3(data['graph'], data['weights']).to(device)
        s, a = sensors.to(device), initial.to(device)
        timings = []
        for iteration in range(4):
            model.zero_grad(set_to_none=True)
            if device.startswith('cuda'):
                torch.cuda.synchronize()
            started = time.perf_counter()
            result = model(s, a)
            (result['logits']*torch.tensor([.37, -.19], dtype=torch.float64, device=device)).sum().backward()
            if device.startswith('cuda'):
                torch.cuda.synchronize()
            elapsed = time.perf_counter()-started
            if iteration:
                timings.append(elapsed)
        outputs[device] = {'commands': result['commands'].detach().cpu(), 'activity': result['states'][-1].detach().cpu(),
                           'gradient': model.weights.grad.detach().cpu()}
        times[device] = timings
    errors = {k: float((outputs['cpu'][k]-outputs['cuda:0'][k]).abs().max()) for k in outputs['cpu']}
    assert max(errors.values()) < 1e-10, errors
    native_error = float((outputs['cuda:0']['commands']-torch.tensor([r['commands'] for r in chunk['rows']], dtype=torch.float64)).abs().max())
    assert native_error < 1e-10
    report = {'format': 'v3-recurrent-cuda-preflight-v1', 'passed': True, 'learningSucceeded': False,
              'torchVersion': torch.__version__, 'device': torch.cuda.get_device_name(0),
              'actualSequenceStartControl': chunk['startControl'], 'controlsPerRun': len(chunk['rows']),
              'warmupRunsPerDevice': 1, 'measuredRunsPerDevice': 3, 'seconds': times,
              'medianCpuSeconds': statistics.median(times['cpu']), 'medianCudaSeconds': statistics.median(times['cuda:0']),
              'observedMicrobenchmarkRatioCpuOverCuda': statistics.median(times['cpu'])/statistics.median(times['cuda:0']),
              'cpuCudaMaximumAbsoluteErrors': errors, 'cudaNativeCommandMaxAbsoluteError': native_error,
              'cudaMaxMemoryAllocatedBytes': torch.cuda.max_memory_allocated(),
              'integrity': {'nativePreflightSha256': file_hash(parent_dir/'report.json'), 'nativeSequenceSha256': file_hash(parent_dir/'native-sequence.private.json'),
                            'sourceHashes': {str(f.relative_to(ROOT)).replace('\\', '/'): file_hash(f) for f in [Path(__file__), model_file]}},
              'boundary': 'One fixed-sensor eight-control sequence and its numerical test-objective gradient, Float64 on both devices. Native physics/training runtime and visible app FPS are not benchmarked. Other desktop/native processes were active; this is not an end-to-end speed guarantee. No RL update, physical episode, fallback or new learned model.'}
    atomic_json(out/'report.json', report)
    (out/Path(__file__).name).write_bytes(Path(__file__).read_bytes())
    print('RECURRENT_CUDA '+json.dumps(report), flush=True)


if __name__ == '__main__':
    run()
