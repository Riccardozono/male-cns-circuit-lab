"""Four-update PPO study from zero weights using a captured real parent prefix.

This is research-only. It requires an exact zero-weight replay of the protected
parent, uses no global gate floor, and advances weights only after repeated safe
full-from-line improvement. It never writes app models or user saves.
"""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['OMP_NUM_THREADS'] = '2'

import argparse
import copy
import json
import subprocess
import time
from pathlib import Path

import numpy as np
import torch

from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from statehead_reward_actor import StateheadActor, advantages
from train_statehead_reward_gatefloor import optimize


PREPARED = ROOT / '.impeccable/review/learning-ml/statehead-strict-local-basis-20261026-35'
PREFLIGHT = ROOT / '.impeccable/review/learning-ml/statehead-strict-local-basis-zero-preflight-20261026-36/report.json'
SAVE = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
SAVE_SHA256 = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
BASE = ROOT / '.impeccable/review/learning-ml'


def safe(result):
    return result['complete'] and result['reason'] not in ['urto', 'fuori pista', 'progresso non valido']


def rank(result):
    return result['laps'], result['bestProgress'], result['fitness']


def run(tag, updates=4):
    if not tag.replace('-', '').isalnum() or updates != 4:
        raise ValueError('This bounded study runs exactly four explicitly authorized updates')
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA is required; no CPU fallback is allowed for this study')
    torch.set_num_threads(2)
    out = BASE / tag
    out.mkdir(exist_ok=False)
    started = time.monotonic()
    env = None
    events = []
    episode_count = 0
    current = None
    exploration = None
    best = None
    state = {'m': [0.0] * 38, 'v': [0.0] * 38, 't': 0}
    progress_state = {'phase': 'starting', 'completedUpdates': 0, 'completedEpisodes': 0}

    def progress(phase, **fields):
        progress_state.update({'phase': phase, 'completedUpdates': len(events),
                               'completedEpisodes': episode_count,
                               'elapsedWallSeconds': time.monotonic() - started, **fields})
        atomic_json(out / 'progress.json', progress_state)
        print('FIRSTLAP_GATED_PPO ' + json.dumps(progress_state), flush=True)

    try:
        preflight = json.loads(PREFLIGHT.read_text(encoding='utf-8'))
        basis_file = PREPARED / 'basis.private.json'
        basis_report = json.loads((PREPARED / 'report.json').read_text(encoding='utf-8'))
        basis = json.loads(basis_file.read_text(encoding='utf-8'))
        if (not preflight['passed'] or preflight['learningSucceeded'] or preflight['approvedForApp']
                or preflight['instantGate'] is not True or preflight['outsideGateActiveControls'] != 0
                or preflight['targetGateActiveControls'] <= 0
                or preflight['basisFileSha256'] != file_hash(basis_file)
                or basis_report['basisFileSha256'] != file_hash(basis_file)):
            raise RuntimeError('Exact, reviewed local-gate zero-policy preflight is required')
        if file_hash(SAVE) != SAVE_SHA256 or preflight['originalSaveSha256'] != SAVE_SHA256:
            raise RuntimeError('The protected user save identity changed')

        files = [
            'work/train_statehead_gate_onset_ppo.py',
            'work/train_statehead_reward_gatefloor.py',
            'work/statehead_reward_actor.py',
            'work/learned_neural_exploration.py',
            'work/neuronal_experiment_io.py',
            'work/statehead-reward-gate-env.cjs',
            'work/neural-statehead-gate.cjs',
            'work/build_statehead_strict_local_basis.py',
            'work/capture_statehead_parent_inputs.py',
            'work/verify_statehead_strict_local_basis.py',
            'work/neural-context-readout.cjs',
            'work/neural-context-stack.cjs',
            'work/neural-projected-residual.cjs',
            'work/neural-projected-frontier.cjs',
            'work/neural-json-head.cjs',
            'work/neural-frontier-chain.cjs',
            'work/neural-statehead-rl-live.cjs',
            'work/neural-statehead-cuda-model.cjs',
            'work/neural-command-residual.cjs',
            'work/neural-research-source-identity.cjs',
            (PREPARED / 'basis.private.json').relative_to(ROOT).as_posix(),
            (PREPARED / 'report.json').relative_to(ROOT).as_posix(),
            PREFLIGHT.relative_to(ROOT).as_posix(),
            '.impeccable/review/learning-ml/statehead-firstlap-state-inputs-20261026-34/report.json',
            '.impeccable/review/learning-ml/statehead-firstlap-state-inputs-20261026-34/parent-neural-inputs.f64',
            'outputs/data/connectome.json',
            'outputs/data/circuits.json',
            'package.json',
        ]
        closure_code = "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(" + json.dumps(files) + ")))"
        source_closure = json.loads(subprocess.check_output(
            [str(NODE), '-e', closure_code], cwd=ROOT, text=True,
            creationflags=subprocess.CREATE_NO_WINDOW))
        if any(file not in source_closure or source_closure[file] != file_hash(ROOT / file)
               for file in files):
            raise RuntimeError('Source closure changed while preparing the training run')
        source_hashes = source_closure

        settings = {
            'appVersion': '5.6.0', 'device': 'cuda:0', 'updatesRequested': 4,
            'episodesPerUpdate': 8, 'pairedSeedsPerUpdate': 4,
            'trainingResetMode': 'observed-746', 'gateFloor': 0.0, 'instantGate': True,
            'prefixCaptureControl': 746,
            'targetProgressWindowMeters': basis_report['targetProgressWindowMeters'],
            'gateBasisFileSha256': file_hash(basis_file),
            'initialMeanWeights': 18, 'initialMeanWeightsAreAllZero': True,
            'varianceWeights': 20, 'initialExploration': None,
            'epochs': 24, 'candidateFractions': [0.03, 0.1, 0.3, 1.0],
            'noLapTerminalCost': 0, 'collisionTerminalCost': 2000,
            'progressShapingPerMeter': 1.0, 'maximumConditionalKL': 0.02,
            'optimizer': 'clipped-Gaussian-likelihood-Adam-vector-rates',
            'candidatePromotion': 'two-identical-safe-full-from-line-replays-and-rank-improvement',
        }

        progress('starting-zero-policy-full-parent-verification')
        env = Pipe(ROOT / 'work/statehead-reward-gate-env.cjs',
                   initialization={'basisOverride': basis, 'instantGate': True,
                                   'extraPrefixControls': [settings['prefixCaptureControl']]})
        meta = env.metadata
        if (not meta['gateBasisOverride'] or meta['gateBasisCentres'] != basis_report['centerCount']
                or not meta['instantGate'] or meta['extraPrefixControls'] != [746]
                or 'observed-746' not in meta['prefixes']):
            raise RuntimeError('Research environment did not load the exact local gate basis')
        prefix = meta['prefixes']['observed-746']
        if not 890.0 <= prefix['progress'] <= 895.0:
            raise RuntimeError('Observed training prefix is outside the verified active-gate window')
        settings['trainingPrefixProgressMeters'] = prefix['progress']
        current = meta['weights'][:]
        exploration = copy.deepcopy(meta['defaultExploration'])
        if len(current) != 18 or any(value != 0 for value in current):
            raise RuntimeError('Training must start with all 18 mean coefficients exactly zero')
        if len(exploration['weights']) != 20:
            raise RuntimeError('Expected 20 bounded variance coefficients')
        baseline = meta['baseline']['observed']
        if baseline != {key: meta['parentExpected'][key] for key in (
                'bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds', 'complete', 'lapTimes')}:
            raise RuntimeError('Current zero-policy full result differs from its protected parent')
        best = {'weights': current[:], 'exploration': copy.deepcopy(exploration),
                'result': baseline, 'fullFromLine': True, 'source': 'protected-parent-zero-policy'}
        settings['initialExploration'] = copy.deepcopy(exploration)

        identity = {
            'format': 'private-statehead-strict-local-gate-onset-ppo-v1',
            'settings': settings, 'parentSha256': meta['parentSha256'],
            'parentExpected': meta['parentExpected'], 'baseline': meta['baseline'],
            'gateBasisSha256': meta['gateBasisSha256'], 'basisFileSha256': file_hash(basis_file),
            'sourceHashes': source_hashes, 'sourceClosure': source_closure,
            'preflightReportSha256': file_hash(PREFLIGHT),
            'originalSaveSha256': file_hash(SAVE),
            'gpu': torch.cuda.get_device_name(0), 'torchVersion': torch.__version__,
            'boundary': 'Research-only, zero-initialized PPO trained from a captured real parent state near 892 m where the local neural gate is already active, using actual 516-value MaleCNS inputs. A per-observation radial gate has strict off-window zero support and no global floor. Progress is only an offline label and is not an inference input. Every promotion still requires two deterministic safe full-from-line replays better than the protected parent. No app export or save mutation.',
        }
        atomic_json(out / 'identity.json', identity)
        atomic_json(out / 'metadata.private.json', meta)
        progress('baseline-verified', baseline=baseline, gateFloor=0.0,
                 gateActiveControlsInProtectedLap=preflight['targetGateActiveControls'],
                 gateActiveControlsOutsideWindow=preflight['outsideGateActiveControls'],
                 trainingPrefixProgressMeters=prefix['progress'])

        for update in range(4):
            env.request('clear')
            episodes = []
            for lane in range(4):
                seed = 10261026 + update * 1000003 + lane * 104729
                for sign in (1, -1):
                    episode = env.request('episode', configuration={
                        'weights': current, 'exploration': exploration,
                        'resetMode': 'observed-746', 'gateFloor': 0.0,
                        'seed': seed, 'sign': sign, 'safetyCost': 2000,
                        'noLapCost': 0, 'progressShapingPerMeter': 1.0,
                    })
                    if (episode['fullFromLine'] or episode['resetMode'] != 'observed-746'
                            or episode['gateFloor'] != 0.0
                            or episode['start']['progress'] != prefix['progress']):
                        raise RuntimeError('Every curriculum episode must use the exact captured no-floor prefix')
                    episodes.append(episode)
                    episode_count += 1
                    atomic_json(out / f'update-{update + 1:02}-episode-{len(episodes):02}.private.json', episode)
                    progress('episode-finished', update=update + 1, episode=len(episodes),
                             result=episode['result'], activeControls=sum(row['active'] for row in episode['rows']),
                             newLaps=episode['newLaps'], progressAfterReset=episode['progressAfterReset'],
                             safe=episode['safe'])

            adv, adv_metrics = advantages(episodes)
            actor = StateheadActor(meta, episodes, current, exploration, device='cuda:0')
            before, initial_kl = actor.objective(adv)
            if abs(float(initial_kl.detach())) >= 1e-10:
                raise RuntimeError('PPO behavior policy and trainable policy are not identical at update start')
            optimizer_start = time.perf_counter()
            state, optimizer_history = optimize(actor, adv, state, 24)
            torch.cuda.synchronize()
            optimizer_seconds = time.perf_counter() - optimizer_start
            optimized_weights = actor.native_weights()
            optimized_exploration = actor.exploration_config()
            score, kl = actor.objective(adv)
            native_score = env.request('rescore', weights=optimized_weights, advantages=adv,
                                       configuration={'exploration': optimized_exploration})
            if (abs(native_score['meanGaussianKL'] - float(kl.detach())) > 1e-8
                    or abs(native_score['meanClippedSurrogate'] - float(score.detach())) > 1e-8):
                raise RuntimeError('CUDA PPO likelihood does not match the native environment rescore')

            candidates = []
            current_before = best['result'] if update == 0 else current_result
            for fraction in settings['candidateFractions']:
                weights = (np.asarray(current) + fraction * (np.asarray(optimized_weights) - current)).tolist()
                variance = (np.asarray(exploration['weights']) + fraction *
                            (np.asarray(optimized_exploration['weights']) - exploration['weights'])).tolist()
                candidate_exploration = {**exploration, 'weights': variance}
                screen = env.request('rescore', weights=weights, advantages=adv,
                                     configuration={'exploration': candidate_exploration})
                candidate = {'fraction': fraction, 'weights': weights,
                             'exploration': candidate_exploration, 'screen': screen}
                if screen['meanGaussianKL'] <= 0.02 + 1e-10 and screen['meanClippedSurrogate'] > float(before.detach()) + 1e-10:
                    candidate['surrogateEligible'] = True
                    first = env.request('evaluate', weights=weights, configuration={'gateFloor': 0.0})
                    second = env.request('evaluate', weights=weights, configuration={'gateFloor': 0.0})
                    candidate['fullFromLineProofs'] = [first, second]
                    candidate['fullFromLineResult'] = first
                    candidate['repeatReplayIdentical'] = first == second
                    candidate['safePhysicalImprovement'] = (first == second and safe(first)
                                                              and rank(first) > rank(current_before))
                candidates.append(candidate)
                progress('candidate-screened', update=update + 1, fraction=fraction,
                         surrogateEligible=candidate.get('surrogateEligible', False),
                         fullFromLineResult=candidate.get('fullFromLineResult'))

            eligible = [candidate for candidate in candidates if candidate.get('safePhysicalImprovement')]
            accepted = max(eligible, key=lambda c: (rank(c['fullFromLineResult'],),
                                                     c['screen']['meanClippedSurrogate'])) if eligible else None
            if accepted:
                current = accepted['weights'][:]
                exploration = copy.deepcopy(accepted['exploration'])
                current_result = accepted['fullFromLineResult']
                if rank(current_result) > rank(best['result']):
                    best = {'weights': current[:], 'exploration': copy.deepcopy(exploration),
                            'result': current_result, 'fullFromLine': True,
                            'source': f'update-{update + 1}:fraction-{accepted["fraction"]}'}
            else:
                current_result = current_before

            event = {
                'update': update + 1, 'episodes': len(episodes),
                'controls': sum(episode['controls'] for episode in episodes),
                'activeControls': adv_metrics['active'], 'advantageMetrics': adv_metrics,
                'optimizerSeconds': optimizer_seconds, 'optimizerEpochs': optimizer_history,
                'nativeScreen': native_score, 'candidates': candidates,
                'acceptedFraction': accepted['fraction'] if accepted else None,
                'acceptedResult': accepted.get('fullFromLineResult') if accepted else None,
                'currentFullBefore': current_before, 'currentFullAfter': current_result,
                'bestFull': best['result'],
                'episodeSummaries': [{key: episode[key] for key in (
                    'seed', 'sign', 'resetMode', 'controls', 'result', 'start', 'newLaps',
                    'progressAfterReset', 'trainingReward', 'safe', 'traceSha256', 'gateFloor')}
                                     for episode in episodes],
            }
            events.append(event)
            atomic_json(out / f'update-{update + 1:02}.json', event)
            atomic_json(out / 'checkpoint.private.json', {
                'format': 'private-statehead-strict-local-gate-onset-ppo-checkpoint-v1',
                'nextUpdate': update + 2, 'currentWeights': current,
                'currentExploration': exploration, 'currentFull': current_result,
                'bestFull': best, 'optimizerState': state, 'settings': settings,
                'sourceHashes': source_hashes, 'parentSha256': meta['parentSha256'],
                'gateBasisSha256': meta['gateBasisSha256'],
                'boundary': 'Private experiment checkpoint only; not loadable by the app.',
            })
            progress('update-finished', update=update + 1,
                     acceptedFraction=event['acceptedFraction'], bestFull=best['result'])

        final_best = env.request('evaluate', weights=best['weights'], configuration={'gateFloor': 0.0})
        if final_best != best['result']:
            raise RuntimeError('Final fresh full-from-line replay differs from the recorded best policy')
        if file_hash(SAVE) != SAVE_SHA256:
            raise RuntimeError('Original user save changed during the GPU study')
        final = {
            'format': 'private-statehead-strict-local-gate-onset-ppo-v1',
            'passed': True, 'learningSucceeded': safe(final_best) and final_best['laps'] >= 2,
            'physicalImprovementOverProtectedParent': safe(final_best) and rank(final_best) > rank(baseline),
            'approvedForApp': False, 'updatesCompleted': len(events),
            'episodesCompleted': sum(event['episodes'] for event in events),
            'trainingControls': sum(event['controls'] for event in events),
            'activeTrainingControls': sum(event['activeControls'] for event in events),
            'baseline': baseline, 'best': best, 'finalFreshReplay': final_best,
            'events': events, 'settings': settings, 'sourceHashes': source_hashes,
            'originalSaveSha256': file_hash(SAVE), 'cuda': env.request('stats'),
            'wallSeconds': time.monotonic() - started,
            'boundary': 'Four updates of actual on-policy PPO with 32 paired rollouts from the exact observed parent prefix near 892 m inside the gate-active window, a per-observation gate strictly local to the selected neural-state window, no global gate floor, and zero mean weights at start. Promotion within this private study required two identical safe complete from-line replays strictly better than the protected parent/current policy. This is not app deployment, a new app version, or save migration.',
        }
        atomic_json(out / 'report.json', final)
        progress('finished', learningSucceeded=final['learningSucceeded'],
                 physicalImprovement=final['physicalImprovementOverProtectedParent'],
                 best=best['result'])
    except BaseException as error:
        atomic_json(out / 'failure.json', {'error': repr(error), 'updatesCompleted': len(events),
                                            'elapsedWallSeconds': time.monotonic() - started})
        raise
    finally:
        if env:
            env.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    parser.add_argument('--updates', type=int, default=4)
    args = parser.parse_args()
    run(args.tag, args.updates)
