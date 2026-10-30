"""Build a progress-labelled, strictly off-window-zero MaleCNS gate basis."""
import json
import time
from pathlib import Path

import numpy as np

from neuronal_experiment_io import ROOT, atomic_json, file_hash


CAPTURE = ROOT / ".impeccable/review/learning-ml/statehead-firstlap-state-inputs-20261026-34"
OUT = ROOT / ".impeccable/review/learning-ml/statehead-strict-local-basis-20261026-35"
CAPTURE_SHA256 = "889fc79f3e4dd431305e9c1fa6924cfc8dfa28558902bb62deec44954fda1ecb"
SAVE = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
SAVE_SHA256 = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
TARGET = (780.0, 1800.0)
CENTRE_LIMIT = 12
MARGIN = 0.80


def radial_feature(distance, radius):
    scaled = distance / radius
    result = np.zeros_like(scaled)
    inside = scaled < 1.0
    delta = 1.0 - scaled[inside]
    result[inside] = delta**4 * (4.0 * scaled[inside] + 1.0)
    return result


def distance_matrix(a, b, scales):
    aa = np.asarray(a / scales, dtype=np.float32)
    bb = np.asarray(b / scales, dtype=np.float32)
    aa2 = np.einsum("ij,ij->i", aa, aa, optimize=True)
    bb2 = np.einsum("ij,ij->i", bb, bb, optimize=True)
    d2 = (aa2[:, None] + bb2[None, :] - 2.0 * (aa @ bb.T)) / aa.shape[1]
    return np.sqrt(np.maximum(d2, 0.0), dtype=np.float32)


def main():
    if OUT.exists():
        raise FileExistsError(f"Preserve existing research directory: {OUT}")
    if file_hash(SAVE) != SAVE_SHA256:
        raise RuntimeError("Protected user save identity changed")
    capture_report = json.loads((CAPTURE / "report.json").read_text(encoding="utf-8"))
    capture_file = CAPTURE / "parent-neural-inputs.f64"
    if (not capture_report["passed"] or capture_report["capture"]["fileSha256"] != CAPTURE_SHA256
            or file_hash(capture_file) != CAPTURE_SHA256 or capture_report["controls"] != 8495):
        raise RuntimeError("Verified complete actual-input capture is required")

    raw = np.fromfile(capture_file, dtype="<f8")
    if raw.size % 517:
        raise RuntimeError("Truncated or malformed decoder-input capture")
    rows = raw.reshape(-1, 517)
    progress = rows[:, 0]
    observations = rows[:, 1:]
    if (len(rows) != 8495 or not np.isfinite(rows).all() or observations.shape[1] != 516
            or np.max(np.abs(observations)) > 1.0
            or np.any(np.diff(progress) < -1e-9)
            or abs(progress[-1] - capture_report["parentResult"]["bestProgress"]) > 1e-6):
        raise RuntimeError("Captured progress labels or neural inputs do not match parent bounds")

    in_target = (progress >= TARGET[0]) & (progress <= TARGET[1])
    outside = ~in_target
    target_rows = observations[in_target]
    outside_rows = observations[outside]
    if len(target_rows) < 100 or len(outside_rows) < 100:
        raise RuntimeError("Target window and outside-window states need adequate coverage")
    mean = target_rows.mean(axis=0, dtype=np.float64)
    scales = np.maximum(0.02, target_rows.std(axis=0, dtype=np.float64))

    # Candidate centres come from real in-window neural inputs only. Distances
    # to every other full-lap input cap each compact-support radius so that the
    # basis must be exactly zero on all baseline states outside the window.
    candidate_stride = 4
    candidate_indices = np.arange(0, len(target_rows), candidate_stride)
    candidates = target_rows[candidate_indices]
    min_outside = distance_matrix(candidates, outside_rows, scales).min(axis=1)
    radii = min_outside * MARGIN
    eligible = np.flatnonzero(radii > 1e-5)
    if len(eligible) < CENTRE_LIMIT:
        raise RuntimeError("Too few strictly local neural centres have usable support")

    target_candidates = distance_matrix(target_rows, candidates[eligible], scales)
    centre_indices = []
    coverage = np.zeros(len(target_rows), dtype=np.float32)
    for _ in range(CENTRE_LIMIT):
        best = None
        best_score = -1.0
        for local_index, source_index in enumerate(eligible):
            if local_index in centre_indices:
                continue
            activation = radial_feature(target_candidates[:, local_index], radii[source_index])
            improvement = np.maximum(coverage, activation) - coverage
            score = float(np.count_nonzero(improvement > 1e-4) + 0.05 * improvement.sum())
            if score > best_score:
                best_score, best = score, local_index
        if best is None or best_score <= 0:
            break
        centre_indices.append(best)
        source_index = eligible[best]
        activation = radial_feature(target_candidates[:, best], radii[source_index])
        coverage = np.maximum(coverage, activation)

    centres = []
    for local_index in centre_indices:
        source_index = int(eligible[local_index])
        row = int(candidate_indices[source_index])
        centres.append({
            "values": target_rows[row].astype(np.float64).tolist(),
            "radius": float(radii[source_index]),
        })
    if not centres:
        raise RuntimeError("No centres were selected")

    # Independently evaluate exactly the inference feature implemented by the
    # application for all source rows, with tight scalar loops over 12 centres.
    def evaluate_rows(vectors):
        gate = np.zeros(len(vectors), dtype=np.float32)
        for centre in centres:
            delta = (vectors - np.asarray(centre["values"], dtype=np.float32)) / scales.astype(np.float32)
            d = np.sqrt(np.einsum("ij,ij->i", delta, delta, optimize=True) / 516.0)
            gate = np.maximum(gate, radial_feature(d, np.float32(centre["radius"])))
        return gate

    target_gate = evaluate_rows(target_rows)
    outside_gate = evaluate_rows(outside_rows)
    if np.any(outside_gate != 0.0):
        raise RuntimeError("Strict local basis unexpectedly activates outside its physical training window")
    basis = {
        "centres": centres,
        "scales": scales.astype(np.float64).tolist(),
        "protectedCount": int(np.count_nonzero(progress < TARGET[0])),
        "sourceObservationCount": int(len(target_rows)),
    }
    OUT.mkdir(parents=True, exist_ok=False)
    basis_file = OUT / "basis.private.json"
    atomic_json(basis_file, basis)
    report = {
        "format": "private-statehead-strict-local-basis-v1",
        "passed": True,
        "learningSucceeded": False,
        "approvedForApp": False,
        "appVersion": "5.6.0",
        "parentSha256": capture_report["parentSha256"],
        "captureReportSha256": file_hash(CAPTURE / "report.json"),
        "captureFileSha256": file_hash(capture_file),
        "targetProgressWindowMeters": list(TARGET),
        "baselineControls": len(progress),
        "targetControls": int(in_target.sum()),
        "outsideControls": int(outside.sum()),
        "centerCount": len(centres),
        "marginOfNearestOutsideState": MARGIN,
        "candidateStrideControls": candidate_stride,
        "windowActiveControls": int(np.count_nonzero(target_gate > 0.0)),
        "windowUsefulControlsGateAbove0_01": int(np.count_nonzero(target_gate > 0.01)),
        "windowCoverageFractionGateAbove0_01": float(np.mean(target_gate > 0.01)),
        "windowMaximumGate": float(target_gate.max(initial=0.0)),
        "outsideActiveControls": int(np.count_nonzero(outside_gate > 0.0)),
        "outsideMaximumGate": float(outside_gate.max(initial=0.0)),
        "centresProgressMeters": [float(progress[in_target][candidate_indices[eligible[i]]]) for i in centre_indices],
        "centresRadii": [float(centres[i]["radius"]) for i in range(len(centres))],
        "basisFile": basis_file.relative_to(ROOT).as_posix(),
        "basisFileSha256": file_hash(basis_file),
        "originalSaveSha256": file_hash(SAVE),
        "sourceHashes": {
            "work/build_statehead_strict_local_basis.py": file_hash(ROOT / "work/build_statehead_strict_local_basis.py"),
            "work/neural-context-readout.cjs": file_hash(ROOT / "work/neural-context-readout.cjs"),
            "work/neural-context-stack.cjs": file_hash(ROOT / "work/neural-context-stack.cjs"),
        },
        "wallSeconds": time.monotonic() - started,
        "boundary": "Research-only basis from actual 516-value MaleCNS states. Physical progress is used only to choose source rows offline, never as an inference feature. Gate is verified exactly zero outside the selected baseline progress window. No policy learning, app change, user-save write, or promotion.",
    }
    atomic_json(OUT / "report.json", report)
    atomic_json(OUT / "progress.json", {"phase": "finished", "passed": True})
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    started = time.monotonic()
    main()
