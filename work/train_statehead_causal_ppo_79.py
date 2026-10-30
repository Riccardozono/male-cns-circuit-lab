"""Larger paired-seed PPO study with a causal critic and protected incumbent.

This is research-only. It requires an exact zero-weight replay of the protected
parent, uses no global gate floor, keeps the verified behavior frontier separate
from the protected incumbent, and resets Adam after each update. It never
writes app models or user saves.
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
from statehead_reward_actor import StateheadActor
from statehead_causal_gae_actor_76 import advantages_causal
from statehead_ppo_optimizer import optimize


PREPARED = ROOT / '.impeccable/review/learning-ml/statehead-fulltrace-gate-basis-20261026-41'
PREFLIGHT = ROOT / '.impeccable/review/learning-ml/statehead-fulltrace-gate-zero-preflight-20261026-42/report.json'
SAVE = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
SAVE_SHA256 = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
BASE = ROOT / '.impeccable/review/learning-ml'
REFERENCE_RUN = BASE / 'statehead-fulltrace-gated-ppo-4up-20261026-43'
REFERENCE_REPORT_SHA256 = '29d9dee03462c1731f8cd3d3189b1f215ddd2f05cc3585ac0d6bc473c468cbf9'
CRITIC_VERIFICATION = BASE / 'statehead-causalcritic-verification-20261026-76/report.json'
CRITIC_VERIFICATION_SHA256 = '8ed0b868bf416756daa3320cbdb409ae1376b3a8ee16775cc8da709db72631d2'
BUFFER_VERIFICATION = BASE / 'statehead-buffer-compaction-verification-20261026-79/report.json'
BUFFER_VERIFICATION_SHA256 = '148b13d8def229339bb1f31ce56434c157d529cb647a46dac8d5f946830e2e1d'
GAE_GAMMA = 0.999
GAE_LAMBDA = 1.0


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


def run(tag, updates=4, progress_shaping_per_meter=1.0,
        frontier_report_path=None, frontier_report_sha256=None,
        frontier_update=None, frontier_fraction=None, gae_lambda=GAE_LAMBDA,
        optimizer_rate_scale=1.0):
    if (not tag.replace('-', '').isalnum() or updates != 4
            or not np.isfinite(progress_shaping_per_meter)
            or not 0.0 <= progress_shaping_per_meter <= 5.0
            or not np.isfinite(gae_lambda) or gae_lambda != 1.0
            or not np.isfinite(optimizer_rate_scale) or not 0.25 <= optimizer_rate_scale <= 8.0
            or any(value is not None for value in (
                frontier_report_path, frontier_report_sha256, frontier_update, frontier_fraction))
            and not all(value is not None for value in (
                frontier_report_path, frontier_report_sha256, frontier_update, frontier_fraction))):
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
        if (not CRITIC_VERIFICATION.is_file()
                or file_hash(CRITIC_VERIFICATION) != CRITIC_VERIFICATION_SHA256):
            raise RuntimeError('The causal critic verification report is missing or changed')
        critic_verification = json.loads(CRITIC_VERIFICATION.read_text(encoding='utf-8'))
        if (not critic_verification.get('passed')
                or critic_verification.get('sourceHashes', {}).get('critic')
                != file_hash(ROOT / 'work/statehead_causal_gae_actor_76.py')
                or critic_verification.get('originalSaveSha256') != SAVE_SHA256):
            raise RuntimeError('The verified critic source or original save no longer matches')
        if (not BUFFER_VERIFICATION.is_file()
                or file_hash(BUFFER_VERIFICATION) != BUFFER_VERIFICATION_SHA256):
            raise RuntimeError('The Python buffer compaction verification is missing or changed')
        buffer_verification = json.loads(BUFFER_VERIFICATION.read_text(encoding='utf-8'))
        if (not buffer_verification.get('passed') or not buffer_verification.get('gradientBitIdentical')
                or buffer_verification.get('sourceHashes', {}).get('critic')
                != file_hash(ROOT / 'work/statehead_causal_gae_actor_76.py')
                or buffer_verification.get('sourceHashes', {}).get('actor')
                != file_hash(ROOT / 'work/statehead_reward_actor.py')
                or buffer_verification.get('originalSaveSha256') != SAVE_SHA256):
            raise RuntimeError('The compaction proof does not match the current actor, critic and save')

        files = [
            'work/train_statehead_causal_ppo_79.py',
            'work/train_statehead_causal_ppo_76.py',
            'work/statehead_causal_gae_actor_76.py',
            'work/verify_statehead_buffer_compaction_79.py',
            'work/train_statehead_safe_anchor_pooled_ppo.py',
            'work/statehead_ppo_optimizer.py',
            'work/train_statehead_reward_gatefloor.py',
            'work/statehead_reward_actor.py',
            'work/statehead_gae_actor.py',
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
            CRITIC_VERIFICATION.relative_to(ROOT).as_posix(),
            BUFFER_VERIFICATION.relative_to(ROOT).as_posix(),
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
            if file in ('work/train_statehead_fulltrace_gate_ppo.py', 'work/statehead_ppo_optimizer.py'):
                continue
            if file not in source_closure or source_closure[file] != digest:
                raise RuntimeError(f'Cached parent proof source changed: {file}')
        source_hashes = source_closure

        initial_frontier = None
        if frontier_report_path is not None:
            seed_path = Path(frontier_report_path)
            if not seed_path.is_absolute():
                seed_path = ROOT / seed_path
            if (not seed_path.is_file()
                    or file_hash(seed_path).lower() != str(frontier_report_sha256).lower()):
                raise RuntimeError('The selected frontier report is missing or its SHA-256 does not match')
            seed_report = json.loads(seed_path.read_text(encoding='utf-8'))
            if (not seed_report.get('passed') or seed_report.get('learningSucceeded')
                    or seed_report.get('approvedForApp')
                    or seed_report.get('originalSaveSha256', '').lower() != SAVE_SHA256
                    or seed_report.get('settings', {}).get('appVersion') != '5.6.0'
                    or seed_report.get('settings', {}).get('gateBasisFileSha256') != file_hash(basis_file)
                    or seed_report.get('baseline') != seed_report.get('finalFreshReplay')):
                raise RuntimeError('Frontier report does not match the protected app, save, or full-lap proof')
            for file, digest in seed_report.get('sourceHashes', {}).items():
                if file in ('work/train_statehead_safe_anchor_pooled_ppo.py', 'work/statehead_ppo_optimizer.py'):
                    continue
                if source_closure.get(file) != digest:
                    raise RuntimeError(f'Frontier report source changed since its run: {file}')
            seed_events = [event for event in seed_report.get('events', [])
                           if event.get('update') == frontier_update]
            seed_candidates = [candidate for event in seed_events
                               for candidate in event.get('candidates', [])
                               if abs(float(candidate.get('fraction', -1)) - frontier_fraction) < 1e-12]
            if len(seed_candidates) != 1:
                raise RuntimeError('The selected report must contain exactly one matching frontier candidate')
            seed_candidate = seed_candidates[0]
            proofs = seed_candidate.get('fullFromLineProofs', [])
            if (not seed_candidate.get('repeatReplayIdentical') or len(proofs) != 2
                    or proofs[0] != proofs[1]
                    or proofs[0] != seed_candidate.get('fullFromLineResult')
                    or not safe(proofs[0]) or proofs[0]['laps'] != 0):
                raise RuntimeError('A training frontier must have two identical safe zero-lap full-from-line replays')
            seed_weights = seed_candidate.get('weights')
            seed_exploration = seed_candidate.get('exploration')
            if (not isinstance(seed_weights, list) or len(seed_weights) != 18
                    or any(not np.isfinite(value) for value in seed_weights)
                    or not isinstance(seed_exploration, dict)
                    or not isinstance(seed_exploration.get('weights'), list)
                    or len(seed_exploration['weights']) != 20
                    or any(not np.isfinite(value) for value in seed_exploration['weights'])):
                raise RuntimeError('The selected frontier has incompatible neural or exploration weights')
            initial_frontier = {
                'sourceReport': str(seed_path), 'sourceReportSha256': file_hash(seed_path),
                'update': frontier_update, 'fraction': frontier_fraction,
                'weights': seed_weights, 'exploration': seed_exploration,
                'result': proofs[0],
            }

        settings = {
            'appVersion': '5.6.0', 'device': 'cuda:0', 'updatesRequested': 4,
            'episodesPerUpdate': 16, 'pairedSeedsPerUpdate': 8,
            'trainingResetMode': 'from-line', 'gateFloor': 0.0,
            'advantageEstimator': 'monte-carlo-causal-critic-leave-paired-seed-out',
            'criticInputs': '9 neuronal features plus prior steering, prior net pedal, gate and previous active exploration innovation',
            'criticVerificationSha256': CRITIC_VERIFICATION_SHA256,
            'bufferVerificationSha256': BUFFER_VERIFICATION_SHA256,
            'discountGamma': GAE_GAMMA, 'gaeLambda': float(gae_lambda),
            'optimizerRateScale': float(optimizer_rate_scale),
            'gateBasisFileSha256': file_hash(basis_file),
            'initialMeanWeights': 18,
            'initialMeanWeightsAreAllZero': initial_frontier is None,
            'initialTrainingFrontier': ({key: value for key, value in initial_frontier.items()
                                         if key not in ('weights', 'exploration')}
                                        if initial_frontier else None),
            'varianceWeights': 20, 'initialExploration': None,
            'epochs': 24, 'candidateFractions': [0.03, 0.1, 0.3, 1.0],
            'noLapTerminalCost': 4000, 'collisionTerminalCost': 2000,
            'progressShapingPerMeter': float(progress_shaping_per_meter),
            'maximumConditionalKL': 0.02,
            'optimizer': 'clipped-Gaussian-likelihood-Adam-vector-rates-reset-per-safe-anchor-batch',
            'learnerPolicyContinuesAcrossUpdates': True,
            'safeAnchor': 'protected one-lap incumbent kept separate from training frontier',
            'experienceBuffer': 'accumulate-only-while-current-behavior-weights-and-exploration-match',
            'rejectedProposal': 'retain-verified-current-frontier-and-reset-optimizer-state',
            'protectedIncumbentSeparateFromLearner': True,
            'privateEpisodeArchive': 'deterministic-gzip-json',
            'pythonBufferCompaction': 'remove 516-value neural input vector only after the full episode archive is written',
            'cachedParentProofReportSha256': REFERENCE_REPORT_SHA256,
            'candidatePromotion': ('two-identical-safe-full-from-line-replays; protected incumbent '
                                  'requires rank improvement, training frontier requires at least '
                                  'max(10m, 1% of current frontier) further progress'),
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
        protected_weights = meta['weights'][:]
        protected_exploration = copy.deepcopy(meta['defaultExploration'])
        if len(protected_weights) != 18 or any(value != 0 for value in protected_weights):
            raise RuntimeError('The protected zero-policy incumbent must retain all 18 zero coefficients')
        if len(protected_exploration['weights']) != 20:
            raise RuntimeError('Expected 20 bounded variance coefficients')
        baseline = meta['baseline']['observed']
        if baseline != {key: meta['parentExpected'][key] for key in (
                'bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds', 'complete', 'lapTimes')}:
            raise RuntimeError('Current zero-policy full result differs from its protected parent')
        best = {'weights': protected_weights[:], 'exploration': copy.deepcopy(protected_exploration),
                'result': baseline, 'fullFromLine': True, 'source': 'protected-parent-zero-policy'}
        current = (initial_frontier['weights'][:] if initial_frontier else protected_weights[:])
        exploration = (copy.deepcopy(initial_frontier['exploration'])
                       if initial_frontier else copy.deepcopy(protected_exploration))
        current_result = (initial_frontier['result'] if initial_frontier else baseline)
        initial_frontier_result = current_result
        current_source = ('verified-safe-partial-frontier' if initial_frontier else 'protected-parent-zero-policy')
        settings['initialExploration'] = copy.deepcopy(exploration)

        identity = {
            'format': 'private-statehead-safe-anchor-pooled-ppo-v1',
            'settings': settings, 'parentSha256': meta['parentSha256'],
            'parentExpected': meta['parentExpected'], 'baseline': meta['baseline'],
            'baselineValidationMode': 'cached-exact-source-and-save-matched-proof-plus-final-fresh-replay',
            'gateBasisSha256': meta['gateBasisSha256'], 'basisFileSha256': file_hash(basis_file),
            'sourceHashes': source_hashes, 'sourceClosure': source_closure,
            'preflightReportSha256': file_hash(PREFLIGHT),
            'originalSaveSha256': file_hash(SAVE),
            'gpu': torch.cuda.get_device_name(0), 'torchVersion': torch.__version__,
            'initialTrainingFrontier': (settings['initialTrainingFrontier']),
            'boundary': 'Research-only PPO on actual 516-value MaleCNS inputs. The critic additionally sees causal parent motor outputs and previous active exploration innovation; the actor is unchanged. The verified one-lap incumbent remains separately protected. A current behavior frontier may advance only after two identical safe full-from-line replays with further progress; rejected proposals leave that frontier unchanged. No route or progress input, teacher, app export, or save mutation.',
        }
        atomic_json(out / 'identity.json', identity)
        atomic_json(out / 'metadata.private.json', meta)
        progress('baseline-verified', baseline=baseline, gateFloor=0.0,
                 gateActiveControlsInProtectedLap=preflight['runtimeGateAbove0_01'])

        experience_buffer = []
        for update in range(4):
            new_episodes = []
            for lane in range(8):
                seed = 10261026 + update * 1000003 + lane * 104729
                for sign in (1, -1):
                    episode = env.request('episode', configuration={
                        'weights': current, 'exploration': exploration,
                        'resetMode': 'from-line', 'gateFloor': 0.0,
                        'seed': seed, 'sign': sign, 'safetyCost': 2000,
                        'noLapCost': 4000,
                        'progressShapingPerMeter': float(progress_shaping_per_meter),
                    })
                    if (not episode['fullFromLine'] or episode['start']['laps'] != 0
                            or episode['gateFloor'] != 0.0):
                        raise RuntimeError('Every update episode must be a no-floor full from-line rollout')
                    new_episodes.append(episode)
                    archive_path = out / f'update-{update + 1:02}-episode-{len(new_episodes):02}.private.json.gz'
                    episode['privateArchiveSha256'] = atomic_gzip_json(archive_path, episode)
                    episode['privateArchiveFile'] = archive_path.name
                    # The actor, critic and native rescore use the retained
                    # features and actions. Preserve the full neuronal vector in
                    # the archive, then release its duplicate in Python memory.
                    for row in episode['rows']:
                        row.pop('neuralInputVector', None)
                    progress_state['completedEpisodes'] += 1
                    progress('episode-finished', update=update + 1, episode=len(new_episodes),
                             result=episode['result'], activeControls=sum(row['active'] for row in episode['rows']),
                             newLaps=episode['newLaps'], progressAfterReset=episode['progressAfterReset'],
                             safe=episode['safe'])

            experience_buffer.extend(new_episodes)
            episodes = experience_buffer
            if any(e['behaviorWeights'] != current or e['exploration'] != exploration for e in episodes):
                raise RuntimeError('Pooled rollouts must all match the current safe anchor policy')
            adv, adv_metrics = advantages_causal(episodes, gamma=GAE_GAMMA, gae_lambda=gae_lambda)
            actor = StateheadActor(meta, episodes, current, exploration, device='cuda:0')
            before, initial_kl = actor.objective(adv)
            if abs(float(initial_kl.detach())) >= 1e-10:
                raise RuntimeError('PPO behavior policy and trainable policy are not identical at update start')
            optimizer_start = time.perf_counter()
            state, optimizer_history = optimize(actor, adv, state, 24,
                                                rate_scale=optimizer_rate_scale)
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
                    frontier_margin = max(10.0, current_result['bestProgress'] * 0.01)
                    candidate['safeFrontierImprovement'] = (
                        first == second and safe(first)
                        and first['bestProgress'] > current_result['bestProgress'] + frontier_margin)
                candidates.append(candidate)
                progress('candidate-screened', update=update + 1, fraction=fraction,
                         surrogateEligible=candidate.get('surrogateEligible', False),
                         fullFromLineResult=candidate.get('fullFromLineResult'))

            eligible = [candidate for candidate in candidates
                        if candidate.get('safePhysicalImprovement') or candidate.get('safeFrontierImprovement')]
            accepted = max(eligible, key=lambda c: (bool(c.get('safePhysicalImprovement')),
                                                     c['fullFromLineResult']['bestProgress'],
                                                     c['screen']['meanClippedSurrogate'])) if eligible else None
            current_before = current_result
            if accepted:
                if rank(accepted['fullFromLineResult']) > rank(best['result']):
                    best = {'weights': accepted['weights'][:],
                            'exploration': copy.deepcopy(accepted['exploration']),
                            'result': accepted['fullFromLineResult'], 'fullFromLine': True,
                            'source': f'update-{update + 1}:fraction-{accepted["fraction"]}'}
                current = accepted['weights'][:]
                exploration = copy.deepcopy(accepted['exploration'])
                current_result = accepted['fullFromLineResult']
                current_source = f'update-{update + 1}:fraction-{accepted["fraction"]}'
                experience_buffer = []
                env.request('clear')

            state = {'m': [0.0] * 38, 'v': [0.0] * 38, 't': 0}

            event = {
                'update': update + 1, 'episodes': len(episodes), 'newEpisodes': len(new_episodes),
                'controls': sum(episode['controls'] for episode in episodes),
                'newControls': sum(episode['controls'] for episode in new_episodes),
                'newActiveControls': sum(sum(row['active'] for row in episode['rows']) for episode in new_episodes),
                'experienceBufferResetAfterPromotion': bool(accepted),
                'acceptedKind': ('protected-incumbent-and-training-frontier'
                                 if accepted and accepted.get('safePhysicalImprovement')
                                 else 'training-frontier-only' if accepted else None),
                'activeControls': adv_metrics['active'], 'advantageMetrics': adv_metrics,
                'optimizerSeconds': optimizer_seconds, 'optimizerEpochs': optimizer_history,
                'nativeScreen': native_score, 'candidates': candidates,
                'acceptedFraction': accepted['fraction'] if accepted else None,
                'acceptedResult': accepted.get('fullFromLineResult') if accepted else None,
                'currentFullBefore': current_before, 'currentFullAfter': current_result,
                'currentFrontierSource': current_source,
                'incumbentFullBefore': incumbent_before,
                'incumbentFullAfter': best['result'],
                'bestFull': best['result'],
                'episodeSummaries': [{key: episode[key] for key in (
                    'seed', 'sign', 'resetMode', 'controls', 'result', 'start', 'newLaps',
                    'progressAfterReset', 'trainingReward', 'safe', 'traceSha256', 'gateFloor',
                    'privateArchiveFile', 'privateArchiveSha256')}
                                      for episode in new_episodes],
            }
            events.append(event)
            atomic_json(out / f'update-{update + 1:02}.json', event)
            atomic_json(out / 'checkpoint.private.json', {
                'format': 'private-statehead-safe-anchor-pooled-ppo-checkpoint-v1',
                'nextUpdate': update + 2, 'currentWeights': current,
                'currentExploration': exploration, 'currentFull': current_result,
                'bestFull': best, 'optimizerState': state, 'settings': settings,
                'sourceHashes': source_hashes, 'parentSha256': meta['parentSha256'],
                'gateBasisSha256': meta['gateBasisSha256'],
                'experienceBufferEpisodes': len(experience_buffer),
                'boundary': 'Private experiment checkpoint only; not loadable by the app.',
            })
            progress('update-finished', update=update + 1,
                     acceptedFraction=event['acceptedFraction'], bestFull=best['result'],
                     currentFrontier=current_result)

        final_best = env.request('evaluate', weights=best['weights'], configuration={'gateFloor': 0.0})
        if final_best != best['result']:
            raise RuntimeError('Final fresh full-from-line replay differs from the recorded best policy')
        if file_hash(SAVE) != SAVE_SHA256:
            raise RuntimeError('Original user save changed during the GPU study')
        final = {
            'format': 'private-statehead-safe-anchor-pooled-ppo-v1',
            'passed': True, 'learningSucceeded': safe(final_best) and final_best['laps'] >= 2,
            'physicalImprovementOverProtectedParent': safe(final_best) and rank(final_best) > rank(baseline),
            'approvedForApp': False, 'updatesCompleted': len(events),
            'episodesCompleted': sum(event['newEpisodes'] for event in events),
            'trainingControls': sum(event['newControls'] for event in events),
            'activeTrainingControls': sum(event['newActiveControls'] for event in events),
            'baseline': baseline, 'best': best, 'finalFreshReplay': final_best,
            'trainingFrontier': {'weights': current, 'exploration': exploration,
                                 'result': current_result, 'source': current_source},
            'trainingFrontierAdvanced': current_result['bestProgress'] > initial_frontier_result['bestProgress'],
            'events': events, 'settings': settings, 'sourceHashes': source_hashes,
            'originalSaveSha256': file_hash(SAVE), 'cuda': env.request('stats'),
            'wallSeconds': time.monotonic() - started,
            'boundary': (f"Four PPO updates with a separately protected one-lap incumbent and "
                         f"a verified safe training frontier, 64 from-line rollouts and GAE "
                         f"(gamma {GAE_GAMMA}, lambda {gae_lambda}, optimizer rate scale "
                         f"{optimizer_rate_scale:g}, causal 15-input cross-fitted critic); distance shaping "
                         f"{progress_shaping_per_meter:g} per meter. While there is no safe "
                         "frontier promotion, all episodes share the same behavior policy and "
                         "accumulate into one on-policy buffer; rejected candidates leave the "
                         "verified behavior frontier intact. A safe frontier promotion clears the "
                         "buffer and starts a new behavior-policy batch. A protected incumbent "
                         "promotion requires a positive surrogate screen and two identical safe "
                         "complete from-line replays that rank above the incumbent. The initial "
                         "complete parent proof "
                         "is reused only after exact report, source, gate, save and model identity "
                         "checks; the final best policy receives a fresh complete from-line replay. "
                         "The training frontier is research-only and not export-eligible. This is not app "
                         "deployment, a new app version, or save migration."),
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
    parser.add_argument('--progress-shaping-per-meter', type=float, default=1.0)
    parser.add_argument('--gae-lambda', type=float, default=GAE_LAMBDA)
    parser.add_argument('--optimizer-rate-scale', type=float, default=1.0)
    parser.add_argument('--frontier-report')
    parser.add_argument('--frontier-report-sha256')
    parser.add_argument('--frontier-update', type=int)
    parser.add_argument('--frontier-fraction', type=float)
    args = parser.parse_args()
    run(args.tag, args.updates, args.progress_shaping_per_meter,
        args.frontier_report, args.frontier_report_sha256,
        args.frontier_update, args.frontier_fraction, args.gae_lambda,
        args.optimizer_rate_scale)
