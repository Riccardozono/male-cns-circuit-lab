"""Compare isolated gate-floor authority on one fixed from-line state-head policy."""
import json
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


def main():
    tag = "statehead-gatefloor-authority-replay-20261026-18"
    out = ROOT / ".impeccable/review/learning-ml" / tag
    out.mkdir(exist_ok=False)
    checkpoint = ROOT / ".impeccable/review/learning-ml/statehead-reward-cuda4-gatefloor001-progress1-20261026-17/checkpoint.private.json"
    saved = json.loads(checkpoint.read_text(encoding="utf-8"))
    original_save = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
    save_hash = file_hash(original_save)
    expected_save_hash = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
    if save_hash != expected_save_hash:
        raise RuntimeError("Original user save identity changed; refusing replay")

    environment = Pipe(ROOT / "work/statehead-reward-gate-env.cjs")
    started = time.monotonic()
    try:
        assert environment.metadata["appVersion"] == "5.6.0"
        weights = saved["currentWeights"]
        baseline = environment.request(
            "evaluate", weights=weights, configuration={"gateFloor": 0.001}
        )
        if baseline != saved["currentFull"]:
            raise RuntimeError("Gate-floor 0.001 replay does not match checkpoint")
        results = [{"gateFloor": 0.001, "result": baseline}]
        atomic_json(out / "progress.json", {"phase": "baseline-matched", "result": baseline})
        for floor in (0.005, 0.01):
            result = environment.request(
                "evaluate", weights=weights, configuration={"gateFloor": floor}
            )
            results.append({"gateFloor": floor, "result": result})
            atomic_json(
                out / "progress.json",
                {"phase": "gate-floor-replay", "completed": len(results), "latest": results[-1]},
            )
        if file_hash(original_save) != expected_save_hash:
            raise RuntimeError("Original user save changed during diagnostic")
        files = [
            "work/audit_statehead_gatefloor_authority.py",
            "work/statehead-reward-gate-env.cjs",
            "work/neural-statehead-gate.cjs",
            "work/neural-statehead-rl-live.cjs",
            "work/neural-statehead-model.cjs",
            "outputs/rewards.js",
            ".impeccable/experimental-penalty5/outputs/rewards.js",
        ]
        report = {
            "format": "private-statehead-gatefloor-authority-replay-v1",
            "passed": True,
            "learningSucceeded": False,
            "approvedForApp": False,
            "checkpoint": str(checkpoint.relative_to(ROOT)),
            "checkpointSha256": file_hash(checkpoint),
            "checkpointNextUpdate": saved["nextUpdate"],
            "checkpointCurrentFull": saved["currentFull"],
            "gateFloorResults": results,
            "wallSeconds": time.monotonic() - started,
            "cuda": environment.request("stats"),
            "sourceHashes": {name: file_hash(ROOT / name) for name in sorted(set(files))},
            "originalSaveSha256": file_hash(original_save),
            "boundary": "Read-only deterministic full-from-line replay of identical saved policy weights under isolated gate floors 0.001, 0.005, and 0.01. The 0.001 result must exactly match the checkpoint. No optimization, app source change, save write, or promotion.",
        }
        atomic_json(out / "report.json", report)
        atomic_json(out / "progress.json", {"phase": "finished", "passed": True})
    except BaseException as error:
        atomic_json(out / "failure.json", {"error": repr(error)})
        raise
    finally:
        environment.close()


if __name__ == "__main__":
    main()
