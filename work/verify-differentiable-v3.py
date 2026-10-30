"""Native forward equivalence and numerical recurrent-gradient preflight only."""
import json
import sys
from pathlib import Path
import torch
from differentiable_v3_reservoir import DifferentiableV3


def verify(data):
    torch.set_num_threads(2)
    model = DifferentiableV3(data['graph'], data['weights'])
    records = []
    for chunk in data['chunks']:
        sensors = torch.tensor([r['sensors'] for r in chunk['rows']], dtype=torch.float64)
        initial = torch.tensor(chunk['initialActivity'], dtype=torch.float64)
        result = model(sensors, initial)
        action_error = float((result['commands'].detach()-torch.tensor([r['commands'] for r in chunk['rows']], dtype=torch.float64)).abs().max())
        logit_error = float((result['logits'].detach()-torch.tensor([r['logits'] for r in chunk['rows']], dtype=torch.float64)).abs().max())
        state_error = float((result['states'][-1].detach()-torch.tensor(chunk['finalActivity'], dtype=torch.float64)).abs().max())
        assert max(action_error, logit_error, state_error) < 1e-10
        records.append({'startControl': chunk['startControl'], 'controls': len(chunk['rows']),
                        'maxCommandAbsoluteError': action_error, 'maxLogitAbsoluteError': logit_error,
                        'finalAllNeuronMaxAbsoluteError': state_error})
    chunk = data['chunks'][1]
    sensors = torch.tensor([r['sensors'] for r in chunk['rows']], dtype=torch.float64)
    initial = torch.tensor(chunk['initialActivity'], dtype=torch.float64)
    result = model(sensors, initial)
    objective = (result['logits']*torch.tensor([.37, -.19], dtype=torch.float64)).sum()
    objective.backward()
    gradient = model.weights.grad.detach()
    checks = []
    for native in data['nativeFiniteDifferences']:
        analytic = float(gradient[native['index']])
        error = abs(analytic-native['numeric'])
        tolerance = 2e-6+abs(native['numeric'])*.003
        assert error <= tolerance, (native, analytic, error, tolerance)
        checks.append({**native, 'analytic': analytic, 'absoluteError': error, 'tolerance': tolerance})
    blocks = [('sensoryScale', 0, 28), ('sensoryBias', 28, 56), ('recurrentGain', 56, data['graph']['readoutOffset']),
              ('motorReadoutAndBias', data['graph']['readoutOffset'], len(data['weights']))]
    gradient_norms = {name: float(gradient[a:b].norm()) for name, a, b in blocks}
    assert all(v > 1e-10 for v in gradient_norms.values())
    disabled = model(sensors[:2], initial, edges_enabled=False)
    assert torch.equal(disabled['commands'], torch.zeros_like(disabled['commands']))
    return {'passed': True, 'learningSucceeded': False, 'torchVersion': torch.__version__, 'device': 'cpu',
            'forward': records, 'nativeFiniteDifferenceChecks': checks, 'gradientBlockNorms': gradient_norms,
            'disabledEdgesProduceZeroCommands': True, 'gainCastDerivative': 'straight-through-float32-cast',
            'boundary': '32 controls in four actual fixed-sensor trajectory chunks and one numerical objective. No RL update, modified car action, trained model, reward improvement or full Torch-controlled physical episode is established. Recurrent gradients include the 28 sensor scales/biases, 16 shared gain groups, and original motor coefficients; anatomical edges remain fixed.'}


if __name__ == '__main__':
    source, target = map(Path, sys.argv[1:3])
    report = verify(json.loads(source.read_text(encoding='utf-8')))
    with target.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, allow_nan=False, indent=2)
    print(json.dumps(report))
