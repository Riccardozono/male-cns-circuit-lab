"""Cross-family research guard; NEVER rewrites a live Windows model registry."""
import json
import math
from pathlib import Path
from neuronal_experiment_io import ROOT, NODE, file_hash, atomic_json

KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds']
UNSAFE = ['urto', 'fuori pista', 'progresso non valido']

def dominates(a, b):
    return (not any(s in a['reason'] for s in UNSAFE) and a['fitness'] > b['fitness'] + 1e-6
            and a['bestProgress'] >= b['bestProgress'] and a['laps'] >= b['laps'])

def entry(report_file, family, expected_model_sha=None):
    report_file = Path(report_file).resolve()
    verification_file = report_file.parent/'verification.json'
    r = json.loads(report_file.read_text(encoding='utf-8'))
    v = json.loads(verification_file.read_text(encoding='utf-8'))
    assert r['passed'] and r['phase'] == 'finished' and v['passed']
    assert v['reportSha256'] == file_hash(report_file)
    model_file = Path(r['cleanModelFile']).resolve()
    assert model_file.is_relative_to(report_file.parent)
    digest = file_hash(model_file)
    assert digest == v['cleanModelSha256' if family == 'frontier-chain' else 'modelSha256']
    if expected_model_sha:
        assert digest == expected_model_sha
    envelope = json.loads(model_file.read_text(encoding='utf-8'))
    import hashlib
    assert hashlib.sha256(envelope['payloadJson'].encode('utf-8')).hexdigest() == envelope['sha256']
    data = json.loads(envelope['payloadJson'])
    assert data['status'] == 'clean-verified' and data['appVersion'] == '5.6.0'
    assert data['modelId'] == 'v3' and data['circuitId'] == 'monza'
    assert data['numericRuntime'] == '24.19.0'
    assert 1 <= len(data['sourceCompatibility']) <= 200
    for file, sha in data['sourceCompatibility'].items():
        full = (ROOT/file).resolve()
        assert full.is_relative_to(ROOT) and file_hash(full) == sha, file
    environment = r['identity']['environment']
    assert environment['objectiveRevision'] == 'progress-5-crash-safety-experiment'
    assert environment['vehicleRevision'] == '992-gt3r-si-2'
    assert environment['graph']['nodes'] == 7721 and environment['graph']['edges'] == 242486
    proofs = r['nativeCleanProofs' if family == 'frontier-chain' else 'nativeProofs']
    assert len(proofs) == 2
    result = proofs[0]['result']
    assert result['complete'] and result['laps'] in [0, 1, 2]
    assert not any(s in result['reason'] for s in UNSAFE)
    assert all(math.isfinite(result[k]) for k in ['bestProgress', 'fitness', 'totalSimulationSeconds'])
    assert len(result['lapTimes']) == result['laps'] and all(math.isfinite(t) and t > 0 for t in result['lapTimes'])
    for p in proofs:
        assert p['passed'] and p['complete'] and not p['censored'] and not p['overlap']
        assert p['modelSha256'] == digest and p['actionTraceSha256'] == data['fullTraceSha256']
        assert all(p['result'][k] == result[k] == data['expectedResult'][k] for k in KEYS)
        assert p['result']['lapTimes'] == result['lapTimes'] == data['expectedResult']['lapTimes']
    return {'family': family, 'modelFile': str(model_file), 'modelSha256': digest,
            'result': result, 'actionTraceSha256': data['fullTraceSha256'],
            'reportFile': str(report_file), 'reportSha256': file_hash(report_file),
            'verificationSha256': file_hash(verification_file)}

def refresh(emit=True):
    base = ROOT/'.impeccable/review/neural-sacl'
    chain = json.loads((base/'neuronal-clean-champion.json').read_text(encoding='utf-8'))
    assert chain['nodeExecutableSha256'] == file_hash(NODE)
    windows = entry(chain['selected']['reportFile'], 'frontier-chain', chain['selected']['modelSha256'])
    rows = [windows]
    for file in sorted(base.glob('neuronal-statehead-*/report.json')):
        if (file.parent/'verification.json').is_file():
            report = json.loads(file.read_text(encoding='utf-8'))
            if report.get('cleanModelFile'):
                rows.append(entry(file, 'state-head'))
    target = base/'neuronal-verified-model-catalog.json'
    old = json.loads(target.read_text(encoding='utf-8')) if target.is_file() else None
    selected = windows
    if old:
        selected = next((r for r in rows if r['modelSha256'] == old['selectedResearch']['modelSha256']), None)
        if selected is None:
            raise RuntimeError('Previous independently verified research champion no longer reconciles; no silent downgrade')
    for row in sorted(rows, key=lambda r: (r['result']['laps'], r['result']['bestProgress'], r['result']['fitness'])):
        if dominates(row['result'], selected['result']):
            selected = row
    changed = not old or old['selectedResearch']['modelSha256'] != selected['modelSha256']
    history = old['history'][:] if old else []
    if changed:
        history.append({'modelSha256': selected['modelSha256'], 'family': selected['family'], 'result': selected['result']})
    catalog = {'format': 'male-cns-private-verified-controller-catalog-v1', 'schema': 1,
               'appVersion': '5.6.0', 'modelId': 'v3', 'circuitId': 'monza',
               'nodeExecutableSha256': file_hash(NODE), 'selectedResearch': selected,
               'frozenWindowsCompatible': windows, 'entries': rows, 'history': history,
               'boundary': 'Verified research champions across the frontier-chain and state-dependent-head families under the same V3/Monza/R5/vehicle/runtime. Only exact native proofs and current source identity qualify. This catalog NEVER rewrites the chain registry or replaces a live Windows model; incompatible research improvements require a separate integration. A farther crash or newer timestamp cannot downgrade the protected champion.'}
    atomic_json(target, catalog)
    if emit:
        print(json.dumps({'changed': changed, 'selectedResearch': selected, 'frozenWindowsCompatible': windows}, ensure_ascii=False))
    return catalog

if __name__ == '__main__':
    refresh()
