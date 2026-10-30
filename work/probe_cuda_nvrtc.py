"""Execute one numerical CUDA capability fixture using existing bundled NVRTC.

NOT a brain/physics benchmark, driving proof or app installation.
API references: NVIDIA CUDA12.8 NVRTC and CUDA Driver execution-control docs.
"""
import ctypes as C
import hashlib
import json
import os
from pathlib import Path
import torch
from neuronal_experiment_io import ROOT, atomic_json, file_hash

SOURCE = r'''
extern "C" __global__ void affine_probe(const double* x, double* y, int n) {
    const int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) y[i] = __dadd_rn(__dmul_rn(x[i], 0.45), 0.55);
}
'''

def run():
    out = ROOT/'.impeccable/review/neural-sacl/cuda-nvrtc-affine-probe'
    out.mkdir(exist_ok=False)
    program, module = C.c_void_p(), C.c_void_p()
    nvrtc = driver = None
    try:
        assert torch.cuda.is_available()
        lib = Path(torch.__file__).parent/'lib'
        dll_directory = os.add_dll_directory(str(lib))
        nvrtc = C.CDLL(str(lib/'nvrtc64_120_0.dll'))
        driver = C.WinDLL('nvcuda.dll')
        def bind(dll, name, args):
            f = getattr(dll, name)
            f.argtypes, f.restype = args, C.c_int
            return f
        vp, vpp, cp, cpp = C.c_void_p, C.POINTER(C.c_void_p), C.c_char_p, C.POINTER(C.c_char_p)
        create = bind(nvrtc, 'nvrtcCreateProgram', [vpp, cp, cp, C.c_int, cpp, cpp])
        compile_ = bind(nvrtc, 'nvrtcCompileProgram', [vp, C.c_int, cpp])
        log_size = bind(nvrtc, 'nvrtcGetProgramLogSize', [vp, C.POINTER(C.c_size_t)])
        get_log = bind(nvrtc, 'nvrtcGetProgramLog', [vp, vp])
        ptx_size = bind(nvrtc, 'nvrtcGetPTXSize', [vp, C.POINTER(C.c_size_t)])
        get_ptx = bind(nvrtc, 'nvrtcGetPTX', [vp, vp])
        version = bind(nvrtc, 'nvrtcVersion', [C.POINTER(C.c_int), C.POINTER(C.c_int)])
        def check(code, operation):
            if code:
                raise RuntimeError(f'{operation}: API code {code}')
        major, minor = C.c_int(), C.c_int()
        check(version(C.byref(major), C.byref(minor)), 'nvrtcVersion')
        check(create(C.byref(program), SOURCE.encode(), b'capability-probe.cu', 0, None, None), 'nvrtcCreateProgram')
        capability = torch.cuda.get_device_capability()
        options = [f'--gpu-architecture=compute_{capability[0]}{capability[1]}', '--fmad=false', '--std=c++14']
        option_array = (cp*len(options))(*(s.encode() for s in options))
        status = compile_(program, len(options), option_array)
        size = C.c_size_t()
        check(log_size(program, C.byref(size)), 'nvrtcGetProgramLogSize')
        log = C.create_string_buffer(size.value)
        check(get_log(program, log), 'nvrtcGetProgramLog')
        if status:
            raise RuntimeError(f'nvrtcCompileProgram: {status}: {log.value.decode()}')
        check(ptx_size(program, C.byref(size)), 'nvrtcGetPTXSize')
        ptx = C.create_string_buffer(size.value)
        check(get_ptx(program, ptx), 'nvrtcGetPTX')
        x = torch.linspace(-1, 1, 1024, dtype=torch.float64, device='cuda')
        y = torch.empty_like(x)
        init = bind(driver, 'cuInit', [C.c_uint])
        load = bind(driver, 'cuModuleLoadData', [vpp, vp])
        function = bind(driver, 'cuModuleGetFunction', [vpp, vp, cp])
        launch = bind(driver, 'cuLaunchKernel', [vp, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, vp, vpp, vpp])
        check(init(0), 'cuInit')
        check(load(C.byref(module), C.cast(ptx, vp)), 'cuModuleLoadData')
        kernel = vp()
        check(function(C.byref(kernel), module, b'affine_probe'), 'cuModuleGetFunction')
        x_pointer, y_pointer, n = vp(x.data_ptr()), vp(y.data_ptr()), C.c_int(x.numel())
        parameters = (vp*3)(C.cast(C.byref(x_pointer), vp), C.cast(C.byref(y_pointer), vp), C.cast(C.byref(n), vp))
        check(launch(kernel, (n.value+127)//128, 1, 1, 128, 1, 1, 0, vp(torch.cuda.current_stream().cuda_stream), parameters, None), 'cuLaunchKernel')
        torch.cuda.synchronize()
        expected = x.cpu()*.45+.55
        actual = y.cpu()
        passed = torch.equal(expected.view(torch.int64), actual.view(torch.int64))
        report = {'passed': passed, 'device': torch.cuda.get_device_name(), 'capability': capability,
                  'nvrtcVersion': [major.value, minor.value], 'torchVersion': torch.__version__,
                  'runtimeCudaVersion': torch.version.cuda, 'compiledOptions': options,
                  'kernelSourceSha256': hashlib.sha256(SOURCE.encode()).hexdigest(), 'ptxSha256': hashlib.sha256(ptx.raw).hexdigest(),
                  'probeSourceSha256': file_hash(__file__), 'nvrtcDllSha256': file_hash(lib/'nvrtc64_120_0.dll'),
                  'fixtureElements': n.value, 'bitwiseMismatches': int((actual.view(torch.int64)!=expected.view(torch.int64)).sum()),
                  'boundary': 'Synthetic NUMERICAL capability fixture, never driving labels/training data. Actually compiled/loaded/launched1024float64multiply-adds onRTX4060 using existing bundled NVRTC, explicit separate round-to-nearest operations. NOT a neural tanh/graph match, performance benchmark, working CUDA app backend, full driving proof or universal floating-point guarantee. No installation or global driver/settings changes.'}
        atomic_json(out/'report.json', report)
        print(json.dumps(report))
        assert passed
    except Exception as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'sourceSha256': file_hash(__file__)})
        raise
    finally:
        if module.value and driver:
            driver.cuModuleUnload.argtypes = [C.c_void_p]
            driver.cuModuleUnload(module)
        if program.value and nvrtc:
            nvrtc.nvrtcDestroyProgram.argtypes = [C.POINTER(C.c_void_p)]
            nvrtc.nvrtcDestroyProgram(C.byref(program))

if __name__ == '__main__':
    run()
