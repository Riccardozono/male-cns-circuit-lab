"""Direct actor learning from line, without frozen motor cascade/prefix projection."""
import argparse
import json
import subprocess
import time
import torch
from neuronal_experiment_io_retry import ROOT, NODE, atomic_json, file_hash
from neural_ppo_parallel import Environments
from direct_neuronal_ppo_low_noise import Learner

BASE = ROOT/'.impeccable/review/neural-sacl'
PREFLIGHT = BASE/'direct-neuronal-policy-preflight-r6/verification.json'
GLOBAL_REFERENCE = BASE/'neuronal-coordinate-feedback8-first/independent-native.json'
KEYS = ['bestProgress', 'fitness', 'laps', 'reason', 'totalSimulationSeconds', 'lapTimes']

def global_better(e, reference):
    r = e['result']
    return (e['complete'] and not e['censored'] and not e['overlap']
            and not any(x in r['reason'] for x in ['urto', 'fuori pista', 'progresso non valido'])
            and r['fitness'] > reference['fitness']+1e-6 and r['bestProgress'] >= reference['bestProgress'] and r['laps'] >= reference['laps'])

def run(tag, updates):
    assert tag.replace('-', '').isalnum() and 1 <= updates <= 256
    out = BASE/tag
    out.mkdir(exist_ok=False)
    preflight = json.loads(PREFLIGHT.read_text())
    reference = json.loads(GLOBAL_REFERENCE.read_text())
    assert preflight['passed'] and reference['passed']
    for proof in [preflight, reference]:
        for f, digest in proof['sourceHashes'].items():
            assert file_hash(ROOT/f) == digest
    initial = preflight['metadata']['initialWeights']
    learner = Learner(initial, preflight['metadata']['dimension'])
    assert learner.weights() == initial
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-direct-policy-env-r6.cjs','work/neural-direct-policy-native.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ['work/train_direct_neuronal_ppo_r6_low_noise.py', 'work/direct_neuronal_ppo_low_noise.py', 'work/direct_neuronal_ppo.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    identity = {'format': 'male-cns-direct-from-line-ppo-r6-study-v1', 'appVersion': '5.6.0', 'seed': 171026, 'updates': updates, 'environments': 4, 'stepsPerEnvironment': 256, 'trainableMotorWeights': len(initial), 'dimension': learner.dimension, 'torchVersion': torch.__version__, 'torchThreads': 2, 'optimizerDevice': 'cpu', 'neuronalPassDevice': 'cuda-exact-v3', 'preflightSha256': file_hash(PREFLIGHT), 'globalReferenceSha256': file_hash(GLOBAL_REFERENCE), 'sourceHashes': {f: file_hash(ROOT/f) for f in sources}, 'sourceClosure': closure, 'hyperparameters': {'actorLearningRate': .0003, 'criticLearningRate': .001, 'gamma': 1, 'lambda': .98, 'clip': .2, 'epochs': 4, 'minibatch': 128, 'targetKL': .03, 'prefixProjection': False}, 'boundary': 'Warm-start learned sensory/gains and initial readout, not full coldstart. Direct154motorweights all freely reward-trained; no old driving cascade or teacher actions. All episodes begin at line on same Monza/GT3physics/raw R5 scores; explicit extra1800 terminal stall/slow cost for training only. A better803m initial driver is NOT sufficient: promotion requires stronger6599.861744 global native baseline.'}
    identity['controlFirstRolloutSha256'] = file_hash(BASE/'direct-neuronal-ppo64-from-line-r6/rollout-001.json')
    identity['initialExplorationStd'] = [.02, .02]
    identity['configurationVariant'] = 'initial-exploration-only-controlled-ablation'
    identity['trainingRewardRevision'] = 'direct-progress-6-terminal-stall-parity'
    atomic_json(out/'identity.json', identity)
    env = None
    events, completed, best_weights = [], [], None
    best_global = None
    best_evaluation = preflight['baseline']
    started = time.monotonic()
    def progress(phase, **extra):
        atomic_json(out/'state.json', {'phase': phase, 'recordedUpdates': len(events), 'actualTransitions': len(events)*1024, 'wallSeconds': time.monotonic()-started, 'pids': [e.process.pid for e in env.envs] if env else [], **extra})
    try:
        progress('initializing-four-actual-from-line-environments')
        env = Environments(ROOT/'work/neural-direct-policy-env-r6.cjs', {})
        atomic_json(out/'metadata.json', env.metadata)
        baseline = env.request('evaluate', weights=initial)
        assert baseline['complete'] and not baseline['censored'] and baseline['actionTraceSha256'] == preflight['baseline']['actionTraceSha256']
        assert all(baseline['result'][k] == preflight['baseline']['result'][k] for k in KEYS)
        atomic_json(out/'preflight.json', {'passed': True, 'baseline': baseline})
        env.all('reset')
        for update in range(1, updates+1):
            progress('collecting-actual-on-policy-transitions', update=update)
            before_weights, before_std = learner.weights(), learner.std()
            batches = env.all('rollout', weights=before_weights, std=before_std, steps=256)
            atomic_json(out/f'rollout-{update:03}.json', {'weights': before_weights, 'std': before_std, 'environments': batches})
            if update == 1:
                control = json.loads((BASE/'direct-neuronal-ppo64-from-line-r6/rollout-001.json').read_text())
                assert before_weights == control['weights'] and max(abs(x-.02) for x in before_std) < 1e-15
                max_error = 0.0
                for actual, previous in zip(batches, control['environments']):
                    assert len(actual['rows']) == len(previous['rows']) == 256
                    assert actual['rows'][0]['x'] == previous['rows'][0]['x']
                    for a, b in zip(actual['rows'], previous['rows']):
                        for axis in range(2):
                            za = (a['action'][axis]-a['mean'][axis])/before_std[axis]
                            zb = (b['action'][axis]-b['mean'][axis])/control['std'][axis]
                            max_error = max(max_error, abs(za-zb))
                assert max_error < 1e-12
                atomic_json(out/'matched-exploration-draws.json', {'passed': True, 'actualComparedTransitions': 1024, 'matchedNormalDraws': 2048, 'maxNormalizedDrawError': max_error, 'controlRolloutSha256': identity['controlFirstRolloutSha256'], 'physicalTrajectoriesExpectedToDiffer': True, 'boundary': 'Same initial policy, critic, random draws and R6 reward; initial Gaussian scales only changed. Old actions are comparison evidence, never teacher actions.'})
            completed.extend({'update': update, 'environment': k, 'result': e} for k, b in enumerate(batches) for e in b['episodes'])
            metrics = learner.update(batches)
            event = {'update': update, 'actualTransitions': update*1024, 'actualCompletedEpisodes': len(completed), 'metrics': metrics}
            if update % 8 == 0 or update == updates:
                event['evaluationCensorsUnfinishedEnvironments'] = [k for k, b in enumerate(batches) if not b['rows'][-1]['done']]
                evaluation = env.request('evaluate', weights=learner.weights())
                event['fullMeanEvaluation'] = evaluation
                if evaluation['complete'] and not evaluation['censored'] and evaluation['trainingFitness'] > best_evaluation['trainingFitness']:
                    best_evaluation = evaluation
                if global_better(evaluation, best_global['result'] if best_global else reference['result']):
                    best_global, best_weights = evaluation, learner.weights()
                env.all('reset')
            events.append(event)
            atomic_json(out/f'update-{update:03}.json', event)
            atomic_json(out/'training.json', {'events': events, 'completedEpisodes': completed, 'bestMeanEvaluation': best_evaluation, 'bestGlobalCandidate': best_global})
            atomic_json(out/'latest-policy.json', {'status': 'direct-actor-research-unverified', 'identity': identity, 'weights': learner.weights(), 'std': learner.std(), 'update': update})
            print(json.dumps({'update': update, 'actualTransitions': update*1024, 'completedEpisodes': len(completed), 'criticLoss': metrics['criticLoss'], 'evaluation': event.get('fullMeanEvaluation', {}).get('result')}), flush=True)
        proofs = []
        if best_global:
            progress('global-candidate-full-from-line-proofs')
            proofs = [env.request('evaluate', weights=best_weights) for _ in range(2)]
        eligible = bool(best_global and len(proofs) == 2 and all(global_better(e, reference['result']) and e['actionTraceSha256'] == best_global['actionTraceSha256'] for e in proofs))
        report = {'passed': True, 'identity': identity, 'actualTransitions': updates*1024, 'actualCompletedEpisodes': len(completed), 'baseline': baseline, 'bestMeanEvaluation': best_evaluation, 'bestGlobalCandidate': best_global, 'bestGlobalWeights': best_weights, 'fullProofs': proofs, 'eligibleForIndependentNativeProof': eligible, 'events': events, 'cudaByEnvironment': env.request('metadata_all'), 'promoted': False, 'wallSeconds': time.monotonic()-started}
        atomic_json(out/'report.json', report)
        progress('finished', eligibleForIndependentNativeProof=eligible)
        print(json.dumps({'finished': True, 'transitions': updates*1024, 'episodes': len(completed), 'eligible': eligible, 'bestMean': best_evaluation['result']}), flush=True)
    except BaseException as error:
        atomic_json(out/'failure.json', {'error': repr(error), 'recordedUpdates': len(events)})
        raise
    finally:
        if env:
            env.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', required=True)
    parser.add_argument('--updates', type=int, default=64)
    args = parser.parse_args()
    run(args.tag, args.updates)
