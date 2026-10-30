"""One actual-episode recurrent policy-gradient update with native acceptance.

Readout-only and all202 directions use identical actual episodes/advantages.
Candidates pass fixed-history Gaussian KL and PPO clipped-surrogate screens,
then are judged by physical native episodes. No model is installed in the app.
"""
import hashlib
import argparse
import json
import subprocess
import time
from pathlib import Path
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from recurrent_v3_policy_gradient import make_advantages, gradient, candidates


def run(tag='v3-recurrent-reward-gradient-20261024-01', device='cpu', replay_audit=None, steps=(.01, .03, .1, .3, 1.)):
    if not tag.replace('-', '').isalnum():
        raise ValueError('Simple research tag required')
    out = ROOT/'.impeccable/review/learning-ml'/tag
    out.mkdir(exist_ok=False)
    started = time.monotonic()
    files = ['work/train_recurrent_v3_reward_probe.py', 'work/recurrent_v3_policy_gradient.py',
             'work/differentiable_v3_reservoir.py', 'work/neuronal_experiment_io.py',
             'work/recurrent-v3-reward-env.cjs', 'outputs/progress-save.js', 'package.json']
    closure_code = "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    source_hashes = json.loads(subprocess.check_output([str(NODE), '-e', closure_code], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    save = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
    save_hash = file_hash(save)
    if save_hash != '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3':
        raise ValueError('Preserve the verified original save')
    env = None
    episodes, scored = [], []

    def progress(phase, **extra):
        state = {'phase': phase, 'wallSeconds': time.monotonic()-started, 'episodes': len(episodes),
                 'environmentPid': env.process.pid if env else None, **extra}
        atomic_json(out/'progress.json', state)
        print('RECURRENT_REWARD '+json.dumps(state), flush=True)

    try:
        progress('initializing-native-environment')
        env = Pipe(ROOT/'work/recurrent-v3-reward-env.cjs')
        meta = env.metadata
        atomic_json(out/'metadata.private.json', meta)
        baseline = env.request('evaluate', weights=meta['genome']['policyWeights'])
        if any(baseline[k] != meta['expected'][k] for k in baseline):
            raise ValueError('Full native baseline differs')
        atomic_json(out/'baseline.json', baseline)
        settings = {'seeds': [20261024+104729*i for i in range(4)], 'signs': [1, -1],
                    'std': [.015, .08], 'chunkControls': 32, 'researchUnsafeTerminalCost': 2000,
                    'gamma': 1, 'valueBaselineRidge': .001, 'maxNativeHistoryKL': .01,
                    'candidateStepSizes': list(steps), 'rewardRevision': 'progress-3', 'gradientDevice': device}
        if device.startswith('cuda'):
            cuda_proof_file = ROOT/'.impeccable/review/learning-ml/v3-recurrent-cuda-preflight-20261024-01/report.json'
            cuda_proof = json.loads(cuda_proof_file.read_text())
            assert cuda_proof['passed'] and file_hash(ROOT/'work/differentiable_v3_reservoir.py') == cuda_proof['integrity']['sourceHashes']['work/differentiable_v3_reservoir.py']
            settings['cudaPreflightSha256'] = file_hash(cuda_proof_file)
        configurations = [{'seed': seed, 'sign': sign, 'std': settings['std']} for seed in settings['seeds'] for sign in settings['signs']]
        if replay_audit:
            audit_file = Path(replay_audit).resolve()
            if not audit_file.is_relative_to(ROOT):
                raise ValueError('Only scoped local research artifacts')
            audit = json.loads(audit_file.read_text())
            assert audit['passed'] and audit['parentSha256'] == meta['parentSha256']
            for row in audit['cases']:
                assert file_hash(audit_file.parent/row['file']) == row['sha256']
            configurations = [{k: row[k] for k in ['seed', 'sign', 'std']} for row in audit['cases']]
            settings.update({'seeds': sorted(set(c['seed'] for c in configurations)), 'std': None,
                             'stdByEpisode': [c['std'] for c in configurations], 'trainingDataOrigin': 'verified-physical-replay-of-existing-exploration-cases',
                             'sourceExplorationAuditSha256': file_hash(audit_file), 'newUniqueExplorationCases': 0})
        for index, configuration in enumerate(configurations):
            progress('collecting-complete-physical-episode', **configuration)
            episode = env.request('episode', configuration={**configuration,
                'chunkSize': settings['chunkControls'], 'safetyCost': settings['researchUnsafeTerminalCost']})
            if episode['result']['censored'] or not episode['chunks'][-1]['rows'][-1]['done']:
                raise ValueError('Terminal return requires a naturally completed episode')
            if replay_audit:
                expected = audit['cases'][index]
                if episode['actionTraceSha256'] != expected['actionTraceSha256'] or episode['result'] != expected['result']:
                    raise ValueError('Recorded exploration does not replay exactly')
            episodes.append(episode)
            atomic_json(out/f'episode-{len(episodes):02}.private.json', episode)
            progress('physical-episode-completed', result=episode['result'], trainingReward=episode['trainingReward'], controls=episode['controls'])
        advantages, advantage_metrics = make_advantages(episodes)
        atomic_json(out/'advantages.private.json', {'values': advantages, 'metrics': advantage_metrics})
        progress('computing-recurrent-reward-gradient', transitions=len(advantages))

        def chunk_progress(chunks, transitions, error):
            if chunks % 16 == 0:
                progress('computing-recurrent-reward-gradient', chunks=chunks, transitions=transitions, maxNativeMeanError=error)

        direction, gradient_metrics = gradient(meta, episodes, advantages, chunk_progress, device=device)
        atomic_json(out/'gradient.private.json', {'ascent': direction.tolist(), 'metrics': gradient_metrics})
        initial_score = env.request('rescore', weights=meta['genome']['policyWeights'], advantages=advantages)
        if initial_score['meanGaussianKL'] != 0:
            raise ValueError('Unchanged on-policy history does not reproduce native means')
        for candidate in candidates(meta, direction, steps):
            progress('screening-native-neural-history', candidate=candidate['id'])
            candidate['screen'] = env.request('rescore', weights=candidate['weights'], advantages=advantages)
            candidate['screenPassed'] = (candidate['screen']['meanGaussianKL'] <= settings['maxNativeHistoryKL'] and
                                        candidate['screen']['meanClippedSurrogate'] > initial_score['meanClippedSurrogate']+1e-10)
            if candidate['screenPassed']:
                progress('evaluating-full-physical-candidate', candidate=candidate['id'])
                candidate['outcome'] = env.request('evaluate', weights=candidate['weights'])
            scored.append(candidate)
            atomic_json(out/'candidates.private.json', scored)
            progress('candidate-completed', candidate=candidate['id'], screen=candidate['screen'], outcome=candidate.get('outcome'))
        safe = sorted([c for c in scored if c.get('outcome', {}).get('safe')], key=lambda c: (c['outcome']['laps'], c['outcome']['bestProgress']), reverse=True)
        improved = [c for c in safe if c['outcome']['bestProgress'] > baseline['bestProgress']+1 and c['outcome']['laps'] >= baseline['laps']]
        confirmations = []
        if improved:
            for _ in range(2):
                confirmations.append(env.request('evaluate', weights=improved[0]['weights']))
            if any(r != improved[0]['outcome'] for r in confirmations):
                raise ValueError('Independent native candidate replay differs')
        source_stable = all(file_hash(ROOT/f) == digest for f, digest in source_hashes.items())
        save_unchanged = file_hash(save) == save_hash
        if not source_stable or not save_unchanged:
            raise ValueError('Sources/original save changed')
        public = lambda c: {k: v for k, v in c.items() if k != 'weights'}
        report = {'format': 'v3-recurrent-reward-gradient-probe-v1', 'createdUnix': time.time(), 'appVersion': '5.6.0',
                  'passed': True, 'learningSucceeded': bool(improved and all(r['safe'] and r['laps'] >= 2 for r in confirmations)),
                  'singleStartImproved': bool(improved), 'parentSha256': meta['parentSha256'], 'baseline': baseline,
                  'settings': settings, 'actualStochasticEpisodes': len(episodes), 'actualTrainingControls': len(advantages),
                  'episodes': [{k: v for k, v in e.items() if k != 'chunks'} for e in episodes],
                  'advantageMetrics': advantage_metrics, 'gradientMetrics': gradient_metrics, 'initialHistoryScore': initial_score,
                  'candidates': [public(c) for c in scored], 'confirmations': confirmations,
                  'method': 'One Monte Carlo policy-gradient direction through the actual fixed V3 graph, truncated at32control chunks with actual native initial states; a neural-only ridge value baseline and independent-episode returns. Seeded Gaussian streams with antithetic signs provide complete physical episodes; settings identify newly sampled versus exactly replayed existing cases. A2000point unsafe-terminal research cost supplements native R3 rewards to reflect safe selection. Readout-only versus all202 directions share exactly the same data. Parameter scaling uses existing policy scales. Native whole-sensory-history KL and PPO clipped-surrogate screens precede full from-line physical evaluation; an exactly frozen adapter can reuse its recorded neural features.',
                  'boundary': 'Warm-start on one V3/Monza parent, one bounded gradient batch, not cold-start/general convergence or distributed app generations. No geometry, clock, lap, inherited progress or teacher action enters the motor policy. Truncated recurrent-state gradients and straight-through gain quantization are approximations. No new model installed or end-to-end speed guarantee; gradient device is explicitly recorded while native physical episodes remain CPU.',
                  'integrity': {'sourceHashes': source_hashes, 'sourceStable': source_stable, 'saveUnchanged': save_unchanged,
                                'saveSha256': save_hash}, 'wallSeconds': time.monotonic()-started}
        atomic_json(out/'report.json', report)
        if improved:
            best = improved[0]
            atomic_json(out/'best.private.json', {'format': 'private-recurrent-reward-candidate-v1',
                'genome': {**meta['genome'], 'policyWeights': best['weights']}, 'outcome': best['outcome'],
                'confirmations': confirmations, 'sourceReport': 'report.json'})
        for file in files[:5]:
            (out/Path(file).name).write_bytes((ROOT/file).read_bytes())
        progress('finished', passed=True, singleStartImproved=bool(improved), learningSucceeded=report['learningSucceeded'])
        print('RECURRENT_REWARD_RESULT '+json.dumps({'passed': True, 'singleStartImproved': bool(improved),
              'learningSucceeded': report['learningSucceeded'], 'baseline': baseline, 'trainingControls': len(advantages),
              'candidates': report['candidates'], 'report': str(out/'report.json'), 'sha256': file_hash(out/'report.json')}), flush=True)
    except BaseException as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'episodes': len(episodes), 'candidates': len(scored)})
        raise
    finally:
        if env:
            env.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', default='v3-recurrent-reward-gradient-20261024-01')
    parser.add_argument('--device', default='cpu', choices=['cpu', 'cuda:0'])
    parser.add_argument('--replay-audit')
    parser.add_argument('--steps', default='.01,.03,.1,.3,1')
    args = parser.parse_args()
    run(args.tag, args.device, args.replay_audit, tuple(float(x) for x in args.steps.split(',')))
