"""Direct actor learning from line, without frozen motor cascade/prefix projection."""
import argparse
import json
import subprocess
import time
import torch
from neuronal_experiment_io_retry import ROOT, NODE, atomic_json, file_hash
from neural_ppo_parallel import Environments
from neuronal_compressed_records import atomic_record,read_record
from neural_prior_ppo import Learner

BASE = ROOT/'.impeccable/review/neural-sacl'
PREFLIGHT = BASE/'learned-prior-training-preflight/verification.json'
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
    closure = json.loads(subprocess.check_output([str(NODE), '-e', "process.stdout.write(JSON.stringify(require('./work/neural-research-source-identity.cjs').collect(['work/neural-prior-training-env.cjs','work/neural-prior-readout-scaled-native.cjs','outputs/data/connectome.json','outputs/data/circuits.json','.impeccable/runtime-node24/node.exe'])))"], cwd=ROOT, text=True, creationflags=subprocess.CREATE_NO_WINDOW))
    sources = ["work/train_neural_prior_ppo.py","work/neural_prior_ppo.py","work/direct_neuronal_ppo_nonlinear.py","work/direct_neuronal_ppo.py","work/neural_temporal_policy.py","work/prepare_neural_prior_training_data_r2.py","work/neuronal_compressed_records.py","work/neuronal_experiment_io_retry.py","work/neuronal_experiment_io.py","work/neural_ppo_parallel.py","work/train_neural_ppo_normalized_cuda.py",".impeccable/review/neural-sacl/learned-prior-initial-calibration-r2/fit.json",".impeccable/review/neural-sacl/learned-prior-initial-calibration-r2/physical-verification.json",".impeccable/review/neural-sacl/learned-prior-initial-calibration-r2/actual-rollouts.json"]
    identity = {'format': 'male-cns-pinned-prior-r8-ppo-study-v1', 'appVersion': '5.6.0', 'seed': 171026, 'updates': updates, 'environments': 4, 'stepsPerEnvironment': 256, 'trainableMotorWeights': len(initial), 'dimension': learner.dimension, 'torchVersion': torch.__version__, 'torchThreads': 2, 'optimizerDevice': 'cpu', 'neuronalPassDevice': 'cuda-exact-v3', 'preflightSha256': file_hash(PREFLIGHT), 'globalReferenceSha256': file_hash(GLOBAL_REFERENCE), 'sourceHashes': {f: file_hash(ROOT/f) for f in sources}, 'sourceClosure': closure, 'hyperparameters': {'actorLearningRate': .0003, 'criticLearningRate': .001, 'gamma': 1, 'lambda': 1, 'clip': .2, 'epochs': 4, 'minibatch': 128, 'targetKL': .03, 'prefixProjection': False}, 'boundary': 'Warmstart preserves the verified one-lap reward-trained neuronal policy as frozen hidden representation; all42566FINALreadout coefficients freely trainable on642neuronal/history/internal learned policy features. No route, clock, pose, teacher action labels or fixed prefix protection. Training resets to actually reached post-first-lap state6350; restored distance/lap not new learning. ALL evaluations begin at line. R8adds500 to crash/offroad/invalid terminal costs, retains2300stall adjustment; rawR5physics/scores unchanged. Own AR1exploration rho.9 with larger marginal std[.1,.7], correct conditional density. Not coldstart, fully biological learning or isolated single-variable ablation. Promotion still needs stronger6599.861744m global native reference.'}
    identity['trainingResetRevision'] = 'actual-prior-first-lap-6350'
    identity['trainingRewardRevision'] = 'prior-progress-8-common-failure-base'
    identity['initialExplorationStd'] = learner.std()
    identity['configurationVariant'] = 'pinned-learned-prior-free-final-readout-r8'
    identity['criticCalibrationWarmupTransitions'] = 2048
    identity['criticCalibrationAdditionalToPpoTransitions'] = True
    identity['rolloutEncoding'] = 'json-gzip-v1'
    identity['anatomicalReadoutCells'] = 251
    identity['temporalNoiseRho'] = .9
    identity['priorModelSha256'] = preflight['metadata']['priorModelSha256']
    identity['historicalFirstLapIsNotNewTraining'] = True
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
        env = Environments(ROOT/'work/neural-prior-training-env.cjs', {'normalized':True})
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
            atomic_record(out/f'rollout-{update:03}.json.gz', {'weights': before_weights, 'std': before_std, 'environments': batches})
            if update == 1:
                assert before_weights == initial
                assert all(row['start']['laps'] == 1 and row['start']['kind'] == 'actual-neuronal-prefix' for b in batches for row in b['rows'])
                atomic_json(out/'first-training-rollout.json',{'passed':True,'actualNewTransitions':1024,'sourceStarts':[b['rows'][0]['start'] for b in batches],'boundary':'Own samples after one physically reached historical lap; historical distance is not new progress. Model success only from full-line evaluations.'})
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
            atomic_json(out/'training-progress.json', {'recordedUpdates':len(events), 'actualCompletedEpisodes':len(completed), 'bestMeanEvaluation':best_evaluation, 'bestGlobalCandidate':best_global})
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
