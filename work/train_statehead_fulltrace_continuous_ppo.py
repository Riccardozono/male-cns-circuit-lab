"""Continuous four-update PPO study with a separately protected incumbent.

This is research-only. It requires an exact zero-weight replay of the protected
parent, uses no global gate floor, and keeps the learned policy/Adam state
continuous while separately protecting the best replay-verified incumbent.
It never writes app models or user saves.
"""
import os
os.environ['OPENBLAS_NUM_THREADS'] = '2'
os.environ['OMP_NUM_THREADS'] = '2'

import argparse
import copy
import gzip
import json
import subprocess
import time
from pathlib import Path

import numpy as np
import torch

from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from statehead_reward_actor import StateheadActor, advantages
from statehead_ppo_optimizer import optimize


PREPARED = ROOT / '.impeccable/review/learning-ml/statehead-fulltrace-gate-basis-20261026-41'
PREFLIGHT = ROOT / '.impeccable/review/learning-ml/statehead-fulltrace-gate-zero-preflight-20261026-42/report.json'
SAVE = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
SAVE_SHA256 = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
BASE = ROOT / '.impeccable/review/learning-ml'
REFERENCE_RUN = BASE / 'statehead-fulltrace-gated-ppo-4up-20261026-43'
REFERENCE_REPORT_SHA256 = '29d9dee03462c1731f8cd3d3189b1f215ddd2f05cc3585ac0d6bc473c468cbf9'


def safe(result):
    return result['complete'] and result['reason'] not in ['urto', 'fuori pista', 'progresso non valido']


def rank(result):
    return result['laps'], result['bestProgress'], result['fitness']


def atomic_gzip_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    payload = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    with temporary.open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', compresslevel=6, mtime=0) as stream:
            stream.write(payload)
        raw.flush()
        os.fsync(raw.fileno())
    os.replace(temporary, path)
    return file_hash(path)


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
    current = None
    exploration = None
    best = None
    state = {'m': [0.0] * 38, 'v': [0.0] * 38, 't': 0}
    progress_state = {'phase': 'starting', 'completedUpdates': 0, 'completedEpisodes': 0}

    def progress(phase, **fields):
        progress_state.update({'phase': phase, 'completedUpdates': len(events),
                               'elapsedWallSeconds': time.monotonic() - started, **fields})
        atomic_json(out / 'progress.json', progress_state)
        print('FULLTRACE_GATE_PPO ' + json.dumps(progress_state), flush=True)

    try:
        preflight = json.loads(PREFLIGHT.read_text(encoding='utf-8'))
        basis_file = PREPARED / 'basis.private.json'
        basis_report = json.loads((PREPARED / 'report.json').read_text(encoding='utf-8'))
        basis = json.loads(basis_file.read_text(encoding='utf-8'))
        reference_file = REFERENCE_RUN / 'report.json'
        reference_report = json.loads(reference_file.read_text(encoding='utf-8'))
        reference_identity = json.loads((REFERENCE_RUN / 'identity.json').read_text(encoding='utf-8'))
        if (file_hash(reference_file) != REFERENCE_REPORT_SHA256
                or not reference_report['passed'] or reference_report['learningSucceeded']
                or reference_report['approvedForApp']
                or reference_report['baseline'] != reference_report['finalFreshReplay']
                or reference_report['originalSaveSha256'] != SAVE_SHA256
                or reference_report['settings']['gateBasisFileSha256'] != file_hash(basis_file)):
            raise RuntimeError('The cached complete parent proof is missing, stale, or inconsistent')
        if (not preflight['passed'] or preflight['learningSucceeded'] or preflight['approvedForApp']
                or preflight['instantGate'] is not True
                or preflight['zeroWeightsPreserveEveryAppliedCommand'] is not True
                or preflight['runtimeGateAbove0_01'] != preflight['controls']
                or preflight['basisFileSha256'] != file_hash(basis_file)
                or basis_report['basisFileSha256'] != file_hash(basis_file)):
            raise RuntimeError('Exact, reviewed full-trace zero-policy preflight is required')
        if file_hash(SAVE) != SAVE_SHA256 or preflight['originalSaveSha256'] != SAVE_SHA256:
            raise RuntimeError('The protected user save identity changed')

        files = [
            'work/train_statehead_fulltrace_continuous_ppo.py',
            'work/statehead_ppo_optimizer.py',
            'work/train_statehead_reward_gatefloor.py',
            'work/statehead_reward_actor.py',
            'work/learned_neural_exploration.py',
            'work/neuronal_experiment_io.py',
            'work/statehead-reward-gate-env.cjs',
            'work/statehead-continuous-ppo-env.cjs',
            'work/neural-statehead-gate.cjs',
            'work/neural-frontier-chain.cjs',
            'work/neural-statehead-rl-live.cjs',
            'work/neural-statehead-cuda-model.cjs',
            'work/neural-command-residual.cjs',
            'work/neural-research-source-identity.cjs',
            'work/build_statehead_fulltrace_basis.py',
            'work/verify_statehead_fulltrace_basis.py',
            'work/neural-context-readout.cjs',
            'work/neural-context-stack.cjs',
            '.impeccable/review/learning-ml/statehead-firstlap-state-inputs-20261026-34/report.json',
            '.impeccable/review/learning-ml/statehead-firstlap-state-inputs-20261026-34/parent-neural-inputs.f64',
            (PREPARED / 'basis.private.json').relative_to(ROOT).as_posix(),
            (PREPARED / 'report.json').relative_to(ROOT).as_posix(),
            PREFLIGHT.relative_to(ROOT).as_posix(),
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
        for file, digest in reference_report['sourceHashes'].items():
            if file == 'work/train_statehead_fulltrace_gate_ppo.py':
                continue
            if file not in source_closure or source_closure[file] != digest:
                raise RuntimeError(f'Cached parent proof source changed: {file}')
        source_hashes = source_closure

        settings = {
            'appVersion': '5.6.0', 'device': 'cuda:0', 'updatesRequested': 4,
            'episodesPerUpdate': 8, 'pairedSeedsPerUpdate': 4,
            'trainingResetMode': 'from-line', 'gateFloor': 0.0,
            'gateBasisFileSha256': file_hash(basis_file),
            'initialMeanWeights': 18, 'initialMeanWeightsAreAllZero': True,
            'varianceWeights': 20, 'initialExploration': None,
            'epochs': 24, 'candidateFractions': [0.03, 0.1, 0.3, 1.0],
            'noLapTerminalCost': 4000, 'collisionTerminalCost': 2000,
            'progressShapingPerMeter': 1.0, 'maximumConditionalKL': 0.02,
            'optimizer': 'clipped-Gaussian-likelihood-Adam-vector-rates-with-gradient-aligned-momentum-reset',
            'learnerPolicyContinuesAcrossUpdates': True,
            'protectedIncumbentSeparateFromLearner': True,
            'privateEpisodeArchive': 'deterministic-gzip-json',
            'cachedParentProofReportSha256': REFERENCE_REPORT_SHA256,
            'candidatePromotion': 'two-identical-safe-full-from-line-replays-and-rank-improvement',
        }

        progress('validating-cached-zero-policy-full-parent-proof')
        cached_baseline = {
            'observed': reference_report['finalFreshReplay'],
            'controls': preflight['controls'],
            'traceSha256': preflight['parentActionTraceSha256'],
            'parentSha256': reference_identity['parentSha256'],
        }
        env = Pipe(ROOT / 'work/statehead-continuous-ppo-env.cjs',
                   initialization={'basisOverride': basis, 'instantGate': True,
                                   'verifiedBaseline': cached_baseline})
        meta = env.metadata
        if (not meta['gateBasisOverride'] or not meta['instantGate']
                or meta['gateBasisCentres'] != basis_report['centreCount']
                or meta['baseline']['traceSha256'] != preflight['parentActionTraceSha256']
                or meta['baseline']['baselineSource'] != 'previously-verified-complete-replay'
                or meta['parentSha256'] != reference_identity['parentSha256']):
            raise RuntimeError('Research environment did not load the exact instant full-trace gate')
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
        current_result = baseline
        settings['initialExploration'] = copy.deepcopy(exploration)

        identity = {
            'format': 'private-statehead-fulltrace-gated-ppo-v1',
            'settings': settings, 'parentSha256': meta['parentSha256'],
            'parentExpected': meta['parentExpected'], 'baseline': meta['baseline'],
            'baselineValidationMode': 'cached-exact-source-and-save-matched-proof-plus-final-fresh-replay',
            'gateBasisSha256': meta['gateBasisSha256'], 'basisFileSha256': file_hash(basis_file),
            'sourceHashes': source_hashes, 'sourceClosure': source_closure,
            'preflightReportSha256': file_hash(PREFLIGHT),
            'originalSaveSha256': file_hash(SAVE),
            'gpu': torch.cuda.get_device_name(0), 'torchVersion': torch.__version__,
            'boundary': 'Research-only, zero-initialized PPO on actual 516-value MaleCNS inputs. Instant radial gate uses recorded full-trace neural states; no route or progress inputs and no global floor. Candidate promotion requires two deterministic safe full-from-line replays that improve the protected parent. No app export or save mutation.',
        }
        atomic_json(out / 'identity.json', identity)
        atomic_json(out / 'metadata.private.json', meta)
        progress('baseline-verified', baseline=baseline, gateFloor=0.0,
                 gateActiveControlsInProtectedLap=preflight['runtimeGateAbove0_01'])

        for update in range(4):
            env.request('clear')
            episodes = []
            for lane in range(4):
                seed = 10261026 + update * 1000003 + lane * 104729
                for sign in (1, -1):
                    episode = env.request('episode', configuration={
                        'weights': current, 'exploration': exploration,
                        'resetMode': 'from-line', 'gateFloor': 0.0,
                        'seed': seed, 'sign': sign, 'safetyCost': 2000,
                        'noLapCost': 4000, 'progressShapingPerMeter': 1.0,
                    })
                    if (not episode['fullFromLine'] or episode['start']['laps'] != 0
                            or episode['gateFloor'] != 0.0):
                        raise RuntimeError('Every update episode must be a no-floor full from-line rollout')
                    episodes.append(episode)
                    archive_path = out / f'update-{update + 1:02}-episode-{len(episodes):02}.private.json.gz'
                    episode['privateArchiveSha256'] = atomic_gzip_json(archive_path, episode)
                    episode['privateArchiveFile'] = archive_path.name
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
            current_before = current_result
            incumbent_before = best['result']
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
                                                              and rank(first) > rank(best['result']))
                candidates.append(candidate)
                progress('candidate-screened', update=update + 1, fraction=fraction,
                         surrogateEligible=candidate.get('surrogateEligible', False),
                         fullFromLineResult=candidate.get('fullFromLineResult'))

            eligible = [candidate for candidate in candidates if candidate.get('safePhysicalImprovement')]
            accepted = max(eligible, key=lambda c: (rank(c['fullFromLineResult'],),
                                                     c['screen']['meanClippedSurrogate'])) if eligible else None
            if accepted:
                if rank(accepted['fullFromLineResult']) > rank(best['result']):
                    best = {'weights': accepted['weights'][:],
                            'exploration': copy.deepcopy(accepted['exploration']),
                            'result': accepted['fullFromLineResult'], 'fullFromLine': True,
                            'source': f'update-{update + 1}:fraction-{accepted["fraction"]}'}

            # Keep the on-policy learner continuous even when a candidate is
            # not safe enough for incumbent promotion. The immutable incumbent
            # above remains the only export-eligible checkpoint.
            current = optimized_weights[:]
            exploration = copy.deepcopy(optimized_exploration)
            full_candidate = next(candidate for candidate in candidates
                                  if candidate['fraction'] == 1.0)
            if 'fullFromLineResult' in full_candidate:
                current_result = full_candidate['fullFromLineResult']
            else:
                current_result = env.request('evaluate', weights=current,
                                             configuration={'gateFloor': 0.0})

            event = {
                'update': update + 1, 'episodes': len(episodes),
                'controls': sum(episode['controls'] for episode in episodes),
                'activeControls': adv_metrics['active'], 'advantageMetrics': adv_metrics,
                'optimizerSeconds': optimizer_seconds, 'optimizerEpochs': optimizer_history,
                'nativeScreen': native_score, 'candidates': candidates,
                'acceptedFraction': accepted['fraction'] if accepted else None,
                'acceptedResult': accepted.get('fullFromLineResult') if accepted else None,
                'currentFullBefore': current_before, 'currentFullAfter': current_result,
                'incumbentFullBefore': incumbent_before,
                'incumbentFullAfter': best['result'],
                'bestFull': best['result'],
                'episodeSummaries': [{key: episode[key] for key in (
                    'seed', 'sign', 'resetMode', 'controls', 'result', 'start', 'newLaps',
                    'progressAfterReset', 'trainingReward', 'safe', 'traceSha256', 'gateFloor',
                    'privateArchiveFile', 'privateArchiveSha256')}
                                     for episode in episodes],
            }
            events.append(event)
            atomic_json(out / f'update-{update + 1:02}.json', event)
            atomic_json(out / 'checkpoint.private.json', {
                'format': 'private-statehead-fulltrace-continuous-ppo-checkpoint-v1',
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
            'format': 'private-statehead-fulltrace-continuous-ppo-v1',
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
            'boundary': 'Four sequential on-policy PPO updates with 32 paired from-line rollouts and no global gate floor. The learner and Adam state continue across updates even if candidate replays are unsafe; the protected incumbent changes only after a positive surrogate screen and two identical safe complete from-line replays that rank above the incumbent. The initial complete parent proof is reused only after exact report, source, gate, save and model identity checks; the final best policy receives a fresh complete from-line replay. Only the protected incumbent is export-eligible. This is not app deployment, a new app version, or save migration.',
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
