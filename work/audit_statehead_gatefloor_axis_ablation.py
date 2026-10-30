"""Isolate steering and longitudinal effects of the experimental gate floor."""
import json
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


def main():
    tag = "statehead-gatefloor-axis-ablation-20261026-24"
    out = ROOT / ".impeccable/review/learning-ml" / tag
    out.mkdir(exist_ok=False)
    checkpoint = ROOT / ".impeccable/review/learning-ml/statehead-reward-cuda4-gatefloor001-progress1-20261026-17/checkpoint.private.json"
    ramp_report = ROOT / ".impeccable/review/learning-ml/statehead-gatefloor-ramp-replay-20261026-20/report.json"
    saved = json.loads(checkpoint.read_text(encoding="utf-8"))
    ramp = json.loads(ramp_report.read_text(encoding="utf-8"))
    expected = {
        (0.001, "both"): saved["currentFull"],
        (0.00125, "both"): next(row["result"] for row in ramp["gateFloorResults"] if row["gateFloor"] == 0.00125),
    }
    original_save = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
    expected_save_hash = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
    if file_hash(original_save) != expected_save_hash:
        raise RuntimeError("Original user save identity changed; refusing ablation")

    environment = Pipe(ROOT / "work/statehead-reward-gate-env.cjs")
    started = time.monotonic()
    scenarios = [(0.001, "both"), (0.00125, "both"), (0.00125, "steer-only"),
                 (0.00125, "longitudinal-only"), (0.00125, "none")]
    results = []
    try:
        assert environment.metadata["appVersion"] == "5.6.0"
        for floor, mode in scenarios:
            result = environment.request("evaluate", weights=saved["currentWeights"],
                                         configuration={"gateFloor": floor, "gateFloorMode": mode})
            if (floor, mode) in expected and result != expected[(floor, mode)]:
                raise RuntimeError(f"Previously verified control replay changed for floor={floor}, mode={mode}")
            row = {"gateFloor": floor, "gateFloorMode": mode, "result": result}
            results.append(row)
            atomic_json(out / "progress.json", {"phase": "replay", "completed": len(results), "latest": row})
        if file_hash(original_save) != expected_save_hash:
            raise RuntimeError("Original user save changed during ablation")
        files = ["work/audit_statehead_gatefloor_axis_ablation.py", "work/statehead-reward-gate-env.cjs",
                 "work/neural-statehead-gate.cjs", "work/neural-statehead-rl-live.cjs",
                 "work/neural-statehead-model.cjs", "work/neural-command-residual.cjs"]
        report = {
            "format": "private-statehead-gatefloor-axis-ablation-v1",
            "passed": True,
            "learningSucceeded": False,
            "approvedForApp": False,
            "checkpoint": str(checkpoint.relative_to(ROOT)),
            "checkpointSha256": file_hash(checkpoint),
            "fixedWeights": True,
            "scenarios": results,
            "wallSeconds": time.monotonic() - started,
            "cuda": environment.request("stats"),
            "sourceHashes": {name: file_hash(ROOT / name) for name in sorted(files)},
            "originalSaveSha256": file_hash(original_save),
            "boundary": "Full-from-line deterministic evaluations of identical checkpoint weights. The 0.001 and 0.00125 both-axis cases must match prior replay results. The remaining cases apply the 0.00125 floor only to steering, only to longitudinal control, or neither axis when the native radial gate is zero. No learning, app-source change, save write, or promotion.",
        }
        atomic_json(out / "report.json", report)
        atomic_json(out / "progress.json", {"phase": "finished", "passed": True})
    except BaseException as error:
        atomic_json(out / "failure.json", {"error": repr(error), "completedScenarios": len(results)})
        raise
    finally:
        environment.close()


if __name__ == "__main__":
    main()
