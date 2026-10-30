"""Compare Math.tanh on recorded V3 sums across the actual local runtimes.

This is a finite numerical diagnostic, not a full-episode equivalence proof.
No session, model, runtime, driver or source file is changed.
"""
import hashlib
import json
import math
import os
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / ".impeccable/review/neural-sacl/neuronal-cuda-pass-inputs"
OUT = ROOT / ".impeccable/review/learning-ml/v3-electron-node-math-20261027-107"
NODE = ROOT / ".impeccable/runtime-node24/node.exe"
ELECTRON = ROOT / "node_modules/electron/dist/electron.exe"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    return digest(path.read_bytes())


def run(executable, javascript, electron=False):
    env = os.environ.copy()
    env["MALECNS_FIXTURE_DIR_107"] = str(FIXTURES)
    if electron:
        env["ELECTRON_RUN_AS_NODE"] = "1"
    else:
        env.pop("ELECTRON_RUN_AS_NODE", None)
    result = subprocess.run([str(executable), "-e", javascript], cwd=ROOT,
                            env=env, capture_output=True, check=True, timeout=60)
    return result.stdout


def main():
    if OUT.exists():
        raise RuntimeError("Refuse to replace the previous diagnostic")
    metadata_file = FIXTURES / "metadata.json"
    metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
    assert metadata["n"] == 7721 and len(metadata["states"]) == 8
    assert file_hash(NODE) == "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237"
    inputs = [record["sum"] for state in metadata["states"] for record in state["expected"]]
    assert len(inputs) == 32
    data = []
    for name in inputs:
        path = FIXTURES / name
        raw = path.read_bytes()
        assert len(raw) == metadata["n"] * 8
        assert digest(raw) == metadata["files"][name]["sha256"]
        data.append(raw)
    version_js = "process.stdout.write(JSON.stringify({node:process.versions.node,v8:process.versions.v8,electron:process.versions.electron||null}))"
    versions = [json.loads(run(exe, version_js, electron))
                for exe, electron in [(NODE, False), (ELECTRON, True)]]
    math_js = r"""
      const fs=require('fs'),path=require('path'),dir=process.env.MALECNS_FIXTURE_DIR_107;
      const m=JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8'));
      const names=m.states.flatMap(s=>s.expected.map(x=>x.sum));
      for(const name of names) {
        const input=fs.readFileSync(path.join(dir,name)),output=Buffer.allocUnsafe(input.length);
        for(let i=0;i<input.length;i+=8)output.writeDoubleLE(Math.tanh(input.readDoubleLE(i)),i);
        process.stdout.write(output);
      }
    """
    node_out = run(NODE, math_js)
    electron_out = run(ELECTRON, math_js, True)
    assert len(node_out) == len(electron_out) == len(inputs) * metadata["n"] * 8
    unequal = 0
    max_abs = 0.0
    examples = []
    for index, (node_value, electron_value) in enumerate(zip(
            struct.iter_unpack("<d", node_out), struct.iter_unpack("<d", electron_out))):
        a, b = node_value[0], electron_value[0]
        assert math.isfinite(a) and math.isfinite(b)
        start = index * 8
        if node_out[start:start + 8] != electron_out[start:start + 8]:
            unequal += 1
            max_abs = max(max_abs, abs(a - b))
            if len(examples) < 4:
                examples.append({"file": inputs[index // metadata["n"]], "index": index % metadata["n"],
                                 "node": a, "electron": b})
    result = {
        "passed": True,
        "equivalentOnRecordedValues": unequal == 0,
        "values": len(node_out) // 8,
        "differentFloat64BitPatterns": unequal,
        "maxAbsoluteDifference": max_abs,
        "examples": examples,
        "versions": versions,
        "nodeExecutableSha256": file_hash(NODE),
        "electronExecutableSha256": file_hash(ELECTRON),
        "fixtureMetadataSha256": file_hash(metadata_file),
        "inputSumsSha256": digest(b"".join(data)),
        "nodeOutputSha256": digest(node_out),
        "electronOutputSha256": digest(electron_out),
        "runnerSha256": file_hash(Path(__file__)),
        "boundary": "Finite Math.tanh comparison on 32 stored sum vectors derived from eight historically reached V3 states and additional fixed-input iterations. It is not a GPU runtime test, a current-save replay, full-electron numerical equivalence, a performance measurement or a claim of learned driving.",
    }
    OUT.mkdir()
    target = OUT / "report.json"
    with target.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"report": str(target), "sha256": file_hash(target), **result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
