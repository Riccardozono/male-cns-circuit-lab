"""Research warm start from this project's own executed successful experience.

No route, coordinates, time or desired controls enter the new readout. This is
supervised consolidation of past actions, not an implementation of SIL/PPO and
not evidence of successful driving without independent physical replays.
"""
import os
os.environ['OMP_NUM_THREADS'] = '2'
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['CUBLAS_WORKSPACE_CONFIG'] = ':16:8'

import argparse
import hashlib
import json
from pathlib import Path
import time
import numpy as np
import torch
from torch import nn

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = ROOT / '.impeccable/review/learning-ml'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    with Path(path).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, separators=(',', ':'), ensure_ascii=False, allow_nan=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--epochs', type=int, default=300)
    parser.add_argument('--seed', type=int, default=850817)
    args = parser.parse_args()
    dataset = args.dataset.resolve()
    output = args.output.resolve()
    if not dataset.is_relative_to(RESEARCH) or not output.is_relative_to(RESEARCH):
        raise ValueError('Use owned local research paths.')
    if output.exists() or args.epochs < 1 or args.epochs > 1000:
        raise ValueError('Preserve existing outputs and use bounded training.')
    metadata_bytes = dataset.read_bytes()
    metadata = json.loads(metadata_bytes)
    if (metadata['format'] != 'male-cns-neural-self-experience-v1'
            or metadata['dtype'] != '<f8' or metadata['inputSize'] != 514
            or metadata['outputSize'] != 2 or metadata['rows'] < 1000
            or metadata['sourceResult']['laps'] < 1):
        raise ValueError('A real completed-lap neural experience dataset is required.')
    arrays = []
    for filename, width, key in [('observations.f64', 514, 'observationsSha256'),
                                 ('actions.f64', 2, 'actionsSha256')]:
        raw = (dataset.parent / filename).read_bytes()
        if digest(raw) != metadata[key] or len(raw) != metadata['rows'] * width * 8:
            raise ValueError('Actual experience checksum/shape mismatch.')
        array = np.frombuffer(raw, dtype='<f8').reshape(metadata['rows'], width).copy()
        if not np.isfinite(array).all():
            raise ValueError('Nonfinite actual neural experience.')
        arrays.append(array)
    if not torch.cuda.is_available() or 'RTX 4060' not in torch.cuda.get_device_name(0):
        raise RuntimeError('Actual RTX 4060 training is required; no silent CPU fallback.')
    torch.set_num_threads(2)
    torch.manual_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    device = torch.device('cuda:0')
    x, y = [torch.as_tensor(a, dtype=torch.float64, device=device) for a in arrays]
    mean, scale = x.mean(0), x.std(0, unbiased=False).clamp_min(.02)
    normalized = ((x - mean) / scale).clamp(-10, 10)
    action_scale = y.std(0, unbiased=False).clamp_min(.05)
    model = nn.Sequential(nn.Linear(514, 128), nn.Tanh(), nn.Linear(128, 64), nn.Tanh(), nn.Linear(64, 2), nn.Tanh()).to(device=device, dtype=torch.float64)
    for layer in model:
        if isinstance(layer, nn.Linear):
            nn.init.xavier_uniform_(layer.weight)
            nn.init.zeros_(layer.bias)
    with torch.no_grad():
        model[-2].weight.mul_(.01)
        model[-2].bias.copy_(torch.atanh(y.mean(0).clamp(-.99, .99)))
    optimizer = torch.optim.AdamW(model.parameters(), lr=.001, weight_decay=.00001)
    output.mkdir()
    checkpoints = sorted(set([min(50, args.epochs), min(150, args.epochs), args.epochs]))
    records, exports = [], []
    started, steps = time.perf_counter(), 0
    for epoch in range(1, args.epochs + 1):
        order = torch.randperm(len(x), device=device)
        for start in range(0, len(x), 512):
            indices = order[start:start + 512]
            prediction = model(normalized[indices])
            loss = (((prediction - y[indices]) / action_scale) ** 2).mean()
            if not torch.isfinite(loss):
                raise RuntimeError('Nonfinite CUDA training loss.')
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 5)
            optimizer.step()
            steps += 1
        if epoch in checkpoints:
            with torch.no_grad():
                prediction = model(normalized)
                mse = ((prediction - y) ** 2).mean(0).cpu().tolist()
                maximum = (prediction - y).abs().amax(0).cpu().tolist()
            layers = [{'input': layer.in_features, 'output': layer.out_features,
                       'weights': layer.weight.detach().cpu().reshape(-1).tolist(),
                       'bias': layer.bias.detach().cpu().tolist()}
                      for layer in model if isinstance(layer, nn.Linear)]
            data = {'format': 'male-cns-neural-self-readout-v1', 'status': 'research-unverified',
                    'inputSize': 514, 'outputSize': 2, 'observerSpec': metadata['observerSpec'],
                    'sourceSha256': metadata['sourceSha256'], 'mean': mean.cpu().tolist(),
                    'scale': scale.cpu().tolist(), 'layers': layers,
                    'training': {'epoch': epoch, 'steps': steps, 'datasetSha256': digest(metadata_bytes),
                                 'observationsSha256': metadata['observationsSha256'],
                                 'actionsSha256': metadata['actionsSha256'], 'seed': args.seed,
                                 'fitOnly': True, 'independentDrivingValidation': False}}
            payload = json.dumps(data, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
            filename = f'epoch-{epoch}.malecns-neural-self.json'
            write_json(output / filename, {'format': 'male-cns-neural-self-readout-envelope-v1',
                                          'payloadJson': payload, 'sha256': digest(payload.encode())})
            probes = [0, 20, 100, 500, 1500, 3000, min(5000, len(x) - 1), len(x) - 1]
            write_json(output / f'parity-{epoch}.json', {'model': filename,
                'probes': [{'input': x[i].cpu().tolist(), 'expectedSignedOutputs': prediction[i].cpu().tolist()} for i in probes]})
            record = {'epoch': epoch, 'steps': steps, 'mse': mse, 'maximumError': maximum,
                      'wallSeconds': time.perf_counter() - started, 'file': filename}
            records.append(record)
            exports.append({'file': filename, 'sha256': digest((output / filename).read_bytes())})
            print('NEURAL_SELF_TRAINING ' + json.dumps(record), flush=True)
    if any(p.device.type != 'cuda' or not torch.isfinite(p).all() for p in model.parameters()):
        raise RuntimeError('The finite model must actually be trained on CUDA.')
    report = {'format': 'male-cns-neural-self-training-v1', 'torchVersion': torch.__version__,
              'device': torch.cuda.get_device_name(0), 'dtype': 'float64', 'rows': len(x),
              'datasetSha256': digest(metadata_bytes), 'records': records, 'exports': exports,
              'wallSeconds': time.perf_counter() - started, 'learningSucceeded': False,
              'limits': 'Fit on one own successful prefix. Training loss is not independent driving validation. No route inputs, external expert actions or app/save changes.'}
    write_json(output / 'report.json', report)
    print('NEURAL_SELF_TRAINING_DONE ' + json.dumps({'output': str(output), 'steps': steps, 'records': records}), flush=True)


if __name__ == '__main__':
    main()
