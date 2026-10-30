"""Fresh deterministic PPO-update reconstruction, not another physical training run."""
import argparse
import json
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash
from direct_neuronal_ppo_scaled import Learner
from train_direct_neuronal_ppo import BASE, GLOBAL_REFERENCE, global_better

def verify(tag):
    assert tag.replace('-', '').isalnum()
    out = BASE/tag
    assert not (out/'verification.json').exists()
    report = json.loads((out/'report.json').read_text())
    identity = report['identity']
    assert report['passed'] and not report['promoted']
    r6 = identity['format'] == 'male-cns-direct-scaled-ppo-r7-study-v1'
    preflight_file = BASE/('direct-neuronal-scaled-preflight/verification.json' if r6 else 'direct-neuronal-policy-preflight-r2/verification.json')
    assert file_hash(preflight_file) == identity['preflightSha256']
    assert file_hash(GLOBAL_REFERENCE) == identity['globalReferenceSha256']
    for file, digest in {**identity['sourceHashes'], **identity['sourceClosure']}.items():
        assert file_hash(ROOT/file) == digest, file
    p = json.loads(preflight_file.read_text())
    reference = json.loads(GLOBAL_REFERENCE.read_text())
    assert p['passed'] and reference['passed']
    for proof in [p, reference]:
        for file, digest in proof['sourceHashes'].items():
            assert file_hash(ROOT/file) == digest
    metadata = json.loads((out/'metadata.json').read_text())
    assert len(metadata['parallelEnvironments']) == 4 and len({e['physicalPid'] for e in metadata['parallelEnvironments']}) == 4
    learner = Learner(p['metadata']['initialWeights'], p['metadata']['dimension'])
    initial = json.loads((out/'preflight.json').read_text())
    assert initial['passed'] and initial['baseline']['actionTraceSha256'] == p['baseline']['actionTraceSha256']
    completed, hashes = 0, {}
    best = p['baseline']
    best_global, best_weights = None, None
    for update in range(1, identity['updates']+1):
        file = out/f'rollout-{update:03}.json'
        hashes[file.name] = file_hash(file)
        rollout = json.loads(file.read_text())
        assert rollout['weights'] == learner.weights() and rollout['std'] == learner.std()
        batches = rollout['environments']
        assert len(batches) == 4 and all(len(b['rows']) == 256 for b in batches)
        for b in batches:
            assert sum(r['done'] for r in b['rows']) == len(b['episodes'])
            for row in b['rows']:
                assert len(row['x']) == len(row['next']) == learner.dimension
                if r6:
                    assert abs(row['reward']-(row['rawReward']-row['trainingPenalty']/100)) < 1e-12
            completed += len(b['episodes'])
        metrics = learner.update(batches)
        event_file = out/f'update-{update:03}.json'
        hashes[event_file.name] = file_hash(event_file)
        event = json.loads(event_file.read_text())
        assert event == report['events'][update-1]
        assert metrics == event['metrics'], update
        assert event['actualTransitions'] == update*1024 and event['actualCompletedEpisodes'] == completed
        if update % 8 == 0 or update == identity['updates']:
            assert event['evaluationCensorsUnfinishedEnvironments'] == [k for k, b in enumerate(batches) if not b['rows'][-1]['done']]
            e = event['fullMeanEvaluation']
            score = e['trainingFitness'] if r6 else e['result']['fitness']
            previous_score = best['trainingFitness'] if r6 else best['result']['fitness']
            if e['complete'] and not e['censored'] and score > previous_score:
                best = e
            if global_better(e, best_global['result'] if best_global else reference['result']):
                best_global, best_weights = e, learner.weights()
    assert completed == report['actualCompletedEpisodes']
    assert report['actualTransitions'] == identity['updates']*1024
    assert report['bestMeanEvaluation'] == best and report['bestGlobalCandidate'] == best_global and report['bestGlobalWeights'] == best_weights
    latest = json.loads((out/'latest-policy.json').read_text())
    assert latest['weights'] == learner.weights() and latest['std'] == learner.std()
    eligible = bool(best_global and len(report['fullProofs']) == 2 and all(global_better(e, reference['result']) and e['actionTraceSha256'] == best_global['actionTraceSha256'] for e in report['fullProofs']))
    assert report['eligibleForIndependentNativeProof'] == eligible
    for index, env in enumerate(report['cudaByEnvironment']):
        c = env['cuda']
        assert c['stats']['gpuCalls'] > 0 and c['stats']['cpuFallbacks'] == 0
        assert c['identity'] == metadata['parallelEnvironments'][index]['metadata']['cuda']['identity']
        for file, digest in c['identity']['sources'].items():
            assert file_hash(ROOT/file) == digest
        assert file_hash(c['identity']['driverPath']) == c['identity']['driverSha256']
    proof = {'passed': True, 'reportSha256': file_hash(out/'report.json'), 'verifierSha256': file_hash(__file__), 'recordHashes': hashes, 'actualRecordedTransitions': report['actualTransitions'], 'actualRecordedCompletedEpisodes': completed, 'reconstructedUpdates': identity['updates'], 'eligibleForIndependentNativeProof': eligible, 'promoted': False, 'boundary': 'Reconstructs each numeric optimizer/critic update and actual-record accounting. Not another physical drive or independent complete replay of all recorded transitions.'}
    atomic_json(out/'verification.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'recordHashes'}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('tag')
    verify(parser.parse_args().tag)
