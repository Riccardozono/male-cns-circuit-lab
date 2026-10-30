"""Reconcile actual bounded search, global guard, export and native proofs."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash

KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds']
ZERO = [0.0] * 18

def valid(e):
    r = e['result']
    return (e['complete'] is True and e['censored'] is False and e['gasBrakeOverlapSteps'] == 0
            and all(math.isfinite(r[k]) for k in ['bestProgress', 'fitness', 'laps', 'totalSimulationSeconds'])
            and r['laps'] in [0, 1, 2] and len(r['lapTimes']) == r['laps']
            and all(math.isfinite(v) and v > 0 for v in r['lapTimes']))

def dominates(e, prior):
    r = e['result']
    return (valid(e) and not any(s in r['reason'] for s in ['urto', 'fuori pista', 'progresso non valido'])
            and r['fitness'] > prior['fitness'] + 1e-6
            and r['bestProgress'] >= prior['bestProgress'] and r['laps'] >= prior['laps'])

def verify(tag):
    if not tag.replace('-', '').isalnum():
        raise ValueError('Isolated report name required')
    out = ROOT/'.impeccable/review/neural-sacl'/tag
    report_file = out/'report.json'
    r = json.loads(report_file.read_text(encoding='utf-8'))
    assert r['passed'] and r['phase'] == 'finished'
    identity = r['identity']
    assert identity['nodeExecutableSha256'] == file_hash(NODE)
    for file, sha in identity['sourceHashes'].items():
        assert file_hash(ROOT/file) == sha, file
    assert file_hash(identity['modelFile']) == identity['modelSha256']
    assert file_hash(identity['preflightFile']) == identity['preflightSha256']
    preflight = json.loads(Path(identity['preflightFile']).read_text(encoding='utf-8'))
    assert preflight['passed'] and preflight['metadata'] == identity['environment']
    source_model = json.loads(json.loads(Path(identity['modelFile']).read_text(encoding='utf-8'))['payloadJson'])
    assert source_model['weights'] == ZERO
    assert source_model['parentSha256'] == identity['protectedModelSha256']
    protected = identity['protectedGlobalResult']
    assert all(source_model['expectedResult'][k] == protected[k] for k in KEYS)
    for e in r['initialSuffixes']:
        assert valid(e) and all(e['result'][k] == protected[k] for k in KEYS)
        assert e['actionTraceSha256'] == preflight['practice']['actionTraceSha256']
    records, iterations = r['records'], r['iterations']
    assert len(records) == r['actualCandidateEvaluations'] == len(iterations)*16
    assert 1 <= len(iterations) <= identity['configuration']['iterations']
    assert identity['plasticParameters'] == 18 and identity['population'] == 16
    assert identity['initialSigma'] == .6 and identity['seed'] == 15102115
    assert identity['geneBounds'] == [-8, 8]
    elite, elite_genes = r['initialSuffixes'][0], ZERO[:]
    best = best_genes = None
    optimizer = Pipe(ROOT/'work/neural-statehead-cma.cjs',
                     {'mean': ZERO, 'sigma': .6, 'population': 16, 'seed': 15102115})
    try:
        for iteration, summary in enumerate(iterations, 1):
            batch = records[(iteration-1)*16:iteration*16]
            asked = optimizer.request('ask', elite=elite_genes)
            assert [row['genes'] for row in batch] == asked
            assert batch[0]['genes'] == elite_genes
            assert batch[0]['episode']['actionTraceSha256'] == elite['actionTraceSha256']
            scores = []
            for row in batch:
                e, genes = row['episode'], row['genes']
                assert row['iteration'] == iteration and valid(e)
                assert len(genes) == 18 and all(math.isfinite(v) and -8 <= v <= 8 for v in genes)
                scores.append(e['result']['fitness'])
                if e['result']['fitness'] > elite['result']['fitness'] + 1e-6:
                    elite, elite_genes = e, genes[:]
                if dominates(e, best['result'] if best else protected):
                    best, best_genes = e, genes[:]
            actual = optimizer.request('tell', fitness=scores)
            assert actual == summary['optimizer']
            assert summary['evaluations'] == iteration*16
            assert summary['eliteGenes'] == elite_genes and summary['elite'] == elite['result']
            assert summary['pendingCleanGenes'] == best_genes
            assert summary['pendingClean'] == (best['result'] if best else None)
        assert optimizer.request('state') == r['optimizerState']
    finally:
        optimizer.close()
    selected, genes = best or r['initialSuffixes'][0], best_genes if best else ZERO
    assert r['improvedProtectedGlobal'] == bool(best)
    assert r['selectedGenes'] == genes and r['selectedPractice'] == selected
    assert r['searchEliteGenes'] == elite_genes and r['searchElite'] == elite
    assert len(r['fullProofs']) == len(r['nativeProofs']) == 2
    trace = r['fullProofs'][0]['actionTraceSha256']
    for e in r['fullProofs']:
        assert valid(e) and e['validationMode'] == 'full'
        assert all(e['result'][k] == selected['result'][k] for k in KEYS)
        assert e['result']['lapTimes'] == selected['result']['lapTimes']
        assert e['actionTraceSha256'] == trace
        if best:
            assert dominates(e, protected)
    model_file = Path(r['cleanModelFile'])
    assert file_hash(model_file) == r['cleanModelSha256']
    envelope = json.loads(model_file.read_text(encoding='utf-8'))
    assert hashlib.sha256(envelope['payloadJson'].encode('utf-8')).hexdigest() == envelope['sha256']
    model = json.loads(envelope['payloadJson'])
    assert model['status'] == 'clean-verified' and model['weights'] == genes
    assert model['parentSha256'] == identity['protectedModelSha256']
    assert model['sourceCompatibility'] == source_model['sourceCompatibility']
    assert model['basis'] == source_model['basis'] and model['projection'] == source_model['projection']
    assert model['parentModelText'] == source_model['parentModelText']
    assert model['expectedResult'] == r['fullProofs'][0]['result'] and model['fullTraceSha256'] == trace
    assert model['provenance']['actualCandidateEvaluations'] == len(records)
    assert model['provenance']['sourceSearchIdentitySha256'] == file_hash(out/'identity.json')
    for proof in r['nativeProofs']:
        assert proof['passed'] and proof['complete'] and not proof['censored'] and not proof['overlap']
        assert proof['modelSha256'] == file_hash(model_file) and proof['actionTraceSha256'] == trace
        assert all(proof['result'][k] == model['expectedResult'][k] for k in KEYS)
        assert proof['result']['lapTimes'] == model['expectedResult']['lapTimes']
    farthest = max([{'genes': ZERO, 'episode': r['initialSuffixes'][0]}]+records,
                   key=lambda row: (row['episode']['result']['laps'], row['episode']['result']['bestProgress'], row['episode']['result']['fitness']))
    assert farthest == r['farthestCachedExploration']
    proof = {'passed': True, 'reportSha256': file_hash(report_file), 'modelSha256': file_hash(model_file),
             'actualCandidateEvaluations': len(records), 'updatedOptimizerGenerations': len(iterations),
             'improvedProtectedGlobal': bool(best), 'selected': model['expectedResult'],
             'changedCoefficients': sum(v != 0 for v in genes), 'actionTraceSha256': trace,
             'checks': ['frozen source/runtime/preflight identity', 'current global6584m guard',
                        'every bounded asked vector equals actual scored coordinates',
                        'every protected elite freshly physically reevaluated',
                        'all complete actual fitness batches reproduce the entire optimizer state',
                        'strict clean progress/lap/fitness dominance, not a farther crash',
                        'two full from-line and two independently loaded native entire traces',
                        'data-only export preserves parent, PCA and basis exactly'],
             'boundary': 'Independent numerical/log reconciliation, NOT another physical replay of every candidate. The selected policy has its own two actual full and two fresh native proofs. A gain in this one V3/Monza warm-start study does not prove two laps or other models/tracks/cold-start convergence; no Windows install or release.'}
    atomic_json(out/'verification.json', proof)
    print(json.dumps(proof, ensure_ascii=False))
    return proof

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('tag')
    verify(parser.parse_args().tag)
