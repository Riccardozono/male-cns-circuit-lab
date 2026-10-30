"""Direct actor learning from line, without frozen motor cascade/prefix projection."""
import argparse
import json
import subprocess
import time
import torch
from neuronal_experiment_io_retry import ROOT, NODE, atomic_json, file_hash
from neural_ppo_parallel import Environments
from direct_neuronal_ppo_wholecredit import Learner

BASE = ROOT/'.impeccable/review/neural-sacl'
PREFLIGHT = BASE/'direct-neuronal-curriculum-preflight-r2b/verification.json'
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
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-direct-curriculum-env-r2.cjs','work/neural-direct-scaled-native.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ['work/train_direct_neuronal_ppo_curriculum_r2.py', 'work/direct_neuronal_ppo_scaled.py', 'work/direct_neuronal_ppo_calibrated.py', 'work/direct_neuronal_ppo_wholecredit.py', 'work/direct_neuronal_ppo.py', '.impeccable/review/neural-sacl/direct-critic-initial-return-calibration/fit.json', '.impeccable/review/neural-sacl/direct-critic-initial-return-calibration/physical-verification.json', 'work/direct_neuronal_ppo_nonlinear.py', 'work/prepare_direct_neuronal_scaler.py', 'work/neuronal_experiment_io_retry.py', 'work/neuronal_experiment_io.py', 'work/neural_ppo_parallel.py', 'work/train_neural_ppo_normalized_cuda.py']
    identity = {'format': 'male-cns-direct-curriculum-ppo-r7-study-v1', 'appVersion': '5.6.0', 'seed': 171026, 'updates': updates, 'environments': 4, 'stepsPerEnvironment': 256, 'trainableMotorWeights': len(initial), 'dimension': learner.dimension, 'torchVersion': torch.__version__, 'torchThreads': 2, 'optimizerDevice': 'cpu', 'neuronalPassDevice': 'cuda-exact-v3', 'preflightSha256': file_hash(PREFLIGHT), 'globalReferenceSha256': file_hash(GLOBAL_REFERENCE), 'sourceHashes': {f: file_hash(ROOT/f) for f in sources}, 'sourceClosure': closure, 'hyperparameters': {'actorLearningRate': .0003, 'criticLearningRate': .001, 'gamma': 1, 'lambda': 1, 'clip': .2, 'epochs': 4, 'minibatch': 128, 'targetKL': .03, 'prefixProjection': False}, 'boundary': 'Warm-start learned sensory/gains and initial readout, not full coldstart. Direct5276linear-and-nonlinear motorweights all freely reward-trained; no old driving cascade or teacher actions. Training resets mix .25 fromline with .75 actual historically reached neural/physics states; ALL evaluations begin at line on same Monza/GT3physics/raw R5 scores; explicit extra2300 terminal stall/slow cost for training only. New64hiddenunits are artificial motor decoder units, not anatomical neurons. Hidden inputs use fixed normalization fitted on1024actualtrainingobservations; linear inputs unchanged. Only critic output bias initialized from actual complete returns on three lanes with a fourth held out; actor and RNG unchanged. GAE lambda1 retains terminal residual across recorded segment until actual episode boundary; same256steps, not full unbounded Monte Carlo. A better803m initial driver is NOT sufficient: promotion requires stronger6599.861744 global native baseline.'}
    identity['trainingResetRevision'] = 'actual-first-curve-mixture-v1'
    identity['trainingFromLineProbability'] = .25
    identity['trainingRewardRevision'] = 'direct-progress-7-idle-worst-impact-parity'
    identity['initialExplorationStd'] = [.02, .02]
    identity['configurationVariant'] = 'actual-reached-state-reset-only-vs-wholecredit'
    identity['criticCalibrationWarmupTransitions'] = 4096
    identity['criticCalibrationAdditionalToPpoTransitions'] = True
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
        env = Environments(ROOT/'work/neural-direct-curriculum-env-r2.cjs', {})
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
                starts = [row['start'] for b in batches for k,row in enumerate(b['rows']) if k == 0 or b['rows'][k-1]['done']]
                assert all(len(row['x']) == learner.dimension for b in batches for row in b['rows'])
                atomic_json(out/'initial-curriculum-rollout.json', {'passed':True,'actualTransitions':1024,'starts':starts,'boundary':'Actual mixed training resets; initial driving policy unchanged, physical trajectories intentionally differ. No prefix distance counted as newly driven progress.'})
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
