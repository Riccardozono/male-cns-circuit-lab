"""Independently reconcile PPO archives, paired seeds and native actor scores.

This is an integrity audit, not another physical replay. It permits a genuine
promotion or failure and recomputes the decision from the recorded evidence.
"""
import collections
import gzip
import json
import statistics
from pathlib import Path

import torch

from neuronal_experiment_io import ROOT, file_hash
from statehead_causal_gae_actor_76 import advantages_causal
from statehead_reward_actor import StateheadActor

BASE = ROOT / '.impeccable/review/learning-ml'
RUN = BASE / 'statehead-moving-pace-causalcritic-16ep-gae1-distance5-ppo-4up-20261026-84'
CONTROL = BASE / 'statehead-frontier-causalcritic-16ep-gae1-distance5-ppo-4up-20261026-79'
PREFLIGHT = BASE / 'statehead-moving-pace-preflight-20261026-84/report.json'
SAVE = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
SAVE_SHA = '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
UNSAFE = {'urto', 'fuori pista', 'progresso non valido'}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def safe(result):
    return result['complete'] and result['reason'] not in UNSAFE


def rank(result):
    return result['laps'], result['bestProgress'], result['fitness']


def main():
    target = RUN / 'verification.json'
    if target.exists() or file_hash(SAVE) != SAVE_SHA:
        raise RuntimeError('Existing verification or original save identity mismatch')
    report, control, preflight = read(RUN / 'report.json'), read(CONTROL / 'report.json'), read(PREFLIGHT)
    if (not report['passed'] or report['approvedForApp'] or report['updatesCompleted'] != 4
            or report['episodesCompleted'] != 64 or report['settings']['episodesPerUpdate'] != 16
            or report['movingPacePreflightSha256'] != file_hash(PREFLIGHT)
            or not preflight['passed'] or report['baseline'] != preflight['results']['movingPace']['protected']['result']
            or report['best']['result'] != report['finalFreshReplay']):
        raise RuntimeError('Report, protected baseline or preflight identity mismatch')
    for name, digest in report['sourceHashes'].items():
        if file_hash(ROOT / name) != digest:
            raise RuntimeError('Source changed since training: ' + name)
    gpu = report['cuda']
    if (gpu['gpuCalls'] <= 0 or gpu['gpuCalls'] != gpu['calls'] or gpu['cpuFallbacks'] != 0
            or gpu['device']['name'] != 'NVIDIA GeForce RTX 4060'):
        raise RuntimeError('CUDA accounting does not identify the requested GPU')
    if report['learningSucceeded'] != (safe(report['finalFreshReplay']) and report['finalFreshReplay']['laps'] >= 2):
        raise RuntimeError('Final lap success flag does not match the observed physical result')
    if report['physicalImprovementOverProtectedParent'] != (safe(report['finalFreshReplay']) and
                                                             rank(report['finalFreshReplay']) > rank(report['baseline'])):
        raise RuntimeError('Protected-policy improvement flag does not match the observed result')

    archives, all_episodes, buffer, final_buffer, matched, first_update = {}, [], [], None, 0, []
    old_events = {e['update']: e for e in control['events']}
    for event in report['events']:
        update = event['update']
        if event != read(RUN / f'update-{update:02}.json') or len(event['episodeSummaries']) != 16:
            raise RuntimeError('Update file or episode count mismatch')
        old_by_seed = {(e['seed'], e['sign']): e for e in old_events[update]['episodeSummaries']}
        for summary in event['episodeSummaries']:
            archive = RUN / summary['privateArchiveFile']
            if file_hash(archive) != summary['privateArchiveSha256']:
                raise RuntimeError('Archive hash mismatch: ' + archive.name)
            with gzip.open(archive, 'rt', encoding='utf-8') as stream:
                episode = json.load(stream)
            if (any(episode[k] != summary[k] for k in ('seed', 'sign', 'traceSha256', 'result', 'trainingReward'))
                    or not episode['fullFromLine'] or episode['gateFloor'] != 0
                    or episode['controls'] != len(episode['rows'])):
                raise RuntimeError('Archive metadata does not match its manifest')
            if abs(sum(row['rewardNative'] for row in episode['rows']) - episode['nativeRewardAfterReset']) > 1e-6:
                raise RuntimeError('Native reward ledger mismatch')
            if abs(sum(row['reward'] for row in episode['rows']) - episode['trainingReward']) > 1e-6:
                raise RuntimeError('PPO reward ledger mismatch')
            if abs(sum(row['rewardProgressBonus'] for row in episode['rows']) - episode['progressShapingBonus']) > 1e-6:
                raise RuntimeError('Progress shaping ledger mismatch')
            old = old_by_seed[(summary['seed'], summary['sign'])]
            matched += int(all(summary[k] == old[k] for k in ('traceSha256', 'result', 'trainingReward')))
            if update == 1:
                old_path = CONTROL / old['privateArchiveFile']
                if file_hash(old_path) != old['privateArchiveSha256']:
                    raise RuntimeError('Matched first-update control archive mismatch')
                with gzip.open(old_path, 'rt', encoding='utf-8') as stream:
                    old_episode = json.load(stream)
                if (episode['behaviorWeights'] != old_episode['behaviorWeights'] or
                        episode['exploration'] != old_episode['exploration']):
                    raise RuntimeError('First-update comparison does not use the same behavior policy')
                first_update.append({'seed': summary['seed'], 'sign': summary['sign'],
                                     'sameTrace': summary['traceSha256'] == old['traceSha256'],
                                     'controlProgress': old['result']['bestProgress'],
                                     'movingProgress': summary['result']['bestProgress'],
                                     'controlReason': old['result']['reason'],
                                     'movingReason': summary['result']['reason']})
            for row in episode['rows']:
                vector = row.pop('neuralInputVector', None)
                if not isinstance(vector, list) or len(vector) != 516:
                    raise RuntimeError('Archived real neural input is missing')
            archives[archive.name] = summary['privateArchiveSha256']
            all_episodes.append(episode)
            buffer.append(episode)
        if event['episodes'] != len(buffer) or event['controls'] != sum(e['controls'] for e in buffer):
            raise RuntimeError('Behavior-policy buffer size does not match update')
        if update == 4:
            final_buffer = buffer[:]
        eligible = []
        for candidate in event['candidates']:
            if not candidate.get('surrogateEligible'):
                if candidate.get('fullFromLineProofs'):
                    raise RuntimeError('Unexpected physical proofs for an unscreened candidate')
                continue
            proofs = candidate.get('fullFromLineProofs', [])
            if len(proofs) != 2 or proofs[0] != proofs[1] or candidate['fullFromLineResult'] != proofs[0]:
                raise RuntimeError('Candidate did not have two identical full physical replays')
            result = proofs[0]
            physical = safe(result) and rank(result) > rank(event['incumbentFullBefore'])
            frontier = safe(result) and result['bestProgress'] > (event['currentFullBefore']['bestProgress'] +
                        max(10.0, event['currentFullBefore']['bestProgress'] * .01))
            if candidate['safePhysicalImprovement'] != physical or candidate['safeFrontierImprovement'] != frontier:
                raise RuntimeError('Physical candidate promotion flags do not match the recorded policy')
            if physical or frontier:
                eligible.append(candidate)
        accepted = max(eligible, key=lambda c: (bool(c['safePhysicalImprovement']),
                       c['fullFromLineResult']['bestProgress'], c['screen']['meanClippedSurrogate'])) if eligible else None
        if event['acceptedFraction'] != (accepted['fraction'] if accepted else None):
            raise RuntimeError('Recorded acceptance disagrees with measured candidate outcomes')
        if accepted:
            if event['acceptedResult'] != accepted['fullFromLineResult']:
                raise RuntimeError('Accepted physical result mismatch')
            buffer = []

    if len(archives) != 64 or sum(e['controls'] for e in all_episodes) != report['trainingControls']:
        raise RuntimeError('Training archives or control counts incomplete')
    groups = collections.defaultdict(list)
    for e in all_episodes:
        groups[e['seed']].append(e['sign'])
    if len(groups) != 32 or any(sorted(signs) != [-1, 1] for signs in groups.values()):
        raise RuntimeError('Expected 32 distinct antithetic seed pairs')
    if final_buffer is None:
        raise RuntimeError('Final causal-critic buffer missing')
    advantages, critic = advantages_causal(final_buffer, gamma=.999, gae_lambda=1.)
    recorded = report['events'][-1]['advantageMetrics']
    if abs(critic['valueMse']-recorded['valueMse']) > 1e-8 or abs(critic['valueR2']-recorded['valueR2']) > 1e-10:
        raise RuntimeError('Final critic cannot be reconstructed from archived episodes')
    metadata = read(RUN / 'metadata.private.json')
    actor = StateheadActor(metadata, final_buffer, final_buffer[0]['behaviorWeights'],
                           final_buffer[0]['exploration'], device='cpu')
    _, initial_kl = actor.objective(advantages)
    if abs(float(initial_kl.detach())) > 1e-10:
        raise RuntimeError('Reconstructed behavior policy does not match the sampler')
    last = next(c for c in report['events'][-1]['candidates'] if c['fraction'] == 1.)
    with torch.no_grad():
        actor.motor.copy_(actor.tensor(last['weights']))
        actor.variance.copy_(actor.tensor(last['exploration']['weights']))
        score, kl = actor.objective(advantages)
    score_error = abs(float(score) - last['screen']['meanClippedSurrogate'])
    kl_error = abs(float(kl) - last['screen']['meanGaussianKL'])
    if score_error > 1e-8 or kl_error > 1e-8 or file_hash(SAVE) != SAVE_SHA:
        raise RuntimeError('Actor score, KL or original save identity mismatch')

    snapshots = {}
    for source, name in [(ROOT/'work/train_statehead_causal_ppo_84.py', 'trainer-source.py'),
                         (ROOT/'work/statehead-moving-pace-ppo-env-84.cjs', 'environment-adapter.cjs'),
                         (ROOT/'work/statehead_causal_gae_actor_76.py', 'critic-source.py'),
                         (Path(__file__), 'verifier-source.py')]:
        dest = RUN / name
        with dest.open('xb') as stream:
            stream.write(source.read_bytes())
        if file_hash(source) != file_hash(dest):
            raise RuntimeError('Source snapshot mismatch')
        snapshots[name] = file_hash(dest)
    stats = {'episodes': len(all_episodes), 'safe': sum(e['safe'] for e in all_episodes),
             'laps': sum(e['result']['laps'] for e in all_episodes),
             'meanProgress': statistics.mean(e['result']['bestProgress'] for e in all_episodes),
             'medianProgress': statistics.median(e['result']['bestProgress'] for e in all_episodes),
             'maxProgress': max(e['result']['bestProgress'] for e in all_episodes),
             'reasons': dict(collections.Counter(e['result']['reason'] for e in all_episodes))}
    output = {'passed': True, 'learningSucceeded': report['learningSucceeded'], 'approvedForApp': False,
              'reportSha256': file_hash(RUN/'report.json'), 'controlReportSha256': file_hash(CONTROL/'report.json'),
              'preflightSha256': file_hash(PREFLIGHT), 'originalSaveSha256': file_hash(SAVE),
              'sourceCount': len(report['sourceHashes']), 'archiveCount': len(archives), 'pairedSeedGroups': len(groups),
              'matchedOldEpisodesAcrossAllUpdates': matched, 'firstUpdatePairedSamePolicy': first_update,
              'finalBufferEpisodes': len(final_buffer), 'finalCriticMse': critic['valueMse'], 'finalCriticR2': critic['valueR2'],
              'initialPolicyKL': float(initial_kl.detach()), 'candidateScoreError': score_error, 'candidateKLError': kl_error,
              'gpuCalls': gpu['gpuCalls'], 'cpuFallbacks': gpu['cpuFallbacks'],
              'slowPaceDeferralsDuringTrainingAndEvaluations': gpu['slowPaceDeferrals'], 'episodes': stats,
              'sourceSnapshots': snapshots,
              'boundary': 'Reconstructs integrity, reward ledgers, matched seeds, critic and actor scores; '
                          'not a fresh physical replay, evidence for all circuits, or proof of convergence.'}
    with target.open('x', encoding='utf-8') as stream:
        json.dump(output, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print('MOVING_PACE_PPO_VERIFICATION ' + json.dumps({'verification': str(target),
          'sha256': file_hash(target), 'passed': True, 'episodes': stats,
          'matchedOldEpisodes': matched, 'slowPaceDeferrals': gpu['slowPaceDeferrals'],
          'learningSucceeded': report['learningSucceeded']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    torch.set_num_threads(2)
    main()
