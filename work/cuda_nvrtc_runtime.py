"""Small owned-context NVRTC/Driver adapter; no SDK installation or global reset.

Used only by explicit local numerical diagnostics, not app startup.
"""
import ctypes as C
import os
from pathlib import Path
import torch

class Module:
    def __init__(self, source):
        if not torch.cuda.is_available():
            raise RuntimeError('Actual CUDA device required')
        self.source, self.module = source, C.c_void_p()
        self.library_dir = Path(torch.__file__).parent/'lib'
        self.dll_directory = os.add_dll_directory(str(self.library_dir))
        self.nvrtc = C.CDLL(str(self.library_dir/'nvrtc64_120_0.dll'))
        self.driver = C.WinDLL('nvcuda.dll')
        self.program = C.c_void_p()
        self.closed = False
        vp, vpp, cp, cpp = C.c_void_p, C.POINTER(C.c_void_p), C.c_char_p, C.POINTER(C.c_char_p)
        def bind(dll, name, args):
            f = getattr(dll, name)
            f.argtypes, f.restype = args, C.c_int
            return f
        self.create = bind(self.nvrtc, 'nvrtcCreateProgram', [vpp, cp, cp, C.c_int, cpp, cpp])
        self.compile = bind(self.nvrtc, 'nvrtcCompileProgram', [vp, C.c_int, cpp])
        self.destroy = bind(self.nvrtc, 'nvrtcDestroyProgram', [vpp])
        self.log_size = bind(self.nvrtc, 'nvrtcGetProgramLogSize', [vp, C.POINTER(C.c_size_t)])
        self.get_log = bind(self.nvrtc, 'nvrtcGetProgramLog', [vp, vp])
        self.ptx_size = bind(self.nvrtc, 'nvrtcGetPTXSize', [vp, C.POINTER(C.c_size_t)])
        self.get_ptx = bind(self.nvrtc, 'nvrtcGetPTX', [vp, vp])
        self.init = bind(self.driver, 'cuInit', [C.c_uint])
        self.load = bind(self.driver, 'cuModuleLoadData', [vpp, vp])
        self.function = bind(self.driver, 'cuModuleGetFunction', [vpp, vp, cp])
        self.launch_kernel = bind(self.driver, 'cuLaunchKernel', [vp, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, C.c_uint, vp, vpp, vpp])
        self.unload = bind(self.driver, 'cuModuleUnload', [vp])
        capability = torch.cuda.get_device_capability()
        self.options = [f'--gpu-architecture=compute_{capability[0]}{capability[1]}',
                        '--fmad=false', '--prec-div=true', '--prec-sqrt=true', '--ftz=false', '--std=c++14']
        try:
            self.check(self.create(C.byref(self.program), source.encode(), b'owned-numerical-diagnostic.cu', 0, None, None), 'nvrtcCreateProgram')
            args = (cp*len(self.options))(*(s.encode() for s in self.options))
            status = self.compile(self.program, len(self.options), args)
            size = C.c_size_t()
            self.check(self.log_size(self.program, C.byref(size)), 'nvrtcGetProgramLogSize')
            log = C.create_string_buffer(size.value)
            self.check(self.get_log(self.program, log), 'nvrtcGetProgramLog')
            self.log = log.value.decode()
            if status:
                raise RuntimeError(f'nvrtcCompileProgram: {status}: {self.log}')
            self.check(self.ptx_size(self.program, C.byref(size)), 'nvrtcGetPTXSize')
            self.ptx = C.create_string_buffer(size.value)
            self.check(self.get_ptx(self.program, self.ptx), 'nvrtcGetPTX')
            # A real allocation establishes the Torch-owned primary context.
            self.context_fixture = torch.empty(1, device='cuda')
            self.check(self.init(0), 'cuInit')
            self.check(self.load(C.byref(self.module), C.cast(self.ptx, vp)), 'cuModuleLoadData')
        except Exception:
            self.close()
            raise

    @staticmethod
    def check(code, operation):
        if code:
            raise RuntimeError(f'{operation}: CUDA/NVRTC code {code}')

    def launch(self, name, arguments, grid, block=(128, 1, 1)):
        if self.closed:
            raise RuntimeError('Owned CUDA module already closed')
        function = C.c_void_p()
        self.check(self.function(C.byref(function), self.module, name.encode()), 'cuModuleGetFunction')
        values = []
        for a in arguments:
            if isinstance(a, torch.Tensor):
                if not a.is_cuda or not a.is_contiguous() or a.device.index != torch.cuda.current_device():
                    raise ValueError('Contiguous tensors on owned current device required')
                values.append(C.c_void_p(a.data_ptr()))
            elif isinstance(a, (C.c_int, C.c_uint, C.c_double, C.c_ulonglong)):
                values.append(a)
            else:
                raise ValueError('Explicit tensor or typed scalar arguments required')
        pointers = (C.c_void_p*len(values))(*(C.cast(C.byref(v), C.c_void_p) for v in values))
        self.check(self.launch_kernel(function, *grid, *block, 0, C.c_void_p(torch.cuda.current_stream().cuda_stream), pointers, None), 'cuLaunchKernel')

    def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            if self.module.value:
                torch.cuda.synchronize()
                self.unload(self.module)
        finally:
            if self.program.value:
                self.destroy(C.byref(self.program))
            self.dll_directory.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
