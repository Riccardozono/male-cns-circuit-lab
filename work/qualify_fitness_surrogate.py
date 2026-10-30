"""Check held-out predictive value BEFORE authorizing more physical trials."""
import json
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash
from neuronal_fitness_surrogate import calibrate, dataset

BASE = ROOT/'.impeccable/review/neural-sacl'
SOURCE = BASE/'neuronal-current-feedback256-r2'
OUT = BASE/'current-feedback-fitness-surrogate-calibration'

def load_rows():
    r = json.loads((SOURCE/'report.json').read_text())
    v = json.loads((SOURCE/'verification.json').read_text())
    assert r['passed'] and v['passed'] and v['reportSha256'] == file_hash(SOURCE/'report.json')
    for file, digest in {**r['identity']['sourceHashes'], **r['identity']['sourceClosure']}.items():
        assert file_hash(ROOT/file) == digest
    rows = []
    for name, digest in v['iterationHashes'].items():
        assert file_hash(SOURCE/name) == digest
        rows.extend(json.loads((SOURCE/name).read_text())['evaluated'])
    assert len(rows) == r['actualCandidateEvaluations'] == 256
    return rows

if __name__ == '__main__':
    OUT.mkdir(exist_ok=False)
    rows = load_rows()
    result = calibrate(rows)
    result.update({'sourceReportSha256': file_hash(SOURCE/'report.json'), 'recordedPhysicalEpisodes': len(rows), 'sourceHashes': {file: file_hash(ROOT/file) for file in ['work/qualify_fitness_surrogate.py', 'work/neuronal_fitness_surrogate.py']}})
    atomic_json(OUT/'calibration.json', result)
    print(json.dumps({k: v for k, v in result.items() if k not in ['choices', 'partitions', 'sourceHashes']}))
