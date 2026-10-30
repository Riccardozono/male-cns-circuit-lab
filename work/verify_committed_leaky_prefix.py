"""Reconcile only the twelve committed real iterations of interrupted study."""
import json
from neuronal_experiment_io_retry import ROOT, NODE, Pipe, atomic_json, file_hash
from train_neural_leaky_context import BASE, valid, improves

old = BASE/'neuronal-leaky-context256-first'
out = BASE/'leaky-context-committed12-prepared'
out.mkdir(exist_ok=False)
identity = json.loads((old/'identity.json').read_text())
assert not (old/'report.json').exists()
assert 'PermissionError' in json.loads((old/'failure.json').read_text())['error']
for file, sha in {**identity['sourceHashes'], **identity['completeInferenceAndOptimizerSourceClosure']}.items():
    assert file_hash(ROOT/file) == sha, file
assert file_hash(identity['originFile']) == identity['originSha256']
assert file_hash(identity['preparedFile']) == identity['preparedSha256']
origin = json.loads(json.loads(open(identity['originFile'], encoding='utf-8').read())['payloadJson'])
elite, best, hashes, count = [0.0]*6, None, {}, 0
optimizer = Pipe(ROOT/'work/neural-instant-context-search.cjs', {'mean': elite, 'sigma': .5, 'population': 16, 'seed': 161026})
try:
    for generation in range(1, 13):
        file = old/f'iteration-{generation:03}.json'
        hashes[file.name] = file_hash(file)
        row = json.loads(file.read_text())
        asked = json.loads((old/f'asked-{generation:03}.json').read_text())
        genes = optimizer.request('ask', elite=elite)
        assert genes == asked['genes'] and row['protectedElite'] == elite and len(row['evaluated']) == 16
        scores = []
        for index, result in enumerate(row['evaluated']):
            assert result['candidate'] == index and result['genes'] == genes[index] and valid(result['episode'])
            scores.append(result['episode']['result']['fitness'])
            if improves(result['episode'], best['episode']['result'] if best else origin['expectedResult']):
                best, elite = result, result['genes'][:]
        assert scores == row['fitness']
        optimizer.request('tell', fitness=scores)
        state = optimizer.request('state')
        assert state == row['optimizerState']
        count += 16
    assert best is None and elite == [0]*6 and count == 192
finally:
    optimizer.close()
restored = Pipe(ROOT/'work/neural-instant-context-search-restored.cjs', {'restored': state})
try:
    assert restored.request('state') == state
    actual = restored.request('ask', elite=elite)
    assert actual == json.loads((old/'asked-013.json').read_text())['genes']
finally:
    restored.close()
proof = {'passed': True, 'sourceStudy': str(old), 'sourceIdentitySha256': file_hash(old/'identity.json'),
         'committedGenerations': 12, 'committedActualCandidates': count, 'elite': elite, 'bestClean': None,
         'optimizerState': state, 'iterationHashes': hashes, 'sourceVerifierSha256': file_hash(__file__),
         'sourceIdentity': identity, 'restoredNextAskMatchesInterruptedAsk13': True,
         'boundary': 'Only192 committed actual candidate records reused. Interrupted generation13 has no committed fitness batch and MUST be evaluated fresh; no claimed new physical evidence here.'}
atomic_json(out/'verification.json', proof)
print(json.dumps({'passed': True, 'committedGenerations': 12, 'committedActualCandidates': count, 'restoredNextAskMatchesInterruptedAsk13': True}))
