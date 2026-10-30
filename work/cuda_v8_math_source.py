"""Mechanical CUDA adaptation of pinned licensed V8/fdlibm functions.

Original permission notice AND full V8 license remain in generated source.
Preparation is data, not proof of numerical equivalence.
"""
import hashlib
import json
import re
from neuronal_experiment_io import ROOT

REFERENCE = ROOT/'.impeccable/review/neural-sacl/cuda-v8-math-reference/reference.json'
EXPECTED_SOURCE_SHA = '1bf999809d4c4c1d31ad5ff3578d32614796f159e08b9e7782560d017721a0c2'

def source():
    d = json.loads(REFERENCE.read_text(encoding='utf-8'))
    assert d['passed'] and d['source']['sha256'] == EXPECTED_SOURCE_SHA
    assert hashlib.sha256(d['source']['text'].encode()).hexdigest() == EXPECTED_SOURCE_SHA
    assert hashlib.sha256(d['license']['text'].encode()).hexdigest() == d['license']['sha256']
    parts = []
    for name in ['expm1', 'tanh']:
        text = d['functions'][name]
        assert hashlib.sha256(text.encode()).hexdigest() == d['functionSha256'][name]
        text = re.sub(r'\bexpm1\b', 'v8_expm1', text)
        text = re.sub(r'\btanh\b', 'v8_tanh', text)
        text = re.sub(r'\bfabs\b', 'v8_abs', text)
        text = text.replace('double v8_'+name+'(double x)', '__device__ __forceinline__ double v8_'+name+'(double x)')
        # CUDA device-local variables cannot use these host static qualifiers.
        text = text.replace('static const volatile double', 'const volatile double')
        text = text.replace('static volatile double', 'volatile double')
        text = text.replace('static const double', 'const double')
        parts.append(text)
    notice = d['originalPermissionNotice']+'\n/*\n'+d['license']['text'].replace('*/', '* /')+'\n*/\n'
    helpers = r'''
typedef int int32_t;
typedef unsigned int uint32_t;
typedef unsigned long long uint64_t;
__device__ __forceinline__ double v8_abs(double x) {
  return __longlong_as_double(((uint64_t)__double_as_longlong(x)) & 0x7fffffffffffffffULL);
}
#define GET_HIGH_WORD(i,d) do { (i) = ((uint64_t)__double_as_longlong(d)) >> 32; } while(false)
#define GET_LOW_WORD(i,d) do { (i) = ((uint64_t)__double_as_longlong(d)) & 0xffffffffU; } while(false)
#define INSERT_WORDS(d,hi,lo) do { uint64_t b = ((uint64_t)(uint32_t)(hi) << 32) | (uint32_t)(lo); (d) = __longlong_as_double(b); } while(false)
#define SET_HIGH_WORD(d,hi) do { uint64_t b = ((uint64_t)__double_as_longlong(d)) & 0xffffffffULL; b |= (uint64_t)(uint32_t)(hi) << 32; (d) = __longlong_as_double(b); } while(false)
'''
    return notice+helpers+'\n'.join(parts)
