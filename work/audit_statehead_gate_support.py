"""Recompute native state-head radial-gate support from captured 516-value inputs."""
import json
import hashlib
import math
import statistics
from pathlib import Path

from neuronal_experiment_io import ROOT, atomic_json, file_hash


def feature_distance(observation, centre, scales):
    normalized = math.sqrt(sum(((x - y) / scale) ** 2 for x, y, scale in zip(observation, centre["values"], scales)) / len(observation))
    return normalized / centre["radius"]


def main():
    out = ROOT / ".impeccable/review/learning-ml/statehead-gate-support-20261026-26"
    out.mkdir(exist_ok=False)
    trace_dir = ROOT / ".impeccable/review/learning-ml/statehead-gatefloor-first-divergence-20261026-23"
    model = ROOT / ".impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json"
    envelope = json.loads(model.read_text(encoding="utf-8"))
    if hashlib.sha256(envelope["payloadJson"].encode("utf-8")).hexdigest() != envelope.get("sha256"):
        raise RuntimeError("Selected model payload checksum is invalid")
    data = json.loads(envelope["payloadJson"])
    basis = data["basis"]
    if len(basis.get("centres", [])) != 3:
        raise RuntimeError("Selected model envelope or basis identity is invalid")

    results = []
    for floor_text in ("0-001", "0-00125"):
        trace_path = trace_dir / f"trace-gate-{floor_text}.private.json"
        trace = json.loads(trace_path.read_text(encoding="utf-8"))
        normalized_radii = []
        gate_mismatches = []
        for row in trace["rows"]:
            observation = row["control"].get("neuralInputVector")
            if not isinstance(observation, list) or len(observation) != 516:
                raise RuntimeError("Every actual decoder input must contain 516 values")
            distances = [feature_distance(observation, centre, basis["scales"]) for centre in basis["centres"]]
            normalized_radii.append(min(distances))
            gate = max(0.0 if d >= 1.0 else max(0.0, min(1.0, (1.0 - d) ** 4 * (4.0 * d + 1.0))) for d in distances)
            if abs(gate - row["control"]["radialGate"]) > 1e-12:
                gate_mismatches.append(row["controlIndex"])
        ordered = sorted(normalized_radii)
        if gate_mismatches:
            raise RuntimeError(f"Recomputed native gate differs from captured controls: {gate_mismatches[:5]}")
        results.append({
            "gateFloor": 0.001 if floor_text == "0-001" else 0.00125,
            "controls": len(ordered),
            "nativeGateActiveControls": sum(value < 1.0 for value in ordered),
            "nearestNormalizedRadius": min(ordered),
            "medianNearestNormalizedRadius": statistics.median(ordered),
            "farthestNearestNormalizedRadius": max(ordered),
            "nativeGateMatchesCapturedTrace": True,
            "traceSha256": file_hash(trace_path),
        })

    report = {
        "format": "private-statehead-radial-gate-support-audit-v1",
        "passed": True,
        "learningSucceeded": False,
        "approvedForApp": False,
        "modelVersion": data["appVersion"],
        "modelId": data["modelId"],
        "circuitId": data["circuitId"],
        "modelSha256": file_hash(model),
        "basisCenters": len(basis["centres"]),
        "basisRadii": [centre["radius"] for centre in basis["centres"]],
        "gateFeature": "max over centres of max(0,min(1,(1-d)^4*(4*d+1))), d=RMS((input-centre)/scale)/radius; active only when d<1",
        "traces": results,
        "sourceHashes": {
            "work/audit_statehead_gate_support.py": file_hash(ROOT / "work/audit_statehead_gate_support.py"),
            "work/neural-context-readout.cjs": file_hash(ROOT / "work/neural-context-readout.cjs"),
            "work/neural-projected-residual.cjs": file_hash(ROOT / "work/neural-projected-residual.cjs"),
            "work/neural-statehead-gate.cjs": file_hash(ROOT / "work/neural-statehead-gate.cjs"),
            "model": file_hash(model),
        },
        "originalSaveSha256": "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3",
        "boundary": "Offline recomputation from private deterministic traces and the exact selected model basis. This verifies gate support for these two trajectories only; it does not train, promote, or prove behavior on other inputs.",
    }
    atomic_json(out / "report.json", report)
    atomic_json(out / "progress.json", {"phase": "finished", "passed": True})


if __name__ == "__main__":
    main()
