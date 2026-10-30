"""Capture actual 516-value state-head inputs on the protected zero-policy lap."""
import time
from pathlib import Path

from neuronal_experiment_io import ROOT, Pipe, atomic_json, file_hash

TAG = "statehead-firstlap-state-inputs-20261026-34"
OUT = ROOT / ".impeccable/review/learning-ml" / TAG
SAVE = Path("C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save")
SAVE_SHA256 = "29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3"
PREFLIGHT = ROOT / ".impeccable/review/learning-ml/statehead-firstlap-gate-basis-zero-policy-20261026-30/report.json"
EXPECTED_TRACE = "384601f5a3a8b3c7129c76a58fb4e2b3e43709ad15902ba015088dc0977bb1ac"


def main():
    if OUT.exists():
        raise FileExistsError(f"Preserve existing research directory: {OUT}")
    if file_hash(SAVE) != SAVE_SHA256:
        raise RuntimeError("Protected user save identity changed")
    preflight = __import__("json").loads(PREFLIGHT.read_text(encoding="utf-8"))
    if not preflight["passed"] or preflight["originalSaveSha256"] != SAVE_SHA256:
        raise RuntimeError("Verified zero-policy parent preflight required")
    basis_path = ROOT / ".impeccable/review/learning-ml/statehead-firstlap-gated-basis-20261026-27/basis.private.json"
    basis_report = __import__("json").loads((basis_path.parent / "report.json").read_text(encoding="utf-8"))
    basis = __import__("json").loads(basis_path.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=False)
    capture_path = OUT / "parent-neural-inputs.f64"
    environment = None
    started = time.monotonic()
    try:
        environment = Pipe(ROOT / "work/statehead-reward-gate-env.cjs", initialization={"basisOverride": basis})
        metadata = environment.metadata
        if not metadata["gateBasisOverride"] or metadata["gateBasisSha256"] != preflight["gateBasisSha256"]:
            raise RuntimeError("Pinned zero-policy basis did not load exactly")
        if metadata["baseline"]["traceSha256"] != EXPECTED_TRACE:
            raise RuntimeError("Initialization did not reproduce the protected parent trace")
        trace = environment.request(
            "trace-evaluate",
            weights=[0.0] * 18,
            configuration={
                "gateFloor": 0.0,
                "captureDecoderInputProgress": [0.0, 10000.0],
                "decoderInputCaptureFile": capture_path.relative_to(ROOT).as_posix(),
                "includeDecoderInputVectors": False,
                "includeTraceRows": False,
            },
        )
        capture = trace["decoderInputCapture"]
        result_keys = ("bestProgress", "fitness", "laps", "reason", "totalSimulationSeconds", "complete", "lapTimes")
        expected_result = {key: metadata["parentExpected"][key] for key in result_keys}
        if (trace["result"] != expected_result or trace["controls"] != 8495 or trace["rows"] is not None
                or capture["rows"] != trace["controls"] or capture["columns"] != 517
                or capture["dtype"] != "little-endian-float64" or capture["sha256"] != file_hash(capture_path)):
            diagnostics = {
                "resultMatchesParent": trace["result"] == expected_result,
                "traceResult": trace.get("result"), "expectedResult": expected_result,
                "controls": trace.get("controls"), "rowsOmitted": trace.get("rows") is None,
                "capture": capture, "actualFileSha256": file_hash(capture_path),
                "detailedStateTraceSha256": trace.get("traceSha256"),
                "parentActionTraceSha256": metadata["baseline"]["traceSha256"],
            }
            raise RuntimeError("Captured trace validation mismatch: " + __import__("json").dumps(diagnostics))
        if file_hash(SAVE) != SAVE_SHA256:
            raise RuntimeError("Protected user save changed during capture")
        report = {
            "format": "private-statehead-parent-neural-input-capture-v1",
            "passed": True,
            "learningSucceeded": False,
            "approvedForApp": False,
            "appVersion": metadata["appVersion"],
            "parentSha256": metadata["parentSha256"],
            "parentResult": trace["result"],
            "parentActionTraceSha256": metadata["baseline"]["traceSha256"],
            "capturedDetailedStateTraceSha256": trace["traceSha256"],
            "controls": trace["controls"],
            "capture": {**capture, "fileSha256": file_hash(capture_path)},
            "basisSha256": metadata["gateBasisSha256"],
            "basisFileSha256": file_hash(basis_path),
            "preflightSha256": file_hash(PREFLIGHT),
            "sourceHashes": {
                "work/capture_statehead_parent_inputs.py": file_hash(ROOT / "work/capture_statehead_parent_inputs.py"),
                "work/statehead-reward-gate-env.cjs": file_hash(ROOT / "work/statehead-reward-gate-env.cjs"),
                "work/neural-statehead-rl-live.cjs": file_hash(ROOT / "work/neural-statehead-rl-live.cjs"),
            },
            "cuda": environment.request("stats"),
            "originalSaveSha256": file_hash(SAVE),
            "wallSeconds": time.monotonic() - started,
            "boundary": "One deterministic protected-parent replay captured the actual 516-value state-head inputs with progress as an offline row label. No route coordinates were included in the model input; no model was trained, app/save was changed, or candidate promoted.",
        }
        atomic_json(OUT / "report.json", report)
        atomic_json(OUT / "progress.json", {"phase": "finished", "passed": True})
        print(__import__("json").dumps(report, ensure_ascii=False))
    except BaseException as error:
        atomic_json(OUT / "failure.json", {"error": repr(error)})
        raise
    finally:
        if environment is not None:
            environment.close()


if __name__ == "__main__":
    main()
