"""Map the safe range of an isolated state-head authority floor."""
import json
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


def main():
    tag = "statehead-gatefloor-ramp-replay-20261026-20"
    out = ROOT / ".impeccable/review/learning-ml" / tag
    out.mkdir(exist_ok=False)
    checkpoint = ROOT / ".impeccable/review/learning-ml/statehead-reward-cuda4-gatefloor001-progress1-20261026-17/checkpoint.private.json"
    saved = json.loads(checkpoint.read_text(encoding="utf-8"))
    original_save = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
    expected_save_hash = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
    if file_hash(original_save) != expected_save_hash:
        raise RuntimeError("Original user save identity changed; refusing replay")

    environment = Pipe(ROOT / "work/statehead-reward-gate-env.cjs")
    started = time.monotonic()
    floors = (0.001, 0.00125, 0.0015, 0.002, 0.003, 0.004)
    results = []
    try:
        assert environment.metadata["appVersion"] == "5.6.0"
        for floor in floors:
            result = environment.request(
                "evaluate", weights=saved["currentWeights"], configuration={"gateFloor": floor}
            )
            row = {"gateFloor": floor, "result": result}
            if floor == 0.001 and result != saved["currentFull"]:
                raise RuntimeError("Gate-floor 0.001 replay does not match checkpoint")
            results.append(row)
            atomic_json(out / "progress.json", {"phase": "replay", "completed": len(results), "latest": row})
        if file_hash(original_save) != expected_save_hash:
            raise RuntimeError("Original user save changed during diagnostic")
        files = [
            "work/audit_statehead_gatefloor_ramp.py",
            "work/statehead-reward-gate-env.cjs",
            "work/neural-statehead-gate.cjs",
            "work/neural-statehead-rl-live.cjs",
            "work/neural-statehead-model.cjs",
        ]
        report = {
            "format": "private-statehead-gatefloor-ramp-replay-v1",
            "passed": True,
            "learningSucceeded": False,
            "approvedForApp": False,
            "checkpoint": str(checkpoint.relative_to(ROOT)),
            "checkpointSha256": file_hash(checkpoint),
            "fixedWeights": True,
            "gateFloorResults": results,
            "wallSeconds": time.monotonic() - started,
            "cuda": environment.request("stats"),
            "sourceHashes": {name: file_hash(ROOT / name) for name in sorted(files)},
            "originalSaveSha256": file_hash(original_save),
            "boundary": "Deterministic full-from-line replay of the same checkpoint weights at six isolated gate floors. The baseline at 0.001 must match the checkpoint. No optimization, app-source change, save write, or promotion.",
        }
        atomic_json(out / "report.json", report)
        atomic_json(out / "progress.json", {"phase": "finished", "passed": True})
    except BaseException as error:
        atomic_json(out / "failure.json", {"error": repr(error), "completedFloors": len(results)})
        raise
    finally:
        environment.close()


if __name__ == "__main__":
    main()
