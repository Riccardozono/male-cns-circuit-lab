"""Full zero-policy replay proving per-observation local-gate support."""
import json
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


TAG = "statehead-strict-local-basis-zero-preflight-20261026-36"
OUT = ROOT / ".impeccable/review/learning-ml" / TAG
PREPARED = ROOT / ".impeccable/review/learning-ml/statehead-strict-local-basis-20261026-35"
CAPTURE = ROOT / ".impeccable/review/learning-ml/statehead-firstlap-state-inputs-20261026-34/report.json"
SAVE = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
SAVE_SHA256 = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
EXPECTED_ACTION_TRACE = "384601f5a3a8b3c7129c76a58fb4e2b3e43709ad15902ba015088dc0977bb1ac"
WINDOW = (780.0, 1800.0)


def main():
    if OUT.exists():
        raise FileExistsError(f"Preserve existing research directory: {OUT}")
    if file_hash(SAVE) != SAVE_SHA256:
        raise RuntimeError("Protected user save identity changed")
    prep = json.loads((PREPARED / "report.json").read_text(encoding="utf-8"))
    basis_path = PREPARED / "basis.private.json"
    basis = json.loads(basis_path.read_text(encoding="utf-8"))
    capture = json.loads(Path(CAPTURE).read_text(encoding="utf-8"))
    if (not prep["passed"] or prep["outsideActiveControls"] != 0
            or capture["originalSaveSha256"] != SAVE_SHA256):
        raise RuntimeError("Strictly local basis preparation and protected capture are required")
    OUT.mkdir(parents=True, exist_ok=False)
    environment = None
    started = time.monotonic()
    try:
        environment = Pipe(
            ROOT / "work/statehead-reward-gate-env.cjs",
            initialization={"basisOverride": basis, "instantGate": True},
        )
        metadata = environment.metadata
        if not metadata["gateBasisOverride"] or not metadata["instantGate"]:
            raise RuntimeError("Instant per-observation gate mode did not load")
        if metadata["baseline"]["traceSha256"] != EXPECTED_ACTION_TRACE:
            raise RuntimeError("Instant gate changed the protected zero-policy initialization trace")
        trace = environment.request(
            "trace-evaluate",
            weights=[0.0] * 18,
            configuration={"gateFloor": 0.0, "includeDecoderInputVectors": False},
        )
        result_keys = ("bestProgress", "fitness", "laps", "reason", "totalSimulationSeconds", "complete", "lapTimes")
        expected = {key: metadata["parentExpected"][key] for key in result_keys}
        if trace["result"] != expected or trace["controls"] != 8495 or len(trace["rows"]) != 8495:
            raise RuntimeError("Full replay failed protected-parent outcome/length verification")
        outside = [row for row in trace["rows"]
                   if row["before"]["bestProgress"] < WINDOW[0] or row["before"]["bestProgress"] > WINDOW[1]]
        target = [row for row in trace["rows"]
                  if WINDOW[0] <= row["before"]["bestProgress"] <= WINDOW[1]]
        outside_active = [row for row in outside if row["control"]["radialGate"] != 0.0]
        target_active = [row for row in target if row["control"]["radialGate"] > 0.0]
        changed = [row for row in trace["rows"] if row["control"]["commands"] != row["control"]["prior"]]
        if outside_active or changed or not target_active:
            raise RuntimeError(json.dumps({
                "outsideActive": len(outside_active), "targetActive": len(target_active),
                "changedCommands": len(changed),
                "firstOutsideActive": outside_active[0] if outside_active else None,
                "firstChanged": changed[0] if changed else None,
            }, ensure_ascii=False))
        if file_hash(SAVE) != SAVE_SHA256:
            raise RuntimeError("Protected user save changed during replay")
        active_progress = [row["before"]["bestProgress"] for row in target_active]
        report = {
            "format": "private-statehead-strict-local-basis-zero-preflight-v1",
            "passed": True,
            "learningSucceeded": False,
            "approvedForApp": False,
            "appVersion": metadata["appVersion"],
            "parentSha256": metadata["parentSha256"],
            "instantGate": metadata["instantGate"],
            "gateBasisSha256": metadata["gateBasisSha256"],
            "basisFileSha256": file_hash(basis_path),
            "basisPreparationReportSha256": file_hash(PREPARED / "report.json"),
            "fullResult": trace["result"],
            "controls": trace["controls"],
            "fullDetailedTraceSha256": trace["traceSha256"],
            "targetProgressWindowMeters": list(WINDOW),
            "targetControls": len(target),
            "targetGateActiveControls": len(target_active),
            "targetGateActiveProgressRange": [min(active_progress), max(active_progress)],
            "outsideControls": len(outside),
            "outsideGateActiveControls": len(outside_active),
            "outsideGateMaximum": max((row["control"]["radialGate"] for row in outside), default=0),
            "zeroWeightsPreserveEveryAppliedCommand": True,
            "parentActionTraceSha256": metadata["baseline"]["traceSha256"],
            "cuda": environment.request("stats"),
            "originalSaveSha256": file_hash(SAVE),
            "sourceHashes": {
                "work/verify_statehead_strict_local_basis.py": file_hash(ROOT / "work/verify_statehead_strict_local_basis.py"),
                "work/statehead-reward-gate-env.cjs": file_hash(ROOT / "work/statehead-reward-gate-env.cjs"),
                "work/neural-statehead-gate.cjs": file_hash(ROOT / "work/neural-statehead-gate.cjs"),
                "work/neural-context-readout.cjs": file_hash(ROOT / "work/neural-context-readout.cjs"),
            },
            "wallSeconds": time.monotonic() - started,
            "boundary": "A complete deterministic protected-parent trace with actual MaleCNS neural inputs. Offline progress labels select the training window only; policy inference receives no route or progress input. Zero mean weights must preserve every command. The gate is evaluated per observation and must remain zero at every baseline state outside the selected window. No optimizer updates, app change, save mutation, or candidate promotion.",
        }
        atomic_json(OUT / "report.json", report)
        atomic_json(OUT / "progress.json", {"phase": "finished", "passed": True})
        print(json.dumps(report, ensure_ascii=False))
    except BaseException as error:
        atomic_json(OUT / "failure.json", {"error": repr(error)})
        raise
    finally:
        if environment is not None:
            environment.close()


if __name__ == "__main__":
    main()
