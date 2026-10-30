"""Research-only motor coefficients fitted to actual neuronal observations."""
import copy
import json
import sys
from pathlib import Path
import numpy as np


def direction(prefix, target, ridge):
    """Minimise prefix response energy with unit target and zero mean response."""
    prefix = np.asarray(prefix, dtype=np.float64)
    target = np.asarray(target, dtype=np.float64)
    mean = prefix.mean(axis=0)
    if np.linalg.norm(target - mean) < 1e-10:
        raise ValueError("Target is indistinguishable from the retained mean")
    gram = prefix.T @ prefix / len(prefix) + ridge * np.eye(prefix.shape[1])
    constraints = np.stack([target, mean])
    inverse = np.linalg.solve(gram, constraints.T)
    small = constraints @ inverse
    if np.linalg.cond(small) > 1e13:
        raise ValueError("Dependent neuronal constraints")
    result = inverse @ np.linalg.solve(small, np.array([1.0, 0.0]))
    if not np.all(np.isfinite(result)) or np.max(np.abs(constraints @ result - [1.0, 0.0])) > 1e-6:
        raise ValueError("Constraint residual too large")
    return result


def generate(data):
    rows = data["observations"]
    features = np.asarray([r["features"] for r in rows], dtype=np.float64)
    n = features.shape[1]
    design = np.column_stack([features / np.sqrt(n), np.ones(len(features))])
    progress = np.asarray([r["progressM"] for r in rows])
    parent = np.asarray(data["genome"]["policyWeights"], dtype=np.float64)
    off = data["readoutOffset"]
    indices = [np.r_[np.arange(off, off + n * 2, 2), len(parent) - 2],
               np.r_[np.arange(off + 1, off + n * 2, 2), len(parent) - 1]]
    variants, diagnostics = [], []
    requests = [(0.1, 0), (-0.1, 0), (0, 0.1), (0, -0.1),
                (0.1, 0.1), (-0.1, 0.1), (0.1, -0.1), (-0.1, -0.1)]
    for fraction in [0.85, 0.93, 0.98]:
        target_index = int(np.flatnonzero(progress >= data["baseline"]["progressM"] * fraction)[0])
        target = design[target_index]
        retained = design[progress <= progress[target_index] * 0.8]
        for ridge in [1e-2, 1e-4, 1e-6]:
            try:
                vector = direction(retained, target, ridge)
            except (ValueError, np.linalg.LinAlgError) as error:
                diagnostics.append({"fraction": fraction, "ridge": ridge, "skipped": str(error)})
                continue
            diagnostics.append({"fraction": fraction, "ridge": ridge, "targetIndex": target_index,
                                "targetProgressM": float(progress[target_index]), "retainedSamples": len(retained),
                                "unitPrefixMax": float(np.max(np.abs(retained @ vector))),
                                "unitTargetResponse": float(target @ vector), "unitCoefficientNorm": float(np.linalg.norm(vector))})
            for steering, longitudinal in requests:
                delta = np.zeros_like(parent)
                delta[indices[0]] = steering * vector
                delta[indices[1]] = longitudinal * vector
                scale = 1.0
                for value, change in zip(parent, delta):
                    if change > 0:
                        scale = min(scale, (8 - value) / change)
                    elif change < 0:
                        scale = min(scale, (-8 - value) / change)
                prefix_max = max(np.max(np.abs(retained @ delta[indices[0]])), np.max(np.abs(retained @ delta[indices[1]])))
                if prefix_max > 0:
                    scale = min(scale, 0.001 / prefix_max)
                scale = max(0.0, scale) * (1 - 1e-12)
                weights = parent + scale * delta
                if np.any(~np.isfinite(weights)) or np.max(np.abs(weights)) > 8 + 1e-12:
                    raise ValueError("Invalid bounded motor candidate")
                genome = copy.deepcopy(data["genome"])
                genome["policyWeights"] = weights.tolist()
                variants.append({"id": f"{fraction}:{ridge}:{steering}:{longitudinal}", "fraction": fraction,
                                 "ridge": ridge, "targetIndex": target_index, "request": [steering, longitudinal],
                                 "scale": scale, "retainedSamples": len(retained),
                                 "actualTargetLogitDelta": [float(target @ (weights - parent)[i]) for i in indices],
                                 "actualPrefixLogitMax": float(prefix_max * scale),
                                 "coefficientDeltaNorm": float(np.linalg.norm(weights - parent)), "genome": genome})
    return {"format": "private-prefix-constrained-readout-v1", "numpyVersion": np.__version__,
            "inputParentSha256": data["parentSha256"], "variants": variants, "diagnostics": diagnostics,
            "boundary": "Linear constraints concern recorded neuronal states only, not the subsequent physical trajectory."}


if __name__ == "__main__":
    source, target = map(Path, sys.argv[1:3])
    report = generate(json.loads(source.read_text(encoding="utf-8")))
    with target.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, allow_nan=False)
    print(json.dumps({"variants": len(report["variants"]), "directions": len(report["diagnostics"]), "numpy": np.__version__}))
