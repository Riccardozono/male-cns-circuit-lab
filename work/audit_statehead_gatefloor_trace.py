"""Capture and compare deterministic state-head traces around the gate sensitivity point."""
import json
import math
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


def first_change(left, right, predicate):
    for index, (a, b) in enumerate(zip(left, right), start=1):
        if predicate(a, b):
            return {"controlIndex": index, "left": a, "right": b}
    return None


def main():
    tag = "statehead-gatefloor-first-divergence-20261026-23"
    out = ROOT / ".impeccable/review/learning-ml" / tag
    out.mkdir(exist_ok=False)
    checkpoint = ROOT / ".impeccable/review/learning-ml/statehead-reward-cuda4-gatefloor001-progress1-20261026-17/checkpoint.private.json"
    ramp_report = ROOT / ".impeccable/review/learning-ml/statehead-gatefloor-ramp-replay-20261026-20/report.json"
    saved = json.loads(checkpoint.read_text(encoding="utf-8"))
    ramp = json.loads(ramp_report.read_text(encoding="utf-8"))
    expected_floor_results = {
        0.001: saved["currentFull"],
        0.00125: next(row["result"] for row in ramp["gateFloorResults"] if row["gateFloor"] == 0.00125),
    }
    original_save = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
    expected_save_hash = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
    if file_hash(original_save) != expected_save_hash:
        raise RuntimeError("Original user save identity changed; refusing trace")

    environment = Pipe(ROOT / "work/statehead-reward-gate-env.cjs")
    started = time.monotonic()
    traces = {}
    try:
        assert environment.metadata["appVersion"] == "5.6.0"
        for floor in (0.001, 0.00125):
            trace = environment.request(
                "trace-evaluate", weights=saved["currentWeights"], configuration={"gateFloor": floor}
            )
            if trace["result"] != expected_floor_results[floor]:
                raise RuntimeError(f"Trace replay at gate {floor} does not match its verified result")
            traces[floor] = trace
            trace_name = f"trace-gate-{str(floor).replace('.', '-')}.private.json"
            (out / trace_name).write_text(json.dumps(trace, separators=(",", ":")), encoding="utf-8")
            atomic_json(out / "progress.json", {"phase": "trace-captured", "gateFloor": floor, "controls": trace["controls"]})

        low, high = traces[0.001]["rows"], traces[0.00125]["rows"]

        def action_delta(a, b):
            return max(abs(x - y) for x, y in zip(a["control"]["commands"], b["control"]["commands"]))

        command_change = first_change(low, high, lambda a, b: action_delta(a, b) > 1e-10)

        def position_delta(a, b):
            return math.hypot(a["before"]["position"][0] - b["before"]["position"][0], a["before"]["position"][1] - b["before"]["position"][1])

        position_change = first_change(low, high, lambda a, b: position_delta(a, b) > 0.01)
        heading_change = first_change(low, high, lambda a, b: abs(a["before"]["heading"] - b["before"]["heading"]) > 1e-6)
        neural_input_change = first_change(
            low,
            high,
            lambda a, b: a["control"].get("neuralInputVector") is not None
            and b["control"].get("neuralInputVector") is not None
            and max(abs(x - y) for x, y in zip(a["control"]["neuralInputVector"], b["control"]["neuralInputVector"])) > 1e-8,
        )
        captured_window = {
            floor: [row for row in traces[floor]["rows"] if 650 <= row["before"]["bestProgress"] <= 900]
            for floor in (0.001, 0.00125)
        }
        complete_input_capture = all(
            rows and all(len(row["control"].get("neuralInputVector") or []) == 516 for row in rows)
            for rows in captured_window.values()
        )
        if not complete_input_capture:
            raise RuntimeError("The actual 516-value decoder input was not captured for every control in the divergence window")
        differences = {}
        for name, change in (("command", command_change), ("position", position_change), ("heading", heading_change), ("neuralInput", neural_input_change)):
            if not change:
                differences[name] = None
                continue
            index = change["controlIndex"] - 1
            a, b = low[index], high[index]
            differences[name] = {
                "controlIndex": change["controlIndex"],
                "progressAtLowGate": a["before"]["bestProgress"],
                "progressAtHighGate": b["before"]["bestProgress"],
                "ticks": [a["ticksBefore"], b["ticksBefore"]],
                "leftCommands": a["control"]["commands"],
                "rightCommands": b["control"]["commands"],
                "maxPositionDeltaPx": position_delta(a, b),
                "headingDeltaRad": abs(a["before"]["heading"] - b["before"]["heading"]),
                "gateValues": [a["control"]["gate"], b["control"]["gate"]],
                "radialGates": [a["control"]["radialGate"], b["control"]["radialGate"]],
                "priorCommands": [a["control"]["prior"], b["control"]["prior"]],
                "decoderInputVectorLengths": [len(a["control"].get("neuralInputVector") or []), len(b["control"].get("neuralInputVector") or [])],
                "physicalSensorVectorLengths": [len(a["before"].get("sensorVector") or []), len(b["before"].get("sensorVector") or [])],
            }
        files = [
            "work/audit_statehead_gatefloor_trace.py",
            "work/statehead-reward-gate-env.cjs",
            "work/neural-statehead-gate.cjs",
            "work/neural-statehead-rl-live.cjs",
            "work/neural-statehead-model.cjs",
        ]
        if file_hash(original_save) != expected_save_hash:
            raise RuntimeError("Original user save changed during trace")
        report = {
            "format": "private-statehead-gatefloor-first-divergence-v2",
            "passed": True,
            "learningSucceeded": False,
            "approvedForApp": False,
            "checkpoint": str(checkpoint.relative_to(ROOT)),
            "checkpointSha256": file_hash(checkpoint),
            "gateFloorResults": [{"gateFloor": floor, "result": traces[floor]["result"], "controls": traces[floor]["controls"], "traceSha256": traces[floor]["traceSha256"]} for floor in (0.001, 0.00125)],
            "firstDifferences": differences,
            "captureWindowBestProgress": [650, 900],
            "decoderInputVectorLength": 516,
            "capturedControlsInWindow": {str(floor): len(captured_window[floor]) for floor in (0.001, 0.00125)},
            "fullDecoderInputCapturedInsideWindow": complete_input_capture,
            "wallSeconds": time.monotonic() - started,
            "cuda": environment.request("stats"),
            "sourceHashes": {name: file_hash(ROOT / name) for name in sorted(files)},
            "originalSaveSha256": file_hash(original_save),
            "boundary": "Deterministic full-from-line traces of identical weights at gate 0.001 and 0.00125. Captures the actual 516-value neural decoder input on each control (650–900 m), physical sensor vector, applied command, and post-control physics. Both outcomes must match previously verified reports. No optimization, app change, save write, or promotion.",
        }
        atomic_json(out / "report.json", report)
        atomic_json(out / "progress.json", {"phase": "finished", "passed": True})
    except BaseException as error:
        atomic_json(out / "failure.json", {"error": repr(error), "capturedGates": sorted(traces)})
        raise
    finally:
        environment.close()


if __name__ == "__main__":
    main()
