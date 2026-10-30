"""Recover an interrupted experiment by exact actual replay, then continue.

Old records are comparison evidence, never action targets. Every old rollout
is independently generated again from the original RNG and learned policy.
The source directory is read-only; only the new child directory is written.
"""
import json
import time
from direct_neuronal_ppo_nonlinear import Learner
from neural_ppo_parallel import Environments
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash
from train_direct_neuronal_ppo_nonlinear import BASE, PREFLIGHT, GLOBAL_REFERENCE, global_better, KEYS

PARENT = BASE/'direct-neuronal-nonlinear64-r7-first'
OUT = BASE/'direct-neuronal-nonlinear64-r7-resumed'

def run():
    OUT.mkdir(exist_ok=False)
    original = json.loads((PARENT/'identity.json').read_text())
    training = json.loads((PARENT/'training.json').read_text())
    prefix = len(training['events'])
    assert 0 < prefix < original['updates']
    assert not (PARENT/'report.json').exists()
    for file, digest in {**original['sourceHashes'], **original['sourceClosure']}.items():
        assert file_hash(ROOT/file) == digest, file
    assert file_hash(PREFLIGHT) == original['preflightSha256']
    assert file_hash(GLOBAL_REFERENCE) == original['globalReferenceSha256']
    preflight, reference = [json.loads(f.read_text()) for f in [PREFLIGHT, GLOBAL_REFERENCE]]
    assert preflight['passed'] and reference['passed']
    for proof in [preflight, reference]:
        for file, digest in proof['sourceHashes'].items():
            assert file_hash(ROOT/file) == digest
    identity = {**original, 'sourceHashes': {**original['sourceHashes'], 'work/resume_direct_nonlinear_study.py': file_hash(__file__)},
                'recovery': {'parentIdentitySha256': file_hash(PARENT/'identity.json'), 'parentTrainingSha256': file_hash(PARENT/'training.json'),
                             'prefixUpdates': prefix, 'method': 'actual physics and RNG replay plus exact optimizer reconstruction'}}
    atomic_json(OUT/'identity.json', identity)
    learner = Learner(preflight['metadata']['initialWeights'], preflight['metadata']['dimension'])
    events, completed, locations, hashes = [], [], {}, {}
    best = preflight['baseline']
    best_global, best_weights = None, None
    started, env = time.monotonic(), None
    def progress(phase, **fields):
        atomic_json(OUT/'state.json', {'phase': phase, 'recordedUpdates': len(events), 'replayedPrefixUpdates': min(prefix,len(events)), 'newUpdates': max(0,len(events)-prefix), 'pids': [e.process.pid for e in env.envs] if env else [], 'wallSeconds': time.monotonic()-started, **fields})
    def record(name, value, old=False):
        file = (PARENT if old else OUT)/name
        if old:
            assert json.loads(file.read_text()) == value, name
        else:
            atomic_json(file, value)
        locations[name] = file.relative_to(ROOT).as_posix()
        hashes[name] = file_hash(file)
    try:
        progress('initializing-recovery')
        env = Environments(ROOT/'work/neural-direct-nonlinear-env.cjs', {})
        atomic_json(OUT/'metadata.json', env.metadata)
        baseline = env.request('evaluate', weights=learner.weights())
        assert baseline['actionTraceSha256'] == preflight['baseline']['actionTraceSha256']
        assert baseline['complete'] and not baseline['censored']
        assert all(baseline['result'][k] == preflight['baseline']['result'][k] for k in KEYS)
        atomic_json(OUT/'preflight.json', {'passed': True, 'baseline': baseline})
        env.all('reset')
        for update in range(1, original['updates']+1):
            replay = update <= prefix
            progress('replaying-recorded-physical-rollouts' if replay else 'collecting-new-transitions', update=update)
            w, std = learner.weights(), learner.std()
            batches = env.all('rollout', weights=w, std=std, steps=256)
            record(f'rollout-{update:03}.json', {'weights': w, 'std': std, 'environments': batches}, replay)
            completed.extend({'update': update, 'environment': k, 'result': e} for k,b in enumerate(batches) for e in b['episodes'])
            metrics = learner.update(batches)
            event = {'update': update, 'actualTransitions': update*1024, 'actualCompletedEpisodes': len(completed), 'metrics': metrics}
            if update % 8 == 0 or update == original['updates']:
                event['evaluationCensorsUnfinishedEnvironments'] = [k for k,b in enumerate(batches) if not b['rows'][-1]['done']]
                e = env.request('evaluate', weights=learner.weights())
                event['fullMeanEvaluation'] = e
                if e['complete'] and not e['censored'] and e['trainingFitness'] > best['trainingFitness']:
                    best = e
                if global_better(e, best_global['result'] if best_global else reference['result']):
                    best_global, best_weights = e, learner.weights()
                env.all('reset')
            record(f'update-{update:03}.json', event, replay)
            events.append(event)
            if update == prefix:
                assert events == training['events'] and completed == training['completedEpisodes']
                assert best == training['bestMeanEvaluation']
                atomic_json(OUT/'recovery.json', {'passed': True, 'actualReplayedTransitions': prefix*1024, 'exactOptimizerUpdates': prefix, 'recordHashes': dict(hashes), 'boundary': 'Same actual physical observations, sampled actions, rewards, terminals, RNG progression and numerical updates. Replay is not counted as new learning data.'})
            atomic_json(OUT/'latest-policy.json', {'status': 'nonlinear-private-research', 'identity': identity, 'weights': learner.weights(), 'std': learner.std(), 'update': update})
            print(json.dumps({'update': update, 'replayed': replay, 'newTransitions': max(0,update-prefix)*1024, 'completedEpisodes': len(completed), 'evaluation': event.get('fullMeanEvaluation',{}).get('result')}), flush=True)
        proofs = [env.request('evaluate', weights=best_weights) for _ in range(2)] if best_global else []
        eligible = bool(best_global and len(proofs)==2 and all(global_better(e,reference['result']) and e['actionTraceSha256']==best_global['actionTraceSha256'] for e in proofs))
        report = {'passed': True, 'identity': identity, 'actualTransitions': original['updates']*1024, 'actualCompletedEpisodes': len(completed), 'baseline': baseline, 'bestMeanEvaluation': best, 'bestGlobalCandidate': best_global, 'bestGlobalWeights': best_weights, 'fullProofs': proofs, 'eligibleForIndependentNativeProof': eligible, 'events': events, 'cudaByEnvironment': env.request('metadata_all'), 'promoted': False, 'wallSeconds': time.monotonic()-started, 'recordLocations': locations, 'recordHashes': hashes, 'newTransitionsAfterRecovery': (original['updates']-prefix)*1024, 'actualReplayedTransitions': prefix*1024}
        atomic_json(OUT/'report.json', report)
        progress('finished', eligible=eligible)
        print(json.dumps({'finished': True, 'uniqueTransitions': report['actualTransitions'], 'newTransitions': report['newTransitionsAfterRecovery'], 'episodes': len(completed), 'eligible': eligible}), flush=True)
    except BaseException as error:
        atomic_json(OUT/'failure.json', {'error': repr(error), 'recordedUpdates': len(events)})
        raise
    finally:
        if env:
            env.close()

if __name__ == '__main__':
    run()
