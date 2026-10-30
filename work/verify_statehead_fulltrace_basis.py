"""Replay the protected parent through a full-trace neural gate at zero weights."""
import json
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash


TAG = "statehead-fulltrace-gate-zero-preflight-20261026-42"
BASE = ROOT / ".impeccable/review/learning-ml"
OUT = BASE / TAG
PREPARED = BASE / "statehead-fulltrace-gate-basis-20261026-41"
CAPTURE = BASE / "statehead-firstlap-state-inputs-20261026-34/report.json"
SAVE = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
SAVE_SHA256 = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
EXPECTED_PARENT_ACTION_TRACE = "384601f5a3a8b3c7129c76a58fb4e2b3e43709ad15902ba015088dc0977bb1ac"


def main():
    if OUT.exists():
        raise FileExistsError(f"Preserve existing research directory: {OUT}")
    if file_hash(SAVE) != SAVE_SHA256:
        raise RuntimeError("Protected user save identity changed")
    prepared_report_path = PREPARED / "report.json"
    prepared = json.loads(prepared_report_path.read_text(encoding="utf-8"))
    basis_path = PREPARED / "basis.private.json"
    basis = json.loads(basis_path.read_text(encoding="utf-8"))
    capture = json.loads(Path(CAPTURE).read_text(encoding="utf-8"))
    if (not prepared["passed"] or prepared["centreCount"] != 12
            or prepared["recordedControlsAbove0_01"] != prepared["baselineControls"]
            or file_hash(basis_path) != prepared["basisFileSha256"]
            or capture["originalSaveSha256"] != SAVE_SHA256):
        raise RuntimeError("Verified full-trace basis and protected capture are required")

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
            raise RuntimeError("Instant per-observation gate did not load")
        if metadata["baseline"]["traceSha256"] != EXPECTED_PARENT_ACTION_TRACE:
            raise RuntimeError("Zero-weight initialization changed the protected action trace")

        trace = environment.request(
            "trace-evaluate",
            weights=[0.0] * 18,
            configuration={"gateFloor": 0.0, "includeDecoderInputVectors": False},
        )
        result_keys = ("bestProgress", "fitness", "laps", "reason", "totalSimulationSeconds", "complete", "lapTimes")
        expected = {key: metadata["parentExpected"][key] for key in result_keys}
        if trace["result"] != expected or trace["controls"] != 8495 or len(trace["rows"]) != 8495:
            raise RuntimeError("Full replay differs from the protected parent outcome or length")

        changed = [row for row in trace["rows"] if row["control"]["commands"] != row["control"]["prior"]]
        gates = [row["control"]["radialGate"] for row in trace["rows"]]
        if changed or min(gates) <= 0.01:
            raise RuntimeError(json.dumps({
                "changedCommands": len(changed),
                "minimumGate": min(gates),
                "firstChanged": changed[0] if changed else None,
            }, ensure_ascii=False))

        progress_bins = {}
        for row in trace["rows"]:
            progress = row["before"]["bestProgress"]
            bucket = int(progress // 500) * 500
            item = progress_bins.setdefault(str(bucket), {"controls": 0, "gateAbove0_01": 0,
                                                          "gateAbove0_10": 0, "minimumGate": 1.0,
                                                          "maximumGate": 0.0})
            gate = row["control"]["radialGate"]
            item["controls"] += 1
            item["gateAbove0_01"] += int(gate > 0.01)
            item["gateAbove0_10"] += int(gate > 0.10)
            item["minimumGate"] = min(item["minimumGate"], gate)
            item["maximumGate"] = max(item["maximumGate"], gate)
        if any(item["gateAbove0_01"] != item["controls"] for item in progress_bins.values()):
            raise RuntimeError("Runtime gate lost recorded-trace coverage in a progress bin")
        if file_hash(SAVE) != SAVE_SHA256:
            raise RuntimeError("Protected user save changed during preflight")

        report = {
            "format": "private-statehead-fulltrace-gate-zero-preflight-v1",
            "passed": True,
            "learningSucceeded": False,
            "approvedForApp": False,
            "appVersion": metadata["appVersion"],
            "parentSha256": metadata["parentSha256"],
            "instantGate": metadata["instantGate"],
            "gateBasisSha256": metadata["gateBasisSha256"],
            "basisFileSha256": file_hash(basis_path),
            "basisPreparationReportSha256": file_hash(prepared_report_path),
            "fullResult": trace["result"],
            "controls": trace["controls"],
            "fullDetailedTraceSha256": trace["traceSha256"],
            "runtimeGateMinimum": min(gates),
            "runtimeGateMedian": sorted(gates)[len(gates) // 2],
            "runtimeGateP90": sorted(gates)[int(len(gates) * 0.90)],
            "runtimeGateAbove0_01": sum(gate > 0.01 for gate in gates),
            "zeroWeightsPreserveEveryAppliedCommand": not changed,
            "progressBinGateCoverage": progress_bins,
            "parentActionTraceSha256": metadata["baseline"]["traceSha256"],
            "cuda": environment.request("stats"),
            "originalSaveSha256": file_hash(SAVE),
            "sourceHashes": {
                "work/verify_statehead_fulltrace_basis.py": file_hash(ROOT / "work/verify_statehead_fulltrace_basis.py"),
                "work/statehead-reward-gate-env.cjs": file_hash(ROOT / "work/statehead-reward-gate-env.cjs"),
                "work/neural-statehead-gate.cjs": file_hash(ROOT / "work/neural-statehead-gate.cjs"),
                "work/neural-context-readout.cjs": file_hash(ROOT / "work/neural-context-readout.cjs"),
            },
            "wallSeconds": time.monotonic() - started,
            "boundary": "Full deterministic protected-parent replay on the current Node/CUDA physics environment. Gate consumes only actual neuronal inputs; progress is used only to audit coverage. Zero weights must preserve each applied command. No policy learning, app change, save mutation, or candidate promotion.",
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
