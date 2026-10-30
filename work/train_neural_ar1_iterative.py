"""Iterative private RL with real neural-state variance and exact AR1 likelihoods.

Not an installed controller, a scripted route or a guarantee of two laps. Current
research policies may be unsafe; the separately retained best must be safe.
"""
import argparse
import json
import subprocess
import time
from pathlib import Path
import numpy as np
from neuronal_experiment_io import ROOT, NODE, Pipe, atomic_json, file_hash
from recurrent_v3_policy_gradient import make_advantages, gradient, natural_direction


def run(tag, updates, device='cpu', resume=None):
    if not tag.replace('-', '').isalnum() or not 1 <= updates <= 32:
        raise ValueError('Bounded private study required')
    out = ROOT/'.impeccable/review/learning-ml'/tag
    out.mkdir(exist_ok=False)
    config_file = ROOT/'.impeccable/review/learning-ml/v3-neural-exploration-late-calibration-20261024-01/config.private.json'
    config = json.loads(config_file.read_text())
    files = ['work/train_neural_ar1_iterative.py', 'work/recurrent_v3_policy_gradient.py', 'work/neural_exploration_ar1.py',
             'work/differentiable_v3_reservoir.py', 'work/neuronal_experiment_io.py', 'work/recurrent-v3-reward-env.cjs',
             'outputs/progress-save.js', 'package.json', str(config_file.relative_to(ROOT)).replace('\\', '/')]
    closure = "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect("+json.dumps(files)+")))"
    hashes = json.loads(subprocess.check_output([str(NODE), '-e', closure], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    save_file = Path('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')
    save_hash = file_hash(save_file)
    assert save_hash == '29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'
    env = None; events = []; start_update = 0; started = time.monotonic()

    def progress(phase, **extra):
        record = {'phase': phase, 'completedUpdates': len(events), 'totalCompletedUpdates': start_update+len(events), 'wallSeconds': time.monotonic()-started,
                  'environmentPid': env.process.pid if env else None, **extra}
        atomic_json(out/'progress.json', record)
        print('AR1_TRAIN '+json.dumps(record), flush=True)

    try:
        env = Pipe(ROOT/'work/recurrent-v3-reward-env.cjs')
        meta = env.metadata
        atomic_json(out/'metadata.private.json', meta)
        current = meta['genome']['policyWeights'][:]
        baseline = env.request('evaluate', weights=current, configuration={'maxTicks': 0})
        assert baseline == {k: meta['expected'][k] for k in baseline}
        best = {'weights': current[:], 'outcome': baseline, 'source': 'original-verified-parent'}
        settings = {'updatesRequested': updates, 'episodesPerUpdate': 8, 'chunkControls': 32, 'device': device,
                    'gaeLambda': .95, 'gamma': 1, 'researchUnsafeTerminalCost': 2000, 'fisherDamping': .1,
                    'steps': [.001, .003, .01, .03, .1], 'maximumNativeConditionalKL': .01,
                    'minimumResearchPolicyProgressFraction': .95, 'maxSimulatedTicks': None, 'exploration': config}
        if resume:
            checkpoint_file = Path(resume).resolve()
            if not checkpoint_file.is_relative_to(ROOT):
                raise ValueError('Only scoped private checkpoints may be resumed')
            checkpoint = json.loads(checkpoint_file.read_text())
            if checkpoint['format'] != 'private-v3-ar1-rl-checkpoint-v1' or checkpoint['rootParentSha256'] != meta['parentSha256']:
                raise ValueError('Research checkpoint identity mismatch')
            if checkpoint['settings']['exploration'] != config or checkpoint['sourceHashes'] != hashes:
                raise ValueError('Source/exploration changed: no silent checkpoint migration')
            current = checkpoint['genome']['policyWeights'][:]
            best = {'weights': checkpoint['bestSafeGenome']['policyWeights'][:], 'outcome': checkpoint['bestSafeOutcome'], 'source': checkpoint['bestSource']}
            start_update = checkpoint['nextUpdate']
            if env.request('evaluate', weights=best['weights'], configuration={'maxTicks': 0}) != best['outcome']:
                raise ValueError('Checkpoint champion does not replay exactly')
        atomic_json(out/'identity.json', {'settings': settings, 'sourceHashes': hashes, 'parentSha256': meta['parentSha256'], 'baseline': baseline})
        for file in files:
            if file.startswith('work/'):
                (out/Path(file).name).write_bytes((ROOT/file).read_bytes())
        for update in range(start_update, start_update+updates):
            env.request('clear')
            episodes = []
            for index in range(4):
                seed = 20261024+update*1000003+index*104729
                for sign in [1, -1]:
                    progress('actual-physical-episode', update=update+1, seed=seed, sign=sign)
                    episode = env.request('episode', configuration={'weights': current, 'seed': seed, 'sign': sign,
                        'exploration': config, 'safetyCost': settings['researchUnsafeTerminalCost'], 'chunkSize': settings['chunkControls'], 'maxTicks': 0})
                    if episode['result']['censored']:
                        raise ValueError('No censored episode may be a learning terminal')
                    episodes.append(episode)
                    atomic_json(out/f'update-{update+1:02}-episode-{len(episodes):02}.private.json', episode)
                    progress('episode-finished', update=update+1, episode=len(episodes), result=episode['result'], trainingReward=episode['trainingReward'])
            advantages, advantage_metrics = make_advantages(episodes, gae_lambda=settings['gaeLambda'])
            actor_meta = {**meta, 'genome': {**meta['genome'], 'policyWeights': current}}

            def chunk_progress(chunks, transitions, error):
                if chunks % 32 == 0:
                    progress('cuda-recurrent-gradient', update=update+1, chunks=chunks, transitions=transitions, maximumNativeMeanError=error)

            direction, metrics = gradient(actor_meta, episodes, advantages, chunk_progress, device=device, estimate_fisher=True)
            fisher = metrics.pop('chunkEmpiricalFisher')
            delta, natural_metrics = natural_direction(actor_meta, direction, fisher, settings['fisherDamping'])
            atomic_json(out/f'update-{update+1:02}-gradient.private.json', {'gradient': direction.tolist(), 'fisher': fisher,
                'naturalDirection': delta.tolist(), 'metrics': metrics, 'naturalMetrics': natural_metrics})
            initial = env.request('rescore', weights=current, advantages=advantages)
            assert initial['meanGaussianKL'] == 0
            candidates = []
            for step in settings['steps']:
                weights = np.clip(np.asarray(current)+step*delta, -8, 8).tolist()
                progress('native-history-screen', update=update+1, step=step)
                screen = env.request('rescore', weights=weights, advantages=advantages)
                candidate = {'step': step, 'weights': weights, 'screen': screen}
                if screen['meanGaussianKL'] <= settings['maximumNativeConditionalKL'] and screen['meanClippedSurrogate'] > initial['meanClippedSurrogate']+1e-10:
                    candidate['outcome'] = env.request('evaluate', weights=weights, configuration={'maxTicks': 0})
                    if candidate['outcome']['censored']:
                        raise ValueError('Full evaluation cannot fabricate terminal success')
                    r = candidate['outcome']
                    if r['safe'] and (r['laps'], r['bestProgress']) > (best['outcome']['laps'], best['outcome']['bestProgress']):
                        best = {'weights': weights[:], 'outcome': r, 'source': f'update{update+1}:step{step}'}
                candidates.append(candidate)
                progress('candidate-finished', update=update+1, step=step, screen=screen, outcome=candidate.get('outcome'))
            # Research may temporarily use a near-frontier unsafe mean policy;
            # it never overwrites the separately retained safe champion.
            eligible = [c for c in candidates if c.get('outcome') and c['outcome']['bestProgress'] >= baseline['bestProgress']*settings['minimumResearchPolicyProgressFraction']]
            accepted = max(eligible, key=lambda c: c['screen']['meanClippedSurrogate']) if eligible else None
            if accepted:
                current = accepted['weights'][:]
            event = {'update': update+1, 'transitions': len(advantages), 'advantageMetrics': advantage_metrics, 'gradientMetrics': metrics,
                     'naturalMetrics': natural_metrics, 'episodes': [{k: e[k] for k in ['seed','sign','result','controls','trainingReward','actionTraceSha256']} for e in episodes],
                     'candidates': candidates, 'acceptedStep': accepted['step'] if accepted else None,
                     'acceptedPolicySafe': accepted['outcome']['safe'] if accepted else None, 'bestSafe': best['outcome']}
            events.append(event)
            atomic_json(out/f'update-{update+1:02}.json', event)
            atomic_json(out/'checkpoint.private.json', {'format': 'private-v3-ar1-rl-checkpoint-v1', 'nextUpdate': update+1,
                'genome': {**meta['genome'], 'policyWeights': current}, 'bestSafeGenome': {**meta['genome'], 'policyWeights': best['weights']},
                'bestSafeOutcome': best['outcome'], 'bestSource': best['source'], 'settings': settings, 'sourceHashes': hashes,
                'rootParentSha256': meta['parentSha256'],
                'seedRule': '20261024 + updateZeroBased*1000003 + lane*104729; paired signs +1/-1',
                'boundary': 'Private RL checkpoint, not a normal app save. Current research genome may be unsafe. Every next episode starts from zero body/brain at the line.'})
            progress('update-finished', update=update+1, acceptedStep=event['acceptedStep'], acceptedSafe=event['acceptedPolicySafe'], bestSafe=best['outcome'])
            if best['outcome']['safe'] and best['outcome']['laps'] >= 2:
                break
        proofs = [env.request('evaluate', weights=best['weights'], configuration={'maxTicks': 0}) for _ in range(2)]
        assert all(r == best['outcome'] for r in proofs)
        assert file_hash(save_file) == save_hash and all(file_hash(ROOT/f) == digest for f, digest in hashes.items())
        report = {'format': 'v3-neural-ar1-iterative-rl-v1', 'passed': True, 'learningSucceeded': best['outcome']['safe'] and best['outcome']['laps'] >= 2,
                  'singleStartImproved': best['outcome']['bestProgress'] > baseline['bestProgress']+1,
                  'baseline': baseline, 'settings': settings, 'updatesCompleted': len(events), 'startingUpdateIndex': start_update,
                  'trainingControls': sum(e['transitions'] for e in events),
                  'bestSafe': best, 'independentNativeProofs': proofs, 'events': events,
                  'sourceHashes': hashes, 'originalSaveSha256': save_hash, 'wallSeconds': time.monotonic()-started,
                  'boundary': 'Warm-start V3/Monza, fixed official topology,202learned parameters. Neural-only variance contrast and AR1 random-action history; no runtime route/time/lap or teacher actions. Conditional likelihoods include time correlation and variance changes. Chunk Fisher and truncated recurrent gradients are approximations, not exact TRPO. A near-frontier unsafe research policy may be accepted for future sampling while the safe champion remains separate. No new app/version/release or save compatibility claim.'}
        atomic_json(out/'report.json', report)
        progress('finished', passed=True, learningSucceeded=report['learningSucceeded'], bestSafe=best['outcome'], report=str(out/'report.json'))
    except BaseException as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'updatesCompleted': len(events)})
        raise
    finally:
        if env:
            env.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    parser.add_argument('--updates', type=int, default=4)
    parser.add_argument('--device', choices=['cpu', 'cuda:0'], default='cpu')
    parser.add_argument('--resume')
    args = parser.parse_args()
    run(args.tag, args.updates, args.device, args.resume)
