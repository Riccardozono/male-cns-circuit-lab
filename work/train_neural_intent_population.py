"""Private rank-based learning with 520 actual neural state/intention signals."""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['OMP_NUM_THREADS'] = '2'
import argparse
import copy
import hashlib
import json
import subprocess
import time
from pathlib import Path
import numpy as np
import torch
from neural_intent_actor import NeuralIntentActor, fit_basis, fit_consolidation
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash


def run(tag, generations=8):
    if not tag.replace('-', '').isalnum() or not 1 <= generations <= 32:
        raise ValueError('Scoped private population search required')
    torch.set_num_threads(2)
    torch.set_float32_matmul_precision('highest')
    torch.manual_seed(103261026)
    out = ROOT / '.impeccable/review/learning-ml' / tag
    out.mkdir(exist_ok=False)
    proof_dir = out.parent / 'neural-current-intent-proof-20261025-01'
    proof = json.loads((proof_dir / 'report.json').read_text(encoding='utf-8'))
    bankfile = proof_dir / 'successful-neural-reference-520.private.npy'
    if not proof['passed'] or file_hash(bankfile) != proof['referenceSha256']:
        raise RuntimeError('Verified fresh 520-signal reference bank required')
    bank = np.load(bankfile, allow_pickle=False)
    if bank.shape != tuple(proof['referenceShape']) or bank.shape[1] != 520 or not np.isfinite(bank).all():
        raise RuntimeError('Reference data must be the exact finite 520-signal bank')
    configuration = fit_consolidation(bank)
    metadata_path = None
    env = None
    events = []
    allcontrols = 0
    allcases = 0
    started = time.monotonic()
    rng = np.random.default_rng(103261026)
    mean = np.zeros((2, 514), np.float32)
    diagonal = np.ones((2, 514), np.float32)
    training_best = mean.copy()
    training_best_score = -float('inf')
    best_genes = mean.copy()
    best_state = None
    t = lambda values: torch.tensor(values, dtype=torch.float32, device='cuda:0')

    def progress(phase, **extra):
        value = {'phase': phase, 'environmentPid': env.process.pid if env else None,
                 'wallSeconds': time.monotonic() - started, 'generationsCompleted': len(events), **extra}
        atomic_json(out / 'progress.json', value)
        print('NEURAL_INTENT_POPULATION ' + json.dumps(value), flush=True)

    def setgenes(genes):
        with torch.no_grad():
            actor.layers[-1].steering.copy_(t(genes[0, :512]))
            actor.layers[-1].pedal.copy_(t(genes[1, :512]))
            actor.motorBias.copy_(t(genes[:, 512]))
            actor.motorGain.copy_(t(genes[:, 513]))

    try:
        env = Pipe(ROOT / 'work/neural-intent-world.cjs',
                   initialization={'configuration': {'horizonControls': 200}})
        meta = env.metadata
        metadata_path = out / 'metadata.private.json'
        atomic_json(metadata_path, meta)
        if meta['observationLength'] != 520 or meta['parentSha256'] != proof['parentSha256']:
            raise RuntimeError('Current 520-signal parent identity mismatch')
        if meta['baseline'] != proof['fullZeroResidualResult']:
            raise RuntimeError('Zero-residual baseline differs from the current intent proof')
        if meta['firstLapBodySequenceSha256'] != proof['firstLapBodySequenceSha256']:
            raise RuntimeError('First-lap body/neural sequence differs from the verified parent')
        basis = fit_basis(np.asarray(meta['neuralBasisSamples'], dtype=np.float32), centers=96)
        atomic_json(out / 'basis.private.json', basis)
        atomic_json(out / 'consolidation.private.json', configuration)
        actor = NeuralIntentActor(basis, bank, configuration, capacity=512).to('cuda:0')

        source_files = [
            'work/train_neural_intent_population.py', 'work/neural_intent_actor.py',
            'work/neural-intent-world.cjs', 'work/neural-intent-live.cjs',
            'work/neural-statehead-cuda-model.cjs', 'work/neural-statehead.cjs',
            'work/neural-frontier-chain.cjs', 'work/neural-command-residual.cjs',
            'work/neural-research-source-identity.cjs', 'work/neuronal_experiment_io.py',
            'package.json', 'outputs/progress-save.js',
            str((proof_dir / 'report.json').relative_to(ROOT)),
            str(bankfile.relative_to(ROOT)),
            str((proof_dir / 'reference-info.private.json').relative_to(ROOT)),
            str((proof_dir / 'metadata.private.json').relative_to(ROOT)),
        ]
        js = "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(" + json.dumps(source_files) + ")))"
        hashes = json.loads(subprocess.check_output([str(NODE), '-e', js], cwd=ROOT, text=True,
                                                    creationflags=subprocess.CREATE_NO_WINDOW))
        settings = {
            'population': 16, 'generations': generations,
            'fieldSteeringStdLevels': [.003, .01, .03, .1, .3, .6],
            'pedalStdMultiplier': 1.5, 'elite': 4, 'coefficientBound': 8.,
            'actorCoefficients': 4, 'capacity': 512, 'initialActualCenters': 96,
            'growthPerGeneration': 8, 'additionalStallTrainingCost': 18.,
            'observationSignals': 520, 'referenceRows': int(len(bank)),
            'sourceReferenceSha256': proof['referenceSha256'],
            'selection': 'native future reward minus separately reported stalled-failure cost; safe champion requires complete from-line replay',
            'fullEvaluationLimit': None,
        }
        parent_result = meta['baseline']
        baseline = {'progress': parent_result['bestProgress'], 'laps': parent_result['laps'],
                    'reason': parent_result['reason'], 'safe': True, 'fullFromLine': True}
        best = baseline.copy()
        best_source = 'zero-residual-parent'
        best_state = copy.deepcopy(actor.state_dict())
        calibration = t(meta['neuralBasisSamples'])
        with torch.no_grad():
            active = np.concatenate([actor.layers[0].enabled.cpu().numpy() > 0, [True, True]])
            novel = actor.consolidation(calibration) > 0
            if not novel.any():
                raise RuntimeError('The actual trajectory includes no states outside the successful-lap bank')
            feature_norm = float(actor.layers[0](calibration[novel]).square().sum(-1).mean().sqrt())
            bank_gate = actor.consolidation(t(bank[::32]))
            zero_outputs = actor.deterministic(t(bank[::32]))
        if not np.isfinite(feature_norm) or feature_norm <= 0 or float(bank_gate.max()) > 1e-7 or float(zero_outputs.abs().max()) > 1e-7:
            raise RuntimeError('Fresh retained experience must start with a zero residual')

        def drive(genes, mode='observed-lap-boundary', label='candidate'):
            nonlocal allcontrols, allcases
            setgenes(genes)
            obs = env.request('reset', configuration={'mode': mode})['observation']
            controls = 0
            native_reward = 0.
            seen = []
            prefix = hashlib.sha256()
            prefix_exact = None
            while True:
                if controls % 8 == 0:
                    seen.append(obs)
                with torch.no_grad():
                    action = actor.deterministic(t([obs]))[0].cpu().tolist()
                state = env.request('step', action=action)
                controls += 1
                native_reward += state['reward']
                obs = state['observation']
                if mode == 'from-line' and controls <= meta['firstLapControls']:
                    prefix.update((state['info']['bodyFrameSha256'] + '\n').encode())
                if mode == 'from-line' and controls == meta['firstLapControls']:
                    prefix_exact = prefix.hexdigest() == meta['firstLapBodySequenceSha256']
                    if not prefix_exact:
                        raise RuntimeError('Candidate changed the retained first-lap neuronal trajectory')
                if controls % 512 == 0:
                    progress('native-driving', label=label, mode=mode, controls=controls,
                             progress=state['info']['progress'], laps=state['info']['laps'])
                if state['truncated']:
                    raise RuntimeError('Full physical candidate was unexpectedly truncated')
                if state['terminated']:
                    break
            info = state['info']
            extra = 18. if info['reason'] in ['ferma / senza progresso', 'troppo lenta / senza progresso'] else 0.
            allcontrols += controls
            allcases += 1
            return {**info, 'controls': controls, 'nativeFutureReward': native_reward,
                    'additionalStallTrainingCost': extra, 'trainingScore': native_reward - extra,
                    'fullFromLine': mode == 'from-line', 'firstLapBodyAndNeuronsExact': prefix_exact}, seen

        progress('baseline-verified', baseline=baseline, settings=settings, featureNorm=feature_norm)
        silence = env.request('check-brain-silence')
        if not silence['allZero']:
            raise RuntimeError('A silent neuronal graph must command no car actuation')
        atomic_json(out / 'brain-silence-check.json', silence)

        for index in range(generations):
            with torch.no_grad():
                active = np.concatenate([actor.layers[0].enabled.cpu().numpy() > 0, [True, True]])
            candidates = [('center', mean.copy()), ('training-best', training_best.copy()),
                          ('safe-best', best_genes.copy())]
            for pair, level in enumerate(settings['fieldSteeringStdLevels']):
                epsilon = rng.standard_normal((2, 514)).astype(np.float32)
                scale = np.asarray([level, settings['pedalStdMultiplier'] * level], np.float32)[:, None] / feature_norm
                step = epsilon * scale * np.sqrt(diagonal)
                step[:, 512] = epsilon[:, 512] * np.asarray([level, settings['pedalStdMultiplier'] * level])
                step[:, 513] = epsilon[:, 513] * 4 * level
                step[:, ~active] = 0
                candidates.extend([(f'pair{pair}-plus', np.clip(mean + step, -8, 8)),
                                   (f'pair{pair}-minus', np.clip(mean - step, -8, 8))])
            epsilon = rng.standard_normal((2, 514)).astype(np.float32)
            step = epsilon * np.asarray([.03, .045], np.float32)[:, None] / feature_norm * np.sqrt(diagonal)
            step[:, 512] = epsilon[:, 512] * np.asarray([.03, .045])
            step[:, 513] = epsilon[:, 513] * .12
            step[:, ~active] = 0
            candidates.append(('extra', np.clip(mean + step, -8, 8)))
            if len(candidates) != 16:
                raise AssertionError('Population size changed')

            cache = {}
            rows = []
            visited = []
            controls_before, cases_before = allcontrols, allcases
            genomes = {}
            for number, (label, genes) in enumerate(candidates):
                genes = np.asarray(genes, dtype=np.float32)
                genes[:, ~active] = 0
                key = hashlib.sha256(genes.tobytes()).hexdigest()
                genomes[f'candidate{number}'] = genes
                reused = key in cache
                if reused:
                    result = cache[key]
                else:
                    result, seen = drive(genes, label=f'g{index + 1}:{label}')
                    cache[key] = result
                    visited.extend(seen)
                row = {'slot': number, 'label': label, 'genesSha256': key,
                       'reusedIdenticalPolicy': reused, 'result': result}
                rows.append(row)
                if result['trainingScore'] > training_best_score:
                    training_best_score = result['trainingScore']
                    training_best = genes.copy()
                if result['safe'] and (result['laps'], result['progress']) > (best['laps'], best['progress']):
                    progress('full-candidate-confirmation', generation=index + 1, slot=number, suffix=result)
                    full, _ = drive(genes, 'from-line', f'g{index + 1}:{label}:full-from-line')
                    for field in ['progress', 'laps', 'reason', 'bodyFrameSha256']:
                        if full[field] != result[field]:
                            raise RuntimeError(f'Candidate full replay differs on {field}')
                    best, best_genes = full, genes.copy()
                    best_state = copy.deepcopy(actor.state_dict())
                    best_source = f'generation{index + 1}:slot{number}'
                    row['fullConfirmation'] = full
                progress('candidate-finished', generation=index + 1, slot=number,
                         result=result, best=best)
                if best['laps'] >= 2:
                    break

            elite_indices = sorted(range(len(rows)), key=lambda j: rows[j]['result']['trainingScore'], reverse=True)[:4]
            elite = np.stack([genomes[f'candidate{j}'] for j in elite_indices])
            weights = np.log(len(elite_indices) + .5) - np.log(np.arange(1, len(elite_indices) + 1))
            weights /= weights.sum()
            elite_mean = np.sum(elite * weights[:, None, None], axis=0)
            old = mean.copy()
            mean = np.clip(.7 * mean + .3 * elite_mean, -8, 8).astype(np.float32)
            spread = np.sum((elite - old[None, :, :]) ** 2 * weights[:, None, None], axis=0)
            relative = spread / (np.mean(spread[:, active], axis=1)[:, None] + 1e-8)
            diagonal = np.clip(.9 * diagonal + .1 * relative, .2, 5).astype(np.float32)
            setgenes(mean)
            growth = actor.grow(t(visited), 8) if visited else None
            np.savez_compressed(out / f'population-{index + 1:03}.private.npz', **genomes)
            event = {'generation': index + 1, 'population': len(rows),
                     'uniqueNativeEvaluationsIncludingConfirmations': allcases - cases_before,
                     'actualPhysicalControlsIncludingConfirmations': allcontrols - controls_before,
                     'featureNorm': feature_norm, 'candidates': rows, 'eliteSlots': elite_indices,
                     'growth': growth, 'trainingBestScore': training_best_score,
                     'best': best, 'bestSource': best_source}
            events.append(event)
            atomic_json(out / f'generation-{index + 1:03}.json', event)
            tensor_file = out / 'checkpoint.private.pt'
            pending = out / 'checkpoint.pending.pt'
            torch.save({'actor': actor.state_dict(), 'bestActor': best_state,
                        'mean': torch.from_numpy(mean), 'diagonal': torch.from_numpy(diagonal),
                        'trainingBestGenes': torch.from_numpy(training_best),
                        'bestGenes': torch.from_numpy(best_genes)}, pending)
            os.replace(pending, tensor_file)
            atomic_json(out / 'checkpoint.private.json', {
                'format': 'private-neural-intent-population-checkpoint-v1',
                'nextGeneration': index + 1, 'tensorFile': tensor_file.name,
                'tensorSha256': file_hash(tensor_file), 'settings': settings,
                'sourceHashes': hashes, 'trainingBestScore': training_best_score,
                'best': best, 'bestSource': best_source,
                'numpyRng': rng.bit_generator.state,
                'boundary': 'Private 520-signal experimental learner; incompatible with ordinary app saves; no production integration.'})
            progress('generation-finished', generation=index + 1, best=best,
                     trainingBestScore=training_best_score, growth=growth)
            if best['laps'] >= 2:
                break

        final_center, _ = drive(mean, label='final-center')
        atomic_json(out / 'final-center.json', final_center)
        for name, source in [('train_neural_intent_population.py', 'work/train_neural_intent_population.py'),
                             ('neural_intent_actor.py', 'work/neural_intent_actor.py'),
                             ('neural-intent-world.cjs', 'work/neural-intent-world.cjs'),
                             ('neural-intent-live.cjs', 'work/neural-intent-live.cjs')]:
            (out / name).write_bytes((ROOT / source).read_bytes())
        if any(file_hash(ROOT / name) != digest for name, digest in hashes.items()):
            raise RuntimeError('Training source changed during the run')
        report = {
            'format': 'private-neural-intent-population-search-v1', 'passed': True,
            'learningSucceeded': best['laps'] >= 2, 'approvedForApp': False,
            'generationsCompleted': len(events), 'logicalPopulationSlots': sum(e['population'] for e in events),
            'uniqueNativeEpisodesIncludingConfirmationsAndFinal': allcases,
            'actualPhysicalControlsIncludingConfirmationsAndFinal': allcontrols,
            'observationDimension': 520, 'referenceRows': int(len(bank)),
            'brainSilence': silence, 'baseline': baseline, 'best': best,
            'bestSource': best_source, 'finalCenter': final_center, 'events': events,
            'settings': settings, 'sourceHashes': hashes,
            'parentSha256': meta['parentSha256'], 'referenceSha256': proof['referenceSha256'],
            'cuda': env.request('stats'), 'wallSeconds': time.monotonic() - started,
            'boundary': 'Rank-based mutations of a four-output residual on a 520-value observation: 128 current descending-neuron values across four samples, decoder memory, baseline motor channels, own previous executed motors, and current composite neural motor intention. No route, position, heading, lap or clock input; no target-action labels. Native complete second-lap episodes select candidates; safe best is confirmed by a full from-line replay with exact retained first-lap trace. Private research only; app 5.6.0, ordinary saves and releases unchanged.'}
        atomic_json(out / 'report.json', report)
        progress('finished', learningSucceeded=report['learningSucceeded'], best=best,
                 finalCenter=final_center, cuda=report['cuda'])
    except BaseException as error:
        atomic_json(out / 'failure.json', {'error': repr(error), 'generationsCompleted': len(events)})
        raise
    finally:
        if env:
            env.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    parser.add_argument('--generations', type=int, default=8)
    args = parser.parse_args()
    run(args.tag, args.generations)
