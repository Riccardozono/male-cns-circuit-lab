"""Symmetric coordinate credit probes, never a prescribed driving action."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import time
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash

def core(r):
    return {k: r[k] for k in ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds']}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', default='growth-3519-stage-2')
    p.add_argument('--tag', default='growth-3519-coordinates')
    args = p.parse_args()
    if not all(s.replace('-', '').isalnum() for s in [args.source, args.tag]):
        raise ValueError('Private experiment names required')
    base = ROOT / '.impeccable/review/neural-sacl'
    source_file = base / args.source / 'report.json'
    prior = json.loads(source_file.read_text(encoding='utf-8'))
    if not prior['passed']:
        raise RuntimeError('Completed verified source required')
    for file in ['work/neural-grown-local-env.cjs', 'work/neuronal_experiment_io.py']:
        if file_hash(ROOT / file) != prior['identity']['sourceHashes'][file]:
            raise RuntimeError('Source environment changed')
    out = base / args.tag
    out.mkdir(parents=True, exist_ok=False)
    pipes, records, validations = [], [], []
    started = time.monotonic()
    config = {'parentModelFile': prior['parentModelFile'], 'basisFile': prior['basisFile']}
    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(Pipe, ROOT / 'work/neural-grown-local-env.cjs', {'configuration': config}) for _ in range(4)]
            slots, errors = [None] * 4, []
            indexes = {f: i for i, f in enumerate(futures)}
            for future in as_completed(futures):
                try:
                    slots[indexes[future]] = future.result()
                except Exception as error:
                    errors.append(error)
            pipes = [pipe for pipe in slots if pipe is not None]
        if errors:
            raise errors[0]
        metadata = pipes[0].metadata
        if any(pipe.metadata != metadata for pipe in pipes) or metadata != prior['identity']['environment']:
            raise RuntimeError('Independent numerical environment differs')
        dims = metadata['learnableParameters']
        zero = [0.] * dims
        baseline = pipes[0].request('evaluate', weights=zero, mode='practice')
        if baseline['censored'] or core(baseline['result']) != core(prior['baselineFull']['result']):
            raise RuntimeError('Actual zero-coefficient baseline changed')
        best = {'weights': zero, 'episode': baseline, 'kind': 'protected-actual-parent'}
        identity = {'sourceReportSha256': file_hash(source_file), 'configuration': vars(args), 'environment': metadata, 'nodeExecutableSha256': file_hash(NODE),
                    'sourceHashes': {f: file_hash(ROOT / f) for f in ['work/probe_grown_coordinates.py', 'work/neural-grown-local-env.cjs', 'work/neuronal_experiment_io.py']}}
        atomic_json(out / 'identity.json', identity)
        print('COORDINATES_READY ' + json.dumps({'dimensions': dims, 'baseline': baseline['result']}), flush=True)
        for name, coordinates in [('longitudinal', range(1, dims, 2)), ('steering', range(0, dims, 2))]:
            candidates = []
            for index in coordinates:
                for delta in [-6., -3., -1., -.25, .25, 1., 3., 6.]:
                    w = zero.copy()
                    w[index] = delta
                    candidates.append({'weights': w, 'coordinate': index, 'delta': delta, 'group': name})
            for offset in range(0, len(candidates), 4):
                batch = candidates[offset:offset + 4]
                ids = [pipe.send('evaluate', weights=r['weights'], mode='practice') for pipe, r in zip(pipes, batch)]
                for pipe, candidate, rid in zip(pipes, batch, ids):
                    episode = pipe.receive(rid)
                    if episode['gasBrakeOverlapSteps']:
                        raise RuntimeError('Motor pedals overlap')
                    row = {**candidate, 'episode': episode}
                    records.append(row)
                    r, b = episode['result'], best['episode']['result']
                    if not episode['censored'] and r['reason'] not in ['urto', 'fuori pista', 'progresso non valido'] and r['fitness'] > b['fitness'] and r['bestProgress'] >= b['bestProgress'] and r['laps'] >= b['laps']:
                        best = row
                atomic_json(out / 'progress.json', {'identity': identity, 'best': best, 'records': records, 'wallSeconds': time.monotonic() - started})
            if best['weights'] != zero and (not validations or best['weights'] != validations[-1]['weights']):
                ids = [pipe.send('evaluate', weights=best['weights'], mode='full') for pipe in pipes[:2]]
                full, repeat = [pipe.receive(rid) for pipe, rid in zip(pipes[:2], ids)]
                if full['censored'] or repeat['censored'] or core(full['result']) != core(repeat['result']) or core(full['result']) != core(best['episode']['result']):
                    raise RuntimeError('Coordinate promotion fails independent full replay')
                validations.append({'weights': best['weights'], 'full': full, 'independentRepeat': repeat})
                atomic_json(out / 'verified-champion.json', validations[-1])
            print('COORDINATES_GROUP ' + json.dumps({'group': name, 'evaluations': len(records), 'best': best['episode']['result'], 'wallSeconds': time.monotonic() - started}), flush=True)
        ids = [pipe.send('evaluate', weights=best['weights'], mode='full') for pipe in pipes[:2]]
        full, repeat = [pipe.receive(rid) for pipe, rid in zip(pipes[:2], ids)]
        if full['censored'] or repeat['censored'] or core(full['result']) != core(repeat['result']):
            raise RuntimeError('Final full replay differs')
        report = {'passed': True, 'identity': identity, 'parentModelFile': prior['parentModelFile'], 'basisFile': prior['basisFile'], 'baselineFull': prior['baselineFull'],
                  'best': best, 'records': records, 'validations': validations, 'fullChampion': full, 'independentChampionRepeat': repeat,
                  'boundary': 'Symmetric parameter-coordinate search with actual own rewards. No expert action, forced brake release, route/pose/time input or objective change. Every accepted improvement fully replays from the line. Negative cases retained.'}
        atomic_json(out / 'report.json', report)
        print('COORDINATES_DONE ' + json.dumps({'passed': True, 'evaluations': len(records), 'result': full['result']}), flush=True)
    finally:
        for pipe in pipes:
            pipe.close()

if __name__ == '__main__':
    main()
