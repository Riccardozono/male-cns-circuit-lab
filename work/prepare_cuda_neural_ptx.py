"""Compile a private exact-order kernel packet after component checks.

This is not a Windows release or evidence of closed-loop driving equivalence.
"""
import hashlib
import json
from neuronal_experiment_io import ROOT, NODE, atomic_json, file_hash
from cuda_nvrtc_runtime import Module
from cuda_neural_pass_source import source
from cuda_v8_math_source import REFERENCE

def run():
    base=ROOT/'.impeccable/review/neural-sacl'
    out=base/'cuda-v3-kernel-prepared-r2'
    out.mkdir(exist_ok=False)
    proof_file=base/'cuda-neural-pass-probe/report.json'
    proof=json.loads(proof_file.read_text(encoding='utf-8'))
    assert proof['passed'] and proof['bitwiseMismatches']==0
    for f,sha in proof['sourceHashes'].items():
        assert file_hash(ROOT/f)==sha,f
    code=source()
    # The original Windows text artifact has CRLF; compare its byte hash and
    # universal-newline text separately, not LF source bytes to a CRLF file.
    proven_source=proof_file.parent/'licensed-generated-source.cu'
    assert file_hash(proven_source)==proof['generatedSourceSha256']
    assert proven_source.read_text(encoding='utf-8')==code
    (out/'licensed-kernel-source.cu').write_text(code,encoding='utf-8')
    with Module(code) as module:
        (out/'kernel.ptx').write_bytes(module.ptx.raw)
        options=module.options
    reference=json.loads(REFERENCE.read_text(encoding='utf-8'))
    (out/'LICENSE.V8-fdlibm.txt').write_text(reference['originalPermissionNotice']+'\n'+reference['license']['text'],encoding='utf-8')
    record={'format':'male-cns-private-exact-v3-cuda-kernel-v1','schema':1,
            'nodeVersion':'24.19.0','v8Version':reference['v8Version'],'nodeExecutableSha256':file_hash(NODE),
            'computeCapability':[8,9],'kernelName':'neural_pass','nTested':7721,'edgesTested':242486,
            'ptxSha256':file_hash(out/'kernel.ptx'),'sourceSha256':file_hash(out/'licensed-kernel-source.cu'),
            'licenseSha256':file_hash(out/'LICENSE.V8-fdlibm.txt'),'componentProofSha256':file_hash(proof_file),
            'compileOptions':options,'preparationSourceSha256':file_hash(__file__),
            'boundary':'Private compiled kernel packet with original V8/fdlibm notices. Component-tested numerical semantics only; not a saved driving model, released app, closed-loop proof or performance claim. Requires an explicit distinct runtime and independent native driving checks.'}
    atomic_json(out/'manifest.json',record)
    print(json.dumps(record))

if __name__=='__main__':
    run()
