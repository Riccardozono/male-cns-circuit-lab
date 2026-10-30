"""Compare entire CUDA neural pass against original Node COO references.

Finite component proof only: no physical driving, optimization or app update.
"""
import ctypes as C
import hashlib
import json
import numpy as np
import torch
from neuronal_experiment_io import ROOT, atomic_json, file_hash
from cuda_nvrtc_runtime import Module
from cuda_neural_pass_source import source

def run():
    base = ROOT/'.impeccable/review/neural-sacl'
    folder = base/'neuronal-cuda-pass-inputs'
    out = base/'cuda-neural-pass-probe'
    out.mkdir(exist_ok=False)
    try:
        metadata_file = folder/'metadata.json'
        m = json.loads(metadata_file.read_text(encoding='utf-8'))
        assert m['format'] == 'male-cns-actual-v3-neural-pass-fixtures-v1' and m['nodeVersion'] == '24.19.0'
        assert file_hash(m['modelFile']) == m['modelSha256']
        for file, sha in m['sourceHashes'].items():
            assert file_hash(ROOT/file) == sha, file
        for name, info in m['files'].items():
            assert file_hash(folder/name) == info['sha256'] and (folder/name).stat().st_size == info['bytes']
        def read(name, dtype='<f8'):
            a = np.fromfile(folder/name, dtype=dtype)
            assert len(a) == m['files'][name]['elements']
            return a
        offsets = read(m['graphFiles']['offsets'], '<u4')
        sources = read(m['graphFiles']['sources'], '<u4')
        scaled = read(m['graphFiles']['scaled'])
        n, batch = m['n'], len(m['states'])
        assert len(offsets) == n+1 and offsets[-1] == m['edgeCount'] == len(sources) == len(scaled)
        assert sources.max() < n and np.isfinite(scaled).all()
        graph = [torch.from_numpy(a.copy()).cuda() for a in [offsets, sources, scaled]]
        initial = {k: np.stack([read(s['input'][k]) for s in m['states']]) for k in ['activity','next','sum','injection','gains']}
        for x in initial.values():
            assert x.shape == (batch, n) and np.isfinite(x).all()
        code = source()
        (out/'licensed-generated-source.cu').write_text(code, encoding='utf-8')
        cases = []
        with Module(code) as mod:
            for iterations in [1,2,4,8]:
                a, b, sums, injection, gains = [torch.from_numpy(initial[k].copy()).cuda() for k in ['activity','next','sum','injection','gains']]
                for _ in range(iterations):
                    mod.launch('neural_pass', [*graph, injection, a, gains, b, sums, C.c_int(n), C.c_int(batch)], ((n*batch+127)//128,1,1))
                    a, b = b, a
                torch.cuda.synchronize()
                output = {k: t.cpu().numpy() for k, t in [('activity',a),('next',b),('sum',sums)]}
                comparisons = []
                for i, state in enumerate(m['states']):
                    expected = next(row for row in state['expected'] if row['iterations'] == iterations)
                    for key, array in output.items():
                        gold = read(expected[key])
                        neq = array[i].view(np.uint64)!=gold.view(np.uint64)
                        idx = np.flatnonzero(neq)[:5]
                        comparisons.append({'state': state['control'], 'field': key, 'bitwiseMismatches': int(neq.sum()),
                            'first': [{'index':int(j),'node':float(gold[j]),'cuda':float(array[i,j])} for j in idx]})
                cases.append({'iterations':iterations,'comparedValues':batch*n*3,'comparisons':comparisons})
            options, ptx_sha = mod.options, hashlib.sha256(mod.ptx.raw).hexdigest()
        total = sum(c['comparedValues'] for c in cases)
        mismatches = sum(r['bitwiseMismatches'] for c in cases for r in c['comparisons'])
        report = {'passed': mismatches == 0, 'device':torch.cuda.get_device_name(),'n':n,'edges':m['edgeCount'],
                  'actualReachedStates':batch,'cases':cases,'comparedValues':total,'bitwiseMismatches':mismatches,
                  'fixtureMetadataSha256':file_hash(metadata_file),'modelSha256':m['modelSha256'],
                  'generatedSourceSha256':file_hash(out/'licensed-generated-source.cu'),'ptxSha256':ptx_sha,'compileOptions':options,
                  'sourceHashes':{f:file_hash(ROOT/f) for f in ['work/probe_cuda_neural_pass.py','work/cuda_neural_pass_source.py','work/cuda_nvrtc_runtime.py','work/cuda_v8_math_source.py']},
                  'boundary':'Finite entire neural-pass component comparison:8initial reached V3brains, actual injection/gains,1/2/4/8iterations. Extra passes hold sensors fixed and are NOT physical episodes, model-training examples or teacher commands. Zero mismatches does NOT prove entire closed-loop driving, general graphs/gains, app integration or speedup. Original GPU/CPU app sources, saves and releases unchanged.'}
        atomic_json(out/'report.json',report)
        print(json.dumps({k:v for k,v in report.items() if k!='cases'}))
    except Exception as error:
        atomic_json(out/'failure.json',{'error':repr(error),'sourceSha256':file_hash(__file__)})
        raise

if __name__=='__main__':
    run()
