"""Count actual throttle trials in recorded strong-brake neural contexts.

These are correlated samples from different exploratory datasets, not learned
deterministic policies or a controlled measure of general driving success.
"""
import json
from pathlib import Path
from neuronal_experiment_io import ROOT, atomic_json, file_hash

base = ROOT/'.impeccable/review/learning-ml'
sources = [('independent-fine', base/'v3-recurrent-exploration-scale-20261024-01'),
           ('neural-late-ar1', base/'v3-neural-ar1-late-exploration-20261024-01')]
groups = []
for name, directory in sources:
    report = json.loads((directory/'report.json').read_text())
    assert report['passed']
    observed = []
    input_hashes = []
    for case in report['cases']:
        file = directory/case['file']
        assert file_hash(file) == case['sha256']
        e = json.loads(file.read_text())
        if name == 'independent-fine' and e['std'] != [.0015, .008]:
            continue
        rows = [r for c in e['chunks'] for r in c['rows']]
        selected = [r for r in rows if r['mean'][1] <= -.08]
        observed.extend(selected)
        input_hashes.append(case['sha256'])
    groups.append({'name': name, 'episodes': len(input_hashes), 'strongBrakeContextControls': len(observed),
                   'actualPositiveThrottleRequests': sum(r['commands'][1] > 0 for r in observed),
                   'maximumThrottleInStrongBrakeContext': max([r['commands'][1] for r in observed], default=0),
                   'inputHashes': input_hashes})
out = base/'v3-neural-ar1-action-coverage-20261024-01'
out.mkdir(exist_ok=False)
result = {'passed': True, 'learningSucceeded': False, 'groups': groups, 'sourceSha256': file_hash(Path(__file__)),
          'selection': 'Actually observed native mean longitudinal logit <= -0.08; commands are actual sampled physical inputs.',
          'boundary': 'Different exploration configurations and episode sets; AR1 samples are correlated. Counts establish action coverage in these recorded neural contexts, not improved deterministic learning, safe cornering or statistical independence.'}
atomic_json(out/'report.json', result)
print(json.dumps(result))
