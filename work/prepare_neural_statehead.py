"""Unsupervised axes of ACTUAL late neural experience, with no action targets."""
import argparse
import hashlib
import json
import os
from pathlib import Path

os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('MKL_NUM_THREADS', '1')
import numpy as np

ROOT = Path(__file__).resolve().parent.parent

def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()

def prepare(prepared_file, output):
    p = json.loads(prepared_file.read_text(encoding='utf-8'))
    source_file = Path(p['sourceNativeReportFile'])
    source = json.loads(source_file.read_text(encoding='utf-8'))
    if p['format'] != 'male-cns-actual-neuronal-chain-context-v1' or digest(source_file) != p['sourceNativeReportSha256'] or not source['passed']:
        raise ValueError('Verified actual context/source required')
    trajectory = Path(source['proofs'][0]['trajectoryFile'])
    parent_file = Path(source['modelFile'])
    if digest(trajectory) != source['trajectorySha256'] or digest(parent_file) != source['modelSha256'] or digest(p['modelFile']) != p['modelSha256']:
        raise ValueError('Actual neural data and parent checksums required')
    prepared_model = json.loads(json.loads(Path(p['modelFile']).read_text(encoding='utf-8'))['payloadJson'])
    rows = np.memmap(trajectory, dtype='<f8', mode='r').reshape(-1, 530)
    if len(rows) != p['sourceControls'] or not 48 <= p['sourceControls'] - p['protectedCount'] <= 256:
        raise ValueError('Recorded complete trajectory/window shape differs')
    # ONLY neuronal/controller columns enter these axes. Actual commands and
    # physical progress/time/reward columns are deliberately excluded.
    neural = np.asarray(rows[p['protectedCount']:, :516], dtype=np.float64)
    if not np.isfinite(neural).all() or np.max(np.abs(neural)) > 1:
        raise ValueError('Actual bounded neural samples required')
    basis = prepared_model['stages'][-1]['basis']
    mean = neural.mean(axis=0)
    scales = np.asarray(basis['scales'], dtype=np.float64)
    normalized = (neural - mean) / scales
    _, singular, vt = np.linalg.svd(normalized, full_matrices=False)
    axes = vt[:8]
    std = np.maximum(.05, np.std(normalized @ axes.T, axis=0))
    data = {
        'format': 'male-cns-actual-neuronal-state-head-preparation-v1', 'schema': 1,
        'appVersion': '5.6.0', 'numericRuntime': '24.19.0',
        'basis': basis, 'projection': {'mean': mean.tolist(), 'scales': scales.tolist(),
                                    'components': axes.tolist(), 'componentStd': std.tolist()},
        'weights': [0.0] * 18, 'parentFile': str(parent_file), 'parentSha256': digest(parent_file),
        'preparedFile': str(prepared_file), 'preparedSha256': digest(prepared_file),
        'sourceTrajectoryFile': str(trajectory), 'sourceTrajectorySha256': digest(trajectory),
        'sourceNativeReportFile': str(source_file), 'sourceNativeReportSha256': digest(source_file),
        'sourceControls': len(rows), 'projectionSampleCount': len(neural),
        'sourceColumnRange': [0, 516], 'physicalOrActionTargetColumnsUsed': 0,
        'firstActivatedControl': p['firstActivatedControl'],
        'sourceFullResult': p['sourceFullResult'], 'sourceFullTraceSha256': p['sourceFullTraceSha256'],
        'sourceCachedPracticeTraceSha256': p['sourceCachedPracticeTraceSha256'],
        'singularValues': singular[:8].tolist(),
        'sourceHashes': {str(Path(__file__).relative_to(ROOT)).replace('\\', '/'): digest(__file__),
                         'work/neural-statehead.cjs': digest(ROOT / 'work/neural-statehead.cjs')},
        'boundary': 'Eight unsupervised axes fitted only to256actual late neuronal/controller states. No command, reward, route, time, progress, target or ideal action columns enter the projection. This preparation has no trained gain or lap claim; exact zero full/suffix and independent native validations remain necessary.'}
    output.mkdir(parents=False, exist_ok=False)
    target = output / 'prepared.json'
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return {'passed': True, 'file': str(target), 'actualSamples': len(neural), 'axes': len(axes),
            'plasticCoefficients': 18, 'firstActivatedControl': p['firstActivatedControl']}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('prepared', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.prepared.resolve(), args.output.resolve())))
