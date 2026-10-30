"""Conditional Gaussian action probabilities at actually observed neural states.

Not a physical counterfactual, a teacher action, or proof of an eventual escape.
"""
import json
import math
from pathlib import Path
from neuronal_experiment_io import ROOT, atomic_json, file_hash

directory = ROOT/'.impeccable/review/learning-ml/v3-recurrent-terminal-projection-20261024-01'
source = directory/'report.json'
data = json.loads(source.read_text())
assert data['passed']
rows = []
for case in data['cases']:
    observation = case['lastMovingControl']  # Historical field name: last recorded control, possibly stopped.
    commands = observation['commands']
    mean = math.atanh(commands[1]-commands[2])
    rows.append({'id': case['id'], 'physicalSpeedMps': observation['speedMps'], 'actualCommands': commands,
                 'actualLongitudinalLogit': mean, 'probabilities': [
                     {'longitudinalStd': std, 'positiveThrottleProbabilityPerSampleAtFixedMean':
                      .5*math.erfc(-mean/(std*math.sqrt(2)))} for std in [.08, .016, .008]]})
result = {'format': 'v3-recurrent-exploration-barrier-v1', 'passed': True, 'learningSucceeded': False,
          'sourceReportSha256': file_hash(source), 'sourceSha256': file_hash(Path(__file__)), 'rows': rows,
          'boundary': 'Conditional probabilities for the Gaussian latent exploration actually used in the studies, holding one observed deterministic neural mean fixed. A positive throttle request is not a guarantee of physical acceleration, safe motion, cornering or learned escape. No future-state independence assumption or vehicle action is made.'}
atomic_json(directory/'exploration-barrier.json', result)
print(json.dumps(result))
