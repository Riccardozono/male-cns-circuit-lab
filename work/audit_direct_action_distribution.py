"""Measured action distribution of recorded actual R7 rollouts, no new drive."""
import json
import math
from neuronal_experiment_io_retry import ROOT, atomic_json, file_hash

if __name__ == '__main__':
    out = ROOT/'.impeccable/review/neural-sacl/direct-neuronal-ppo64-from-line-r7'
    target = out/'action-distribution-audit.json'
    assert not target.exists()
    report = json.loads((out/'report.json').read_text())
    verified = json.loads((out/'verification.json').read_text())
    assert verified['passed'] and verified['reportSha256'] == file_hash(out/'report.json')
    count, active, saturated = 0, 0, [0, 0]
    min_mean, max_mean = [math.inf]*2, [-math.inf]*2
    squared_delta, maximum_delta = [0., 0.], [0., 0.]
    for update in range(1, report['identity']['updates']+1):
        name = f'rollout-{update:03}.json'
        assert file_hash(out/name) == verified['recordHashes'][name]
        for batch in json.loads((out/name).read_text())['environments']:
            for row in batch['rows']:
                count += 1
                if not row['active']:
                    continue
                active += 1
                for j in range(2):
                    mu, action = row['mean'][j], row['action'][j]
                    min_mean[j] = min(min_mean[j], mu)
                    max_mean[j] = max(max_mean[j], mu)
                    saturated[j] += int(abs(math.tanh(mu)) > .99)
                    delta = math.tanh(action)-math.tanh(mu)
                    squared_delta[j] += delta*delta
                    maximum_delta[j] = max(maximum_delta[j], abs(delta))
    proof = {'passed': True, 'reportSha256': verified['reportSha256'], 'scriptSha256': file_hash(__file__), 'actualRecordedTransitions': count, 'activeNeuralTransitions': active, 'minLatentMean': min_mean, 'maxLatentMean': max_mean, 'meanCommandAbsAbove099': saturated, 'observedNoiseCommandDeltaRMS': [math.sqrt(v/active) for v in squared_delta], 'maxObservedNoiseCommandDelta': maximum_delta, 'boundary': 'Empirical statistics from actual on-policy samples; .99 is an explicit diagnostic threshold, not a physical/safety limit. Does not prove sufficient exploration, policy optimality or all-state behavior.'}
    atomic_json(target, proof)
    print(json.dumps(proof))
