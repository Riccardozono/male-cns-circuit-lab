"""Recurrent consolidation of actually executed own neural experience.

The actor receives current descending-neuron activity only. This fit is a
research warm start, never evidence of closed-loop driving or two safe laps.
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

ROOT = Path(__file__).resolve().parent.parent
RESEARCH = ROOT / '.impeccable/review/learning-ml'
sha = lambda value: hashlib.sha256(value).hexdigest()


def write(path, data):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--epochs', type=int, default=200)
    parser.add_argument('--hidden', type=int, default=64)
    parser.add_argument('--seed', type=int, default=850817)
    parser.add_argument('--update-schedule', choices=['episode', 'chunk'], default='episode')
    args = parser.parse_args()
    dataset, output = args.dataset.resolve(), args.output.resolve()
    if not dataset.is_relative_to(RESEARCH) or not output.is_relative_to(RESEARCH) or output.exists():
        raise ValueError('Use new owned research output and preserve existing evidence.')
    if not 1 <= args.epochs <= 1000 or not 1 <= args.hidden <= 256:
        raise ValueError('Bounded recurrent training required.')
    metadata_bytes = dataset.read_bytes()
    metadata = json.loads(metadata_bytes)
    source_result = metadata.get('sourceResult', {})
    experience_type = metadata.get('experienceType')
    safe_lap = experience_type == 'completed-lap' and source_result.get('laps', 0) >= 1
    safe_prefix = (experience_type == 'safe-terminal-prefix' and source_result.get('laps') == 0
                   and source_result.get('safeTerminalPrefix') is True)
    if (metadata.get('format') != 'male-cns-neural-self-experience-v2' or metadata.get('dtype') != '<f8'
            or metadata.get('inputSize') != 514 or metadata.get('outputSize') != 2
            or metadata.get('rows', 0) < 256 or not source_result.get('episodeComplete')
            or source_result.get('safe') is not True or not (safe_lap or safe_prefix)
            or metadata.get('behaviorFootprint') != 'on' or metadata.get('observerFootprint') != 'on'
            or metadata.get('sensorModeMatch') is not True
            or metadata.get('identity', {}).get('footprint') != 'on'):
        raise ValueError('A safe, completed, sensor-matched V2 experience dataset is required.')
    try:
        import numpy as np
        import torch
        from torch import nn
    except ImportError as error:
        raise RuntimeError('GRU training requires NumPy and PyTorch in the selected Python environment.') from error
    arrays = []
    for filename, width, key in [('observations.f64', 514, 'observationsSha256'), ('actions.f64', 2, 'actionsSha256')]:
        raw = (dataset.parent / filename).read_bytes()
        if sha(raw) != metadata[key] or len(raw) != metadata['rows'] * width * 8:
            raise ValueError('Dataset shape/checksum mismatch.')
        a = np.frombuffer(raw, dtype='<f8').reshape(metadata['rows'], width).copy()
        if not np.isfinite(a).all():
            raise ValueError('Finite actual neural data required.')
        arrays.append(a)
    if not torch.cuda.is_available() or 'RTX 4060' not in torch.cuda.get_device_name(0):
        raise RuntimeError('Actual RTX 4060 required, no silent CPU fallback.')
    torch.set_num_threads(2)
    torch.manual_seed(args.seed)
    torch.use_deterministic_algorithms(True)
    x = torch.as_tensor(arrays[0][:, 384:512].copy(), device='cuda', dtype=torch.float64)
    y = torch.as_tensor(arrays[1], device='cuda', dtype=torch.float64)
    mean, scale = x.mean(0), x.std(0, unbiased=False).clamp_min(.02)
    normalized = ((x - mean) / scale).clamp(-10, 10).unsqueeze(0)
    recurrent = nn.GRU(128, args.hidden, batch_first=True, device='cuda', dtype=torch.float64)
    head = nn.Linear(args.hidden, 2, device='cuda', dtype=torch.float64)
    with torch.no_grad():
        head.weight.mul_(.01)
        head.bias.copy_(torch.atanh(y.mean(0).clamp(-.99, .99)))
    parameters = list(recurrent.parameters()) + list(head.parameters())
    optimizer = torch.optim.AdamW(parameters, lr=.0003, weight_decay=.00001)
    action_scale = y.std(0, unbiased=False).clamp_min(.05)
    output.mkdir()
    checkpoints = sorted(set([min(25, args.epochs), min(75, args.epochs), args.epochs]))
    records, updates, started = [], 0, time.perf_counter()
    for epoch in range(1, args.epochs + 1):
        if args.update_schedule == 'episode':
            observed, _ = recurrent(normalized)
            prediction = torch.tanh(head(observed))[0]
            loss = (((prediction - y) / action_scale) ** 2).mean()
            if not torch.isfinite(loss):
                raise RuntimeError('Finite recurrent training loss required.')
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(parameters, 5)
            optimizer.step()
            updates += 1
        else:
            hidden = None
            for start in range(0, len(x), 128):
                observed, hidden = recurrent(normalized[:, start:start + 128], hidden)
                prediction = torch.tanh(head(observed))[0]
                target = y[start:start + len(prediction)]
                loss = (((prediction - target) / action_scale) ** 2).mean()
                if not torch.isfinite(loss):
                    raise RuntimeError('Finite recurrent training loss required.')
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                nn.utils.clip_grad_norm_(parameters, 5)
                optimizer.step()
                hidden = hidden.detach()
                updates += 1
        if epoch in checkpoints:
            with torch.no_grad():
                observed, _ = recurrent(normalized)
                prediction = torch.tanh(head(observed))[0]
                mse = ((prediction - y) ** 2).mean(0).cpu().tolist()
                early_mse = ((prediction[:500] - y[:500]) ** 2).mean(0).cpu().tolist()
            flat = lambda tensor: tensor.detach().cpu().reshape(-1).tolist()
            data = {'format': 'male-cns-neural-self-gru-v1', 'status': 'research-unverified',
                    'inputSize': 128, 'outputSize': 2, 'hiddenSize': args.hidden,
                    'observerSpec': metadata['observerSpec'], 'sourceSha256': metadata['sourceSha256'],
                    'mean': flat(mean), 'scale': flat(scale),
                    'weightIH': flat(recurrent.weight_ih_l0), 'weightHH': flat(recurrent.weight_hh_l0),
                    'biasIH': flat(recurrent.bias_ih_l0), 'biasHH': flat(recurrent.bias_hh_l0),
                    'weightOut': flat(head.weight), 'biasOut': flat(head.bias),
                    'training': {'epoch': epoch, 'updates': updates, 'seed': args.seed,
                                 'updateSchedule': args.update_schedule,
                                 'datasetSha256': sha(metadata_bytes), 'datasetExperienceType': experience_type,
                                 'teacherFootprint': metadata['behaviorFootprint'], 'studentFootprint': 'on',
                                 'sourceResult': source_result, 'fitOnly': True,
                                 'previousActionsUsed': False, 'independentDrivingValidation': False}}
            payload = json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
            filename = f'epoch-{epoch}.malecns-neural-gru.json'
            write(output / filename, {'format': 'male-cns-neural-self-gru-envelope-v1', 'payloadJson': payload, 'sha256': sha(payload.encode())})
            probes, state = [], None
            with torch.no_grad():
                for i in range(min(128, len(x))):
                    value, state = recurrent(normalized[:, i:i + 1], state)
                    signed = torch.tanh(head(value))[0, 0]
                    probes.append({'input': arrays[0][i].tolist(), 'expectedSignedOutputs': flat(signed),
                                   'expectedHidden': flat(state)})
            write(output / f'parity-{epoch}.json', {'model': filename, 'probes': probes})
            record = {'epoch': epoch, 'updates': updates, 'mse': mse, 'earlyMse': early_mse,
                      'file': filename, 'sha256': sha((output / filename).read_bytes()),
                      'wallSeconds': time.perf_counter() - started}
            records.append(record)
            print('NEURAL_GRU_CHECKPOINT ' + json.dumps(record), flush=True)
        elif epoch % 5 == 0:
            print('NEURAL_GRU_TRAINING ' + json.dumps({'epoch': epoch, 'updates': updates, 'wallSeconds': time.perf_counter() - started}), flush=True)
    if any(p.device.type != 'cuda' or not torch.isfinite(p).all() for p in parameters):
        raise RuntimeError('Finite actual CUDA parameters required.')
    report = {'format': 'male-cns-neural-self-gru-training-v1', 'rows': len(x),
              'torchVersion': torch.__version__, 'device': torch.cuda.get_device_name(0),
              'dtype': 'float64', 'updateSchedule': args.update_schedule,
              'datasetExperienceType': experience_type, 'sourceResult': source_result,
              'sensorModeMatch': metadata['sensorModeMatch'],
              'trainerSha256': sha(Path(__file__).read_bytes()),
              'datasetSha256': sha(metadata_bytes), 'records': records,
              'wallSeconds': time.perf_counter() - started, 'learningSucceeded': False,
              'limits': 'Supervised recurrent consolidation of one actual own experience prefix; no independent data validation or proof of autonomous driving. No route, time, coordinates or previous expert actions in the actor input.'}
    write(output / 'report.json', report)
    print('NEURAL_GRU_DONE ' + json.dumps({'output': str(output), 'updates': updates}), flush=True)


if __name__ == '__main__':
    main()
