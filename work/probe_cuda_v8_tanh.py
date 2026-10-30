"""Compare actual Node activation outputs to adapted and native CUDA tanh.

Both actual reached-neuron inputs and declared numerical fixtures are used.
Neither dataset supplies desired actions or neural-learning fitness.
"""
import ctypes as C
import hashlib
import json
import subprocess
import numpy as np
import torch
from neuronal_experiment_io import ROOT, NODE, atomic_json, file_hash
from cuda_nvrtc_runtime import Module
from cuda_v8_math_source import source, REFERENCE

def run():
    base = ROOT/'.impeccable/review/neural-sacl'
    out = base/'cuda-v8-tanh-probe'
    out.mkdir(exist_ok=False)
    try:
        folder = base/'neuronal-v8-math-inputs'
        m = json.loads((folder/'metadata.json').read_text(encoding='utf-8'))
        assert file_hash(folder/'inputs.f64') == m['inputSha256']
        for f, sha in m['sourceHashes'].items():
            assert file_hash(ROOT/f) == sha, f
        actual = np.fromfile(folder/'inputs.f64', dtype='<f8')
        assert len(actual) == m['values'] and np.isfinite(actual).all()
        random = np.random.default_rng(161026)
        thresholds = np.array([0, np.nextafter(0., 1.), np.finfo(np.float64).tiny, 2**-54, 2**-28, .5, 1, 22, 709.78, 1e300, np.inf], dtype=np.float64)
        fixtures = np.concatenate([thresholds, -thresholds, np.nextafter(thresholds[:-1], 0),
                                   random.uniform(-25, 25, 32768), np.geomspace(1e-300, 1e2, 2048),
                                   -np.geomspace(1e-300, 1e2, 2048)])
        x = np.concatenate([actual, fixtures]).astype('<f8')
        input_file, ref_file = out/'inputs.f64', out/'node-reference.f64'
        x.tofile(input_file)
        reference_info = json.loads(subprocess.check_output([str(NODE), str(ROOT/'work/node-tanh-binary.cjs'), str(input_file), str(ref_file)],
                                   cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
        expected = np.fromfile(ref_file, dtype='<f8')
        code = source()+r'''
extern "C" __global__ void tanh_probe(const double* x, double* adapted, double* native_, int n) {
  const int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i<n) { adapted[i]=v8_tanh(x[i]); native_[i]=tanh(x[i]); }
}
'''
        # Preserve full permission notices with the mechanically adapted source.
        (out/'licensed-generated-source.cu').write_text(code, encoding='utf-8')
        tx = torch.from_numpy(x.copy()).cuda()
        adapted, native = torch.empty_like(tx), torch.empty_like(tx)
        with Module(code) as mod:
            mod.launch('tanh_probe', [tx, adapted, native, C.c_int(len(x))], ((len(x)+127)//128, 1, 1))
            torch.cuda.synchronize()
            y, z = adapted.cpu().numpy(), native.cpu().numpy()
            options = mod.options
            ptx_sha = hashlib.sha256(mod.ptx.raw).hexdigest()
        mismatch = y.view(np.uint64)!=expected.view(np.uint64)
        native_mismatch = z.view(np.uint64)!=expected.view(np.uint64)
        np.asarray(y, dtype='<f8').tofile(out/'cuda-adapted.f64')
        np.asarray(z, dtype='<f8').tofile(out/'cuda-native.f64')
        first = np.flatnonzero(mismatch)[:12]
        report = {'passed': bool(not mismatch.any()), 'device': torch.cuda.get_device_name(),
                  'actualNeuronalValues': len(actual), 'numericalFixtureValues': len(fixtures), 'totalValues': len(x),
                  'actualNeuronalAdaptedBitwiseMismatches': int(mismatch[:len(actual)].sum()),
                  'allAdaptedBitwiseMismatches': int(mismatch.sum()), 'nativeCudaBitwiseMismatches': int(native_mismatch.sum()),
                  'firstAdaptedMismatches': [{'index': int(i), 'x': float(x[i]), 'node': float(expected[i]), 'cuda': float(y[i])} for i in first],
                  'nodeReference': reference_info, 'pinnedV8ReferenceSha256': file_hash(REFERENCE),
                  'inputSha256': file_hash(input_file), 'nodeOutputSha256': file_hash(ref_file),
                  'adaptedOutputSha256': file_hash(out/'cuda-adapted.f64'), 'nativeOutputSha256': file_hash(out/'cuda-native.f64'),
                  'generatedSourceSha256': file_hash(out/'licensed-generated-source.cu'), 'ptxSha256': ptx_sha, 'compileOptions': options,
                  'sourceHashes': {f: file_hash(ROOT/f) for f in ['work/probe_cuda_v8_tanh.py','work/cuda_nvrtc_runtime.py','work/cuda_v8_math_source.py','work/node-tanh-binary.cjs']},
                  'boundary': 'Finite numerical component test on actual initial8state neuronal activation inputs plus declared synthetic math fixtures. No training/driving labels. Even zero mismatches is NOT an entire neural-pass, closed-loop driving, Windows/GPU integration, performance or universal floating-point proof. No release or installation.'}
        atomic_json(out/'report.json', report)
        print(json.dumps(report))
    except Exception as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'sourceSha256': file_hash(__file__)})
        raise

if __name__ == '__main__':
    run()
