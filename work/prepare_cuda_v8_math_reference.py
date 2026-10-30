"""Acquire exact-version upstream V8 math/permission notices as reference DATA.

No downloaded code is executed, compiled or installed by this preparation.
"""
import hashlib
import json
import re
import subprocess
from urllib.request import urlopen
from neuronal_experiment_io import ROOT, NODE, file_hash, atomic_json

BASE_URL = 'https://raw.githubusercontent.com/nodejs/node/v24.19.0/'

def download(relative):
    url = BASE_URL+relative
    with urlopen(url, timeout=30) as response:
        raw = response.read(2*1024*1024+1)
    if len(raw)>2*1024*1024:
        raise ValueError('Bounded upstream reference required')
    return {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'text': raw.decode('utf-8')}

def extract_function(text, name):
    # Keep offsets intact while excluding comments/strings from brace counting.
    clean = re.sub(r'/\*.*?\*/|//[^\n]*|"(?:[^"\\]|\\.)*"', lambda m: ' '*len(m.group()), text, flags=re.S)
    match = re.search(r'^double '+name+r'\(double x\)\s*\{', clean, flags=re.M)
    if not match:
        raise ValueError('Expected pinned upstream function missing: '+name)
    depth = 1
    for i in range(match.end(), len(clean)):
        depth += (clean[i]=='{')-(clean[i]=='}')
        if depth == 0:
            return text[match.start():i+1]
    raise ValueError('Unbalanced upstream function: '+name)

def run():
    out = ROOT/'.impeccable/review/neural-sacl/cuda-v8-math-reference'
    out.mkdir(exist_ok=False)
    try:
        versions = json.loads(subprocess.check_output([str(NODE), '-p', 'JSON.stringify(process.versions)'], cwd=ROOT,
                              text=True, creationflags=subprocess.CREATE_NO_WINDOW))
        assert versions['node'] == '24.19.0'
        source = download('deps/v8/src/base/ieee754.cc')
        license_ = download('deps/v8/LICENSE')
        header = download('deps/v8/include/v8-version.h')
        parts = [int(re.search(r'#define '+name+r'\s+(\d+)', header['text']).group(1))
                 for name in ['V8_MAJOR_VERSION', 'V8_MINOR_VERSION', 'V8_BUILD_NUMBER', 'V8_PATCH_LEVEL']]
        assert '.'.join(map(str, parts)) == versions['v8'].split('-')[0]
        assert 'Permission to use, copy, modify, and distribute' in source['text'][:1000]
        assert 'Redistribution and use in source and binary forms' in license_['text']
        functions = {name: extract_function(source['text'], name) for name in ['expm1', 'tanh']}
        record = {'format': 'male-cns-pinned-v8-math-reference-data-v1', 'passed': True,
                  'nodeExecutableSha256': file_hash(NODE), 'nodeVersion': versions['node'], 'v8Version': versions['v8'],
                  'source': source, 'license': license_, 'versionHeader': header,
                  'originalPermissionNotice': source['text'].split('#include', 1)[0], 'functions': functions,
                  'functionSha256': {k: hashlib.sha256(v.encode()).hexdigest() for k, v in functions.items()},
                  'preparationSourceSha256': file_hash(__file__),
                  'boundary': 'Pinned upstream reference DATA with original permission and V8 license preserved. Not a CUDA port, executable math test, brain match, performance benchmark or app deployment. Any adaptation must preserve notices and be tested against actual pinned Node outputs; source similarity alone is not numerical equivalence.'}
        atomic_json(out/'reference.json', record)
        print(json.dumps({'passed': True, 'nodeVersion': record['nodeVersion'], 'v8Version': record['v8Version'],
                          'sourceSha256': source['sha256'], 'functionSha256': record['functionSha256']}))
    except Exception as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'sourceSha256': file_hash(__file__)})
        raise

if __name__ == '__main__':
    run()
