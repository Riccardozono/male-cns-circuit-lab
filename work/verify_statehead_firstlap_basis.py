"""Verify a zero-correction, locally gated first-lap basis against its parent."""
import json
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


def main():
    tag = "statehead-firstlap-gate-basis-zero-policy-20261026-30"
    out = ROOT / ".impeccable/review/learning-ml" / tag
    out.mkdir(exist_ok=False)
    prepared = ROOT / ".impeccable/review/learning-ml/statehead-firstlap-gated-basis-20261026-27"
    basis_path = prepared / "basis.private.json"
    prep_report = json.loads((prepared / "report.json").read_text(encoding="utf-8"))
    basis = json.loads(basis_path.read_text(encoding="utf-8"))
    original_save = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
    expected_save_hash = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
    if file_hash(original_save) != expected_save_hash or file_hash(basis_path) != prep_report["basisFileSha256"]:
        raise RuntimeError("Protected save or prepared basis identity changed")

    started = time.monotonic()
    environment = None
    try:
        environment = Pipe(ROOT / "work/statehead-reward-gate-env.cjs", initialization={"basisOverride": basis})
        metadata = environment.metadata
        if not metadata["gateBasisOverride"] or metadata["gateBasisCentres"] != prep_report["centreCount"]:
            raise RuntimeError("Private environment did not load the prepared basis")
        if metadata["baseline"]["observed"] != {
            key: metadata["parentExpected"][key]
            for key in ("bestProgress", "fitness", "laps", "reason", "totalSimulationSeconds", "complete", "lapTimes")
        }:
            raise RuntimeError("Zero-correction initialization did not reproduce the protected parent result")
        trace = environment.request(
            "trace-evaluate",
            weights=[0.0] * 18,
            configuration={"gateFloor": 0.0, "stopAtBestProgress": 1000.0, "includeDecoderInputVectors": False},
        )
        if trace["result"]["complete"] or trace["result"]["bestProgress"] < 1000:
            raise RuntimeError("The bounded from-line trace did not reach its physical stop point")
        rows = trace["rows"]
        if any(row["control"]["commands"] != row["control"]["prior"] for row in rows):
            raise RuntimeError("Zero state-head weights changed a protected parent command")
        active = [row for row in rows if row["control"]["radialGate"] > 0]
        window = [row for row in rows if 650 <= row["before"]["bestProgress"] <= 900]
        window_active = [row for row in window if row["control"]["radialGate"] > 0]
        if not active:
            raise RuntimeError("The local gate did not activate on the protected parent trajectory")
        if file_hash(original_save) != expected_save_hash:
            raise RuntimeError("Original user save changed during zero-correction verification")

        report = {
            "format": "private-statehead-firstlap-gate-basis-zero-policy-v1",
            "passed": True,
            "learningSucceeded": False,
            "approvedForApp": False,
            "appVersion": metadata["appVersion"],
            "parentSha256": metadata["parentSha256"],
            "parentExpected": metadata["parentExpected"],
            "zeroCorrectionInitialization": metadata["baseline"],
            "gateBasisSha256": metadata["gateBasisSha256"],
            "basisFileSha256": file_hash(basis_path),
            "basisCentres": metadata["gateBasisCentres"],
            "traceStopProgress": 1000,
            "traceResult": trace["result"],
            "controls": trace["controls"],
            "gateActiveControlsToStop": len(active),
            "gateActiveControls650to900m": len(window_active),
            "gateWindowControls650to900m": len(window),
            "gateActiveProgressRange": [min(row["before"]["bestProgress"] for row in active), max(row["before"]["bestProgress"] for row in active)],
            "maxGateInWindow": max((row["control"]["radialGate"] for row in window), default=0),
            "zeroWeightsPreserveEveryAppliedCommand": True,
            "tracePartialSha256": trace["traceSha256"],
            "wallSeconds": time.monotonic() - started,
            "cuda": environment.request("stats"),
            "sourceHashes": {
                "work/prepare_statehead_firstlap_basis.cjs": file_hash(ROOT / "work/prepare_statehead_firstlap_basis.cjs"),
                "work/verify_statehead_firstlap_basis.py": file_hash(ROOT / "work/verify_statehead_firstlap_basis.py"),
                "work/statehead-reward-gate-env.cjs": file_hash(ROOT / "work/statehead-reward-gate-env.cjs"),
                "basis": file_hash(basis_path),
                "sourceTrace": prep_report["traceSha256"],
            },
            "originalSaveSha256": file_hash(original_save),
            "boundary": "The override basis is created from captured actual 516-value neural inputs. Its zero-weight head must reproduce the protected parent full result and action/physics trace during environment initialization; a separate partial trace confirms gate activation without changing applied commands. No policy learning, full-lap candidate evaluation, app change, save write, or promotion.",
        }
        atomic_json(out / "report.json", report)
        atomic_json(out / "progress.json", {"phase": "finished", "passed": True})
    except BaseException as error:
        atomic_json(out / "failure.json", {"error": repr(error)})
        raise
    finally:
        if environment is not None:
            environment.close()


if __name__ == "__main__":
    main()
