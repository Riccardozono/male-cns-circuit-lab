"""Validate the actually matched R6/R7 prefix before policy updates diverge."""
import json
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash

if __name__ == '__main__':
    base = ROOT/'.impeccable/review/neural-sacl'
    old = base/'direct-neuronal-ppo64-from-line-r6-low-noise'
    new = base/'direct-neuronal-ppo64-from-line-r7'
    assert not (new/'matched-controlled-prefix.json').exists()
    proofs = [json.loads((d/'verification.json').read_text()) for d in [old, new]]
    for d, v in zip([old, new], proofs):
        assert v['passed'] and v['reportSha256'] == file_hash(d/'report.json')
    matched, changed, first_divergence, hashes = 0, 0, None, {}
    for update in range(1, 65):
        name = f'rollout-{update:03}.json'
        for d, v in zip([old, new], proofs):
            assert file_hash(d/name) == v['recordHashes'][name]
        a, b = [json.loads((d/name).read_text()) for d in [old, new]]
        if a['weights'] != b['weights'] or a['std'] != b['std']:
            first_divergence = update
            break
        hashes[name] = {'r6': file_hash(old/name), 'r7': file_hash(new/name)}
        for older, newer in zip(a['environments'], b['environments']):
            assert len(older['rows']) == len(newer['rows']) == 256
            for x, y in zip(older['rows'], newer['rows']):
                for key in ['x', 'active', 'mean', 'action', 'done', 'next', 'rawReward']:
                    assert x[key] == y[key], key
                extra = y['trainingPenalty']-x['trainingPenalty']
                assert extra in [0, 500]
                assert abs((y['reward']-x['reward'])+extra/100) < 1e-12
                changed += int(extra != 0)
                matched += 1
    assert matched >= 1024 and changed > 0
    proof = {'passed': True, 'oldReportSha256': proofs[0]['reportSha256'], 'newReportSha256': proofs[1]['reportSha256'], 'matchedActualPhysicalTransitions': matched, 'changedTerminalRewardRows': changed, 'firstDifferentPolicyUpdate': first_divergence, 'recordHashes': hashes, 'verifierSha256': file_hash(__file__), 'boundary': 'Both runs physically sampled their own trajectories. Only the additional500terminalcost differs while policies remain identical. Does not prove better driving or global reward correctness.'}
    atomic_json(new/'matched-controlled-prefix.json', proof)
    print(json.dumps({k: v for k, v in proof.items() if k != 'recordHashes'}))
