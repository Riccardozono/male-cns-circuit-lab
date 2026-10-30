"""Fit normalization on ACTUAL actor observations only, never action targets.

No raw physical sensors/coordinates, rewards or labels are used to fit stats.
The x-vector includes genuine neural history and existing controller context.
"""
import json
import numpy as np
from neuronal_experiment_io import ROOT, atomic_json, file_hash

def run():
    base = ROOT/'.impeccable/review/neural-sacl'
    source = base/'neuronal-ppo-symmetric-steering-first'
    out = base/'neuronal-normalization-520-prepared'
    out.mkdir(exist_ok=False)
    report_file = source/'report.json'
    verification_file = source/'verification.json'
    r = json.loads(report_file.read_text(encoding='utf-8'))
    v = json.loads(verification_file.read_text(encoding='utf-8'))
    assert r['passed'] and v['passed'] and v['reportSha256'] == file_hash(report_file)
    batches, hashes = [], {}
    for i in range(1, len(r['events'])+1):
        file = source/f'rollout-{i:03}.json'
        assert v['rolloutHashes'][file.name] == file_hash(file)
        rows = json.loads(file.read_text(encoding='utf-8'))['rows']
        # Explicitly select x ONLY. No sampled action/reward/done/label columns.
        x = np.array([row['x'] for row in rows], dtype=np.float64)
        assert x.shape == (256, 520) and np.isfinite(x).all() and np.abs(x).max() <= 1
        batches.append(x)
        hashes[file.name] = file_hash(file)
    x = np.concatenate(batches)
    assert len(x) == r['actualTransitions']
    mean, std = x.mean(0), x.std(0)
    scales = np.maximum(std, .05)
    normalized = np.tanh((x-mean)/scales)
    norm_std = normalized.std(0)
    data = {'format': 'male-cns-actual-neuronal-observation-normalization-v1', 'schema': 1,
            'dimensions': 520, 'mean': mean.tolist(), 'scales': scales.tolist(),
            'transform': 'tanh((actualObservedX-mean)/scale)', 'scaleFloor': .05,
            'sourceReportFile': str(report_file), 'sourceReportSha256': file_hash(report_file),
            'sourceVerificationSha256': file_hash(verification_file), 'sourceModelSha256': r['identity']['originSha256'],
            'sourceObservationRevision': 'full516-neuronal-history-plus2-parent-commands-plus2-previous-residuals',
            'actualObservationRows': len(x), 'sourceRolloutHashes': hashes,
            'preparationSourceSha256': file_hash(__file__),
            'boundary': 'Fixed unsupervised statistics of actual neural/controller observations. No PCA/dimension removal, geometry, time, laps, fitness, teacher actions or sensor reconstruction. Scale floor is a numerical design choice, not fly physiology. Does not prove improved driving; not an app model/save.'}
    summary = {'passed': True, 'actualRows': len(x), 'dimensions': 520,
               'rawStdMinimum': float(std.min()), 'rawStdMedian': float(np.median(std)), 'rawStdMaximum': float(std.max()),
               'rawStdBelow001': int((std<.01).sum()), 'rawStdBelow005': int((std<.05).sum()),
               'rawAbsMeanAbove2Std': int((np.abs(mean)>2*std).sum()),
               'normalizedStdMinimum': float(norm_std.min()), 'normalizedStdMedian': float(np.median(norm_std)),
               'normalizedAbsMeanAbove2Std': int((np.abs(normalized.mean(0))>2*norm_std).sum()),
               'normalizedAbsAbove099Fraction': float((np.abs(normalized)>.99).mean()),
               'boundary': 'Statistics on these recorded observations, not a causal diagnosis or a benefit in driving.'}
    atomic_json(out/'normalization.json', data)
    summary['normalizationSha256'] = file_hash(out/'normalization.json')
    atomic_json(out/'summary.json', summary)
    print(json.dumps(summary))

if __name__ == '__main__':
    run()
