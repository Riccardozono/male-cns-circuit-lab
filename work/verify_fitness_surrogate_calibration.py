"""Fresh deterministic reconstruction; does not turn predictions into fitness."""
import json
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash
from neuronal_fitness_surrogate import calibrate
from qualify_fitness_surrogate import OUT, SOURCE, load_rows

if __name__ == '__main__':
    assert not (OUT/'verification.json').exists()
    stored = json.loads((OUT/'calibration.json').read_text())
    for file, digest in stored['sourceHashes'].items():
        assert file_hash(ROOT/file) == digest
    assert file_hash(SOURCE/'report.json') == stored['sourceReportSha256']
    rebuilt = calibrate(load_rows())
    for key, value in rebuilt.items():
        if isinstance(value, float):
            assert abs(stored[key]-value) < 1e-9, key
        else:
            assert stored[key] == value, key
    proof = {'passed': True, 'calibrationSha256': file_hash(OUT/'calibration.json'), 'verifierSha256': file_hash(__file__), 'eligibleForPhysicalTrial': rebuilt['eligibleForPhysicalTrial'], 'actualNewPhysicalTrials': 0, 'boundary': 'Reproduces unique-genotype split, validation selection and held-out metrics. No prediction counted as actual driving.'}
    atomic_json(OUT/'verification.json', proof)
    print(json.dumps(proof))
