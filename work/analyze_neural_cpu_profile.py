"""Summarize actual V8 samples; these are not precise per-function timings."""
import json
from neuronal_experiment_io import ROOT, atomic_json, file_hash

def run():
    out = ROOT/'.impeccable/review/neural-sacl/neuronal-native-cpu-profile'
    profile_file = out/'profile.cpuprofile'
    data = json.loads(profile_file.read_text(encoding='utf-8'))
    identity = json.loads((out/'identity.json').read_text(encoding='utf-8'))
    proof = json.loads((out/'native-proof.json').read_text(encoding='utf-8'))
    assert proof['passed'] and proof['complete'] and not proof['censored'] and not proof['overlap']
    assert proof['modelSha256'] == identity['modelSha256'] == file_hash(identity['modelFile'])
    for f, sha in identity['sourceHashes'].items():
        assert file_hash(ROOT/f) == sha, f
    counts = {}
    for i in data['samples']:
        counts[i] = counts.get(i, 0)+1
    total = len(data['samples'])
    assert total > 0
    nodes = {n['id']: n for n in data['nodes']}
    def record(n, samples):
        frame = n['callFrame']
        return {'name': frame['functionName'] or '(anonymous)', 'file': frame.get('url', ''),
                'line': frame.get('lineNumber', -1)+1, 'samples': samples,
                'sampleSharePercent': samples/total*100}
    top = sorted([record(nodes[i], n) for i, n in counts.items()], key=lambda r: -r['samples'])[:30]
    result = {'passed': True, 'format': 'male-cns-cpu-sample-summary-v1',
              'sourceSha256': file_hash(__file__), 'profileSha256': file_hash(profile_file),
              'nativeProofSha256': file_hash(out/'native-proof.json'), 'totalSamples': total, 'topSelf': top,
              'boundary': 'Self samples from one instrumented complete native episode, including model startup/GC and profiler overhead. Shares are not exact durations, app FPS or a causal performance comparison. Concurrent learner may affect scheduling. This report identifies candidates to investigate, not a verified optimization.'}
    atomic_json(out/'summary.json', result)
    print(json.dumps({'passed': True, 'totalSamples': total, 'topSelf': top[:12]}))

if __name__ == '__main__':
    run()
