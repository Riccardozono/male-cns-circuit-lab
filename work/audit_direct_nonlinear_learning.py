"""Audit recorded parameter changes; not proof of improved driving."""
import json
import math
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash

if __name__ == '__main__':
    directory = ROOT/'.impeccable/review/neural-sacl/direct-neuronal-nonlinear64-r7-first'
    target = directory/'parameter-learning-audit.json'
    assert not target.exists()
    report = json.loads((directory/'report.json').read_text())
    verified = json.loads((directory/'verification.json').read_text())
    assert verified['passed'] and verified['reportSha256'] == file_hash(directory/'report.json')
    preflight = ROOT/'.impeccable/review/neural-sacl/direct-neuronal-nonlinear-preflight/verification.json'
    assert file_hash(preflight) == report['identity']['preflightSha256']
    initial = json.loads(preflight.read_text())['metadata']['initialWeights']
    final = report['events'][-1]['metrics']['weights']
    assert len(initial) == len(final) == 5276
    cursor, changes = 0, {}
    for name, count in [('linear', 154), ('hiddenWeight', 64*77), ('hiddenBias', 64), ('outputWeight', 128), ('outputBias', 2)]:
        delta = [b-a for a, b in zip(initial[cursor:cursor+count], final[cursor:cursor+count])]
        changes[name] = {'parameters': count, 'changed': sum(v != 0 for v in delta), 'rmsChange': math.sqrt(sum(v*v for v in delta)/count), 'maxAbsChange': max(abs(v) for v in delta)}
        cursor += count
    assert cursor == len(final)
    proof = {'passed': True, 'reportSha256': verified['reportSha256'], 'scriptSha256': file_hash(__file__), 'actualUpdates': verified['reconstructedUpdates'], 'changes': changes, 'boundary': 'Actual recorded parameter deltas after verified optimizer reconstruction. Changed parameters prove optimization activity, NOT learned driving, completed laps or a better policy.'}
    atomic_json(target, proof)
    print(json.dumps(proof))
