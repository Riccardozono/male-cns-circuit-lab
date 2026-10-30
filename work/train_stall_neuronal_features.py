"""Bounded own-reward experiment; local learned features, never teacher actions."""
import argparse
import json
import time
import numpy as np
import neural_sac as NS

def record(weights, episode):
    s = episode['result']
    return {'weights': weights, 'fitness': s['fitness'], 'progress': s['bestProgress'], 'laps': s['laps'],
            'reason': s['reason'], 'censored': episode['censored'], 'overlap': episode['gasBrakeOverlapSteps']}

def same(a, b):
    return all(a['result'][k] == b['result'][k] for k in ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds'])

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--tag', default='stall-neuronal-features-first')
    p.add_argument('--iterations', type=int, default=8)
    p.add_argument('--population', type=int, default=16)
    args = p.parse_args()
    if not args.tag.replace('-', '').isalnum() or not 1 <= args.iterations <= 20 or not 4 <= args.population <= 100:
        raise ValueError('Bounded experiment required')
    out = NS.ROOT / '.impeccable/review/neural-sacl' / args.tag
    out.mkdir(parents=True, exist_ok=False)
    source = NS.ROOT / '.impeccable/review/neural-sacl/neural-diversity-resume-40/report.json'
    prior = json.loads(source.read_text(encoding='utf-8'))
    NS.BRIDGE = NS.ROOT / 'work/neural-stall-local-env.cjs'
    pipes, optimizer, records, validations, history = [], None, [], [], []
    started = time.monotonic()
    random = np.random.default_rng(151216)
    try:
        for _ in range(4):
            pipes.append(NS.NodePipe())
        metadata = pipes[0].metadata
        if any(pipe.metadata != metadata for pipe in pipes):
            raise RuntimeError('Independent environments differ')
        dims = metadata['learnableParameters']
        zero = [0.] * dims
        baseline = pipes[0].request('evaluate', weights=zero, mode='full')
        practice = pipes[0].request('evaluate', weights=zero, mode='practice')
        if not prior['passed'] or not same(baseline, prior['fullChampion']) or not same(baseline, practice):
            raise RuntimeError('Zero new weights must exactly reproduce the actual champion; practice is not a separate full generation')
        seeds = [record(zero, baseline)]
        NS.BRIDGE = NS.ROOT / 'work/neural-stall-diversity-transport.cjs'
        original = NS.NodePipe.request
        def initialize(self, op, **fields):
            if op == 'init':
                fields.update(configuration={'dimensions': dims, 'binMetres': 25, 'maxProgress': prior['state']['maxProgress'], 'population': args.population}, seeds=seeds, seed=151216)
            return original(self, op, **fields)
        NS.NodePipe.request = initialize
        try:
            optimizer = NS.NodePipe()
        finally:
            NS.NodePipe.request = original
        state = optimizer.request('state')
        previous = state['archive']['champion']
        identity = {'configuration': vars(args), 'environment': metadata, 'sourceReportSha256': NS.file_hash(source),
                    'sourceHashes': {f: NS.file_hash(NS.ROOT / f) for f in ['work/train_stall_neuronal_features.py', 'work/neural-stall-local-env.cjs', 'work/neural-stall-diversity-transport.cjs', 'work/neural-diversity.cjs', 'work/neural-context-readout.cjs']}}
        NS.atomic_json(out / 'identity.json', identity)
        print('LOCAL_READY ' + json.dumps({'dimensions': dims, 'protectedActualControls': metadata['protectedControls'], 'baseline': baseline['result'], 'zeroFullMatchesPractice': True}), flush=True)
        for iteration in range(1, args.iterations + 1):
            candidates = optimizer.request('ask')
            for candidate in candidates[1:]:
                if iteration == 1 or random.random() < .65:
                    sigma = float(random.choice([.08, .2, .5, 1.1, 2.]))
                    candidate['weights'] = np.clip(np.array(candidate['weights']) + random.normal(0, sigma, dims), -8, 8).tolist()
                    candidate['additionalSigma'] = sigma
            current = []
            for offset in range(0, len(candidates), 4):
                batch = candidates[offset:offset + 4]
                ids = [pipe.send('evaluate', weights=row['weights'], mode='practice') for pipe, row in zip(pipes, batch)]
                for pipe, candidate, rid in zip(pipes, batch, ids):
                    episode = pipe.receive(rid)
                    if episode['gasBrakeOverlapSteps']:
                        raise RuntimeError('Overlapping motor pedals')
                    records.append({**candidate, 'iteration': iteration, 'episode': episode})
                    current.append(record(candidate['weights'], episode))
            optimizer.request('offer', candidates=current)
            state = optimizer.request('state')
            archive = state['archive']
            if archive['champion']['weights'] != previous['weights']:
                weights = archive['champion']['weights']
                full = pipes[0].request('evaluate', weights=weights, mode='full')
                repeat = pipes[1].request('evaluate', weights=weights, mode='full')
                if not same(full, repeat) or full['result']['fitness'] != archive['champion']['fitness'] or full['result']['bestProgress'] != archive['champion']['progress']:
                    raise RuntimeError('Promotion failed independent complete from-line validation')
                validations.append({'iteration': iteration, 'weights': weights, 'full': full, 'independentRepeat': repeat})
                previous = archive['champion']
                NS.atomic_json(out / 'verified-champion.json', validations[-1])
            furthest = max(archive['cells'], key=lambda row: (row['laps'], row['progress']))
            row = {'iteration': iteration, 'champion': archive['champion'], 'furthest': furthest, 'evaluations': len(records), 'cells': len(archive['cells']), 'wallSeconds': time.monotonic() - started}
            history.append(row)
            NS.atomic_json(out / 'progress.json', {'identity': identity, 'state': state, 'numpyRandomState': random.bit_generator.state, 'history': history, 'records': records, 'validations': validations})
            print('LOCAL_PROGRESS ' + json.dumps({'iteration': iteration, 'safeProgress': archive['champion']['progress'], 'safeLaps': archive['champion']['laps'], 'furthest': furthest['progress'], 'reason': furthest['reason'], 'evaluations': len(records), 'wallSeconds': row['wallSeconds']}), flush=True)
            if archive['champion']['laps'] == 2:
                break
        full = pipes[0].request('evaluate', weights=archive['champion']['weights'], mode='full')
        repeat = pipes[1].request('evaluate', weights=archive['champion']['weights'], mode='full')
        if not same(full, repeat):
            raise RuntimeError('Final full physical repeat differs')
        report = {'passed': True, 'identity': identity, 'baselineFull': baseline, 'baselinePractice': practice, 'state': state,
                  'numpyRandomState': random.bit_generator.state, 'history': history, 'records': records, 'validations': validations, 'fullChampion': full, 'independentChampionRepeat': repeat,
                  'boundary': 'Warm-start V3/Monza, real self-generated rewards and unchanged graph/physics/objective. Six artificial compact neuronal features, not biological neurons. Archive descriptors evaluate behavior, never drive the car. Practice prefixes are actually reached cached states, not full generations; promotions are independently validated from the line. No app/save/release changes.'}
        NS.atomic_json(out / 'report.json', report)
        print('LOCAL_DONE ' + json.dumps({'passed': True, 'evaluations': len(records), 'result': full['result']}), flush=True)
    finally:
        for pipe in pipes:
            pipe.close()
        if optimizer:
            optimizer.close()

if __name__ == '__main__':
    main()
