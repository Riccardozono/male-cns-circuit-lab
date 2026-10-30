"""Build a research-only state gate covering a full protected MaleCNS trace.

The gate consumes only recorded 516-value neural inputs. Progress labels are
used only in the report to audit coverage by track segment.
"""
import json
import time
from pathlib import Path

import numpy as np

from neuronal_experiment_io import ROOT, atomic_json, file_hash


CAPTURE = ROOT / ".impeccable/review/learning-ml/statehead-firstlap-state-inputs-20261026-34"
OUT = ROOT / ".impeccable/review/learning-ml/statehead-fulltrace-gate-basis-20261026-41"
CAPTURE_SHA256 = "889fc79f3e4dd431305e9c1fa6924cfc8dfa28558902bb62deec44954fda1ecb"
SAVE = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
SAVE_SHA256 = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
CENTRE_LIMIT = 12
CANDIDATE_STRIDE = 8
TARGET_NORMALIZED_DISTANCE = 0.70


def distance_matrix(a, b, scales):
    aa = np.asarray(a / scales, dtype=np.float32)
    bb = np.asarray(b / scales, dtype=np.float32)
    aa2 = np.einsum("ij,ij->i", aa, aa, optimize=True)
    bb2 = np.einsum("ij,ij->i", bb, bb, optimize=True)
    d2 = (aa2[:, None] + bb2[None, :] - 2.0 * (aa @ bb.T)) / aa.shape[1]
    return np.sqrt(np.maximum(d2, 0.0), dtype=np.float32)


def radial_feature(distance, radius):
    scaled = distance / radius
    result = np.zeros_like(scaled)
    inside = scaled < 1.0
    delta = 1.0 - scaled[inside]
    result[inside] = delta**4 * (4.0 * scaled[inside] + 1.0)
    return result


def evaluate_rows(vectors, centres, scales):
    gate = np.zeros(len(vectors), dtype=np.float32)
    scales32 = scales.astype(np.float32)
    for centre in centres:
        delta = (vectors - np.asarray(centre["values"], dtype=np.float32)) / scales32
        distance = np.sqrt(np.einsum("ij,ij->i", delta, delta, optimize=True) / 516.0)
        gate = np.maximum(gate, radial_feature(distance, np.float32(centre["radius"])))
    return gate


def main():
    started = time.monotonic()
    if OUT.exists():
        raise FileExistsError(f"Preserve existing research directory: {OUT}")
    if file_hash(SAVE) != SAVE_SHA256:
        raise RuntimeError("Protected user save identity changed")
    capture_report_path = CAPTURE / "report.json"
    capture_report = json.loads(capture_report_path.read_text(encoding="utf-8"))
    capture_file = CAPTURE / "parent-neural-inputs.f64"
    if (not capture_report["passed"] or capture_report["controls"] != 8495
            or capture_report["capture"]["fileSha256"] != CAPTURE_SHA256
            or file_hash(capture_file) != CAPTURE_SHA256):
        raise RuntimeError("Verified complete actual-input capture is required")

    raw = np.fromfile(capture_file, dtype="<f8")
    if raw.size % 517:
        raise RuntimeError("Truncated or malformed decoder-input capture")
    rows = raw.reshape(-1, 517)
    progress = rows[:, 0]
    observations = rows[:, 1:]
    if (len(rows) != 8495 or observations.shape[1] != 516 or not np.isfinite(rows).all()
            or np.max(np.abs(observations)) > 1.0 or np.any(np.diff(progress) < -1e-9)
            or abs(progress[-1] - capture_report["parentResult"]["bestProgress"]) > 1e-6):
        raise RuntimeError("Captured neural inputs or progress labels do not match protected replay")

    scales = np.maximum(0.02, observations.std(axis=0, dtype=np.float64))
    candidate_indices = np.arange(0, len(observations), CANDIDATE_STRIDE, dtype=np.int64)
    candidates = observations[candidate_indices]
    normalized = np.asarray(candidates / scales, dtype=np.float32)
    centre_of_mass = normalized.mean(axis=0, dtype=np.float64).astype(np.float32)
    first = int(np.argmin(np.einsum("ij,ij->i", normalized - centre_of_mass,
                                    normalized - centre_of_mass, optimize=True)))
    selected = [first]
    nearest = distance_matrix(candidates, candidates[[first]], scales)[:, 0]
    while len(selected) < CENTRE_LIMIT:
        next_index = int(np.argmax(nearest))
        if next_index in selected:
            break
        selected.append(next_index)
        new_distance = distance_matrix(candidates, candidates[[next_index]], scales)[:, 0]
        nearest = np.minimum(nearest, new_distance)

    if len(selected) != CENTRE_LIMIT:
        raise RuntimeError("The full neural trace did not provide twelve distinct centres")

    all_to_centres = distance_matrix(observations, candidates[np.asarray(selected)], scales)
    assignments = np.argmin(all_to_centres, axis=1)
    nearest_distance = all_to_centres[np.arange(len(observations)), assignments]
    centres = []
    for index in range(CENTRE_LIMIT):
        cluster = nearest_distance[assignments == index]
        if not len(cluster):
            raise RuntimeError("A selected neural centre has no assigned trace state")
        radius = float(cluster.max()) / TARGET_NORMALIZED_DISTANCE
        centres.append({
            "values": candidates[selected[index]].astype(np.float64).tolist(),
            "radius": radius,
        })

    gate = evaluate_rows(observations, centres, scales)
    if np.any(gate <= 0.01):
        raise RuntimeError("The constructed gate does not cover every captured full-trace state")

    bins = []
    start = float(progress.min())
    stop = float(progress.max())
    bin_width = 500.0
    for lo in np.arange(np.floor(start / bin_width) * bin_width, stop + bin_width, bin_width):
        mask = (progress >= lo) & (progress < lo + bin_width)
        if not mask.any():
            continue
        values = gate[mask]
        bins.append({
            "progressBinMeters": [float(lo), float(lo + bin_width)],
            "controls": int(mask.sum()),
            "gateAbove0_01": int(np.count_nonzero(values > 0.01)),
            "gateAbove0_10": int(np.count_nonzero(values > 0.10)),
            "minimumGate": float(values.min()),
            "medianGate": float(np.median(values)),
            "maximumGate": float(values.max()),
        })

    basis = {
        "centres": centres,
        "scales": scales.astype(np.float64).tolist(),
        "protectedCount": 0,
        "sourceObservationCount": int(len(observations)),
    }
    OUT.mkdir(parents=True, exist_ok=False)
    basis_file = OUT / "basis.private.json"
    atomic_json(basis_file, basis)
    report = {
        "format": "private-statehead-fulltrace-gate-basis-v1",
        "passed": True,
        "learningSucceeded": False,
        "approvedForApp": False,
        "appVersion": "5.6.0",
        "parentSha256": capture_report["parentSha256"],
        "captureReportSha256": file_hash(capture_report_path),
        "captureFileSha256": file_hash(capture_file),
        "baselineControls": int(len(observations)),
        "progressRangeMeters": [float(progress.min()), float(progress.max())],
        "centreCount": len(centres),
        "candidateStrideControls": CANDIDATE_STRIDE,
        "radiusCoversNearestClusterThroughNormalizedDistance": TARGET_NORMALIZED_DISTANCE,
        "minimumRecordedGate": float(gate.min()),
        "medianRecordedGate": float(np.median(gate)),
        "p10RecordedGate": float(np.quantile(gate, 0.10)),
        "p90RecordedGate": float(np.quantile(gate, 0.90)),
        "recordedControlsAbove0_01": int(np.count_nonzero(gate > 0.01)),
        "recordedControlsAbove0_10": int(np.count_nonzero(gate > 0.10)),
        "recordedCoverageByProgressBin": bins,
        "centreSourceProgressMeters": [float(progress[candidate_indices[i]]) for i in selected],
        "centreRadii": [float(c["radius"]) for c in centres],
        "basisFile": basis_file.relative_to(ROOT).as_posix(),
        "basisFileSha256": file_hash(basis_file),
        "originalSaveSha256": file_hash(SAVE),
        "sourceHashes": {
            "work/build_statehead_fulltrace_basis.py": file_hash(ROOT / "work/build_statehead_fulltrace_basis.py"),
            "work/neural-context-readout.cjs": file_hash(ROOT / "work/neural-context-readout.cjs"),
            "work/neural-context-stack.cjs": file_hash(ROOT / "work/neural-context-stack.cjs"),
        },
        "wallSeconds": time.monotonic() - started,
        "boundary": "Research-only gate built from actual 516-value MaleCNS inputs on a complete protected-parent replay. Progress is a report label only and never enters inference. Recorded-state coverage is not proof of generalization or learned driving. No app change, user-save write, or promotion.",
    }
    atomic_json(OUT / "report.json", report)
    atomic_json(OUT / "progress.json", {"phase": "finished", "passed": True})
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
