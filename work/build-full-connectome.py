"""Build the complete annotated MaleCNS v1.0 runtime graph.

The browser bundle contains every annotated neuron and every directed edge with
at least five anatomical synapses from the already verified official Feather
exports. Arrays are stored little-endian and aligned so JavaScript can expose
them directly as typed-array views without copying or parsing a huge JSON file.
"""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "work" / "python-deps"))

import numpy as np
import pyarrow.feather as feather

SOURCE = ROOT / "work" / "source-data"
OUT = ROOT / "outputs" / "data"
ANNOTATIONS = SOURCE / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
EDGE_CACHE = SOURCE / "strong-annotated-edges.npz"
SUBSET = OUT / "connectome.json"
BINARY = OUT / "connectome-full.bin"
METADATA = OUT / "connectome-full.json"
MISSING_POSITION = np.iinfo(np.int32).min


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


rows = feather.read_table(
    ANNOTATIONS,
    columns=["bodyId", "type", "instance", "superclass", "somaSide", "somaLocation"],
).to_pylist()
rows = sorted((row for row in rows if row["superclass"]), key=lambda row: row["bodyId"])
node_count = len(rows)
body_ids_i64 = np.asarray([row["bodyId"] for row in rows], dtype=np.int64)
assert node_count == 166700
assert np.all(body_ids_i64[1:] > body_ids_i64[:-1])

body_ids = body_ids_i64.astype("<f8")
positions = np.full((node_count, 3), MISSING_POSITION, dtype="<i4")
for index, row in enumerate(rows):
    if row["somaLocation"] is not None:
        positions[index] = np.asarray(row["somaLocation"], dtype=np.int32)

class_names = sorted({row["superclass"] for row in rows})
class_index = {name: index for index, name in enumerate(class_names)}
class_codes = np.asarray([class_index[row["superclass"]] for row in rows], dtype=np.uint8)
side_codes = np.asarray(
    [-1 if row["somaSide"] == "L" else 1 if row["somaSide"] == "R" else 0 for row in rows],
    dtype=np.int8,
)

cache = np.load(EDGE_CACHE)
pre_body, post_body, synapse_counts = (cache[name] for name in ("pre", "post", "weight"))
pre = np.searchsorted(body_ids_i64, pre_body).astype(np.uint32)
post = np.searchsorted(body_ids_i64, post_body).astype(np.uint32)
assert np.array_equal(body_ids_i64[pre], pre_body)
assert np.array_equal(body_ids_i64[post], post_body)

order = np.lexsort((post, pre))
pre = pre[order]
post = post[order]
synapse_counts = synapse_counts[order]
edge_count = len(pre)
assert edge_count == 6242118

incoming = np.bincount(post, weights=synapse_counts, minlength=node_count)
weights = (synapse_counts / incoming[post]).astype("<f4")
targets = post.astype("<u4", copy=False)
row_offsets = np.empty(node_count + 1, dtype="<u4")
row_offsets[0] = 0
np.cumsum(np.bincount(pre, minlength=node_count), out=row_offsets[1:])
assert int(row_offsets[-1]) == edge_count

subset = json.loads(SUBSET.read_text(encoding="utf-8"))
subset_provenance = json.loads((OUT / "provenance.json").read_text(encoding="utf-8"))
subset_bodies = np.asarray([node["bodyId"] for node in subset["nodes"]], dtype=np.int64)
core_indices = np.searchsorted(body_ids_i64, subset_bodies).astype(np.uint32)
assert np.array_equal(body_ids_i64[core_indices], subset_bodies)
core_mask = np.zeros(node_count, dtype=np.uint8)
core_mask[core_indices] = 1
subset_input_bodies = np.asarray(
    [subset["nodes"][index]["bodyId"] for index in subset["inputIndices"]], dtype=np.int64
)
subset_output_bodies = np.asarray(
    [subset["nodes"][index]["bodyId"] for index in subset["outputIndices"]], dtype=np.int64
)
input_indices = np.searchsorted(body_ids_i64, subset_input_bodies).astype(np.uint32)
output_indices = np.searchsorted(body_ids_i64, subset_output_bodies).astype(np.uint32)
assert np.array_equal(body_ids_i64[input_indices], subset_input_bodies)
assert np.array_equal(body_ids_i64[output_indices], subset_output_bodies)

row_by_body = {row["bodyId"]: row for row in rows}
output_nodes = []
for index, body_id in zip(output_indices.tolist(), subset_output_bodies.tolist()):
    row = row_by_body[body_id]
    output_nodes.append(
        {
            "index": index,
            "bodyId": body_id,
            "type": row["type"],
            "instance": row["instance"],
            "side": row["somaSide"],
            "superclass": row["superclass"],
        }
    )

arrays = {}
with BINARY.open("wb") as stream:
    def append(name, array):
        while stream.tell() % 8:
            stream.write(b"\0")
        offset = stream.tell()
        array.tofile(stream)
        arrays[name] = {
            "offset": offset,
            "length": int(array.size),
            "dtype": str(array.dtype),
        }

    append("bodyIds", body_ids)
    append("positions", positions.reshape(-1))
    append("classCodes", class_codes)
    append("sideCodes", side_codes)
    append("coreMask", core_mask)
    append("rowOffsets", row_offsets)
    append("targets", targets)
    append("weights", weights)

metadata = {
    "schemaVersion": 1,
    "modelRevision": 4,
    "dataset": "male-cns:v1.0",
    "license": "CC-BY-4.0",
    "credit": "MaleCNS consortium: FlyEM (HHMI Janelia), University of Cambridge, MRC LMB, Google Research",
    "sourcePage": "https://male-cns.janelia.org/download/",
    "sources": subset_provenance["sources"],
    "edgeCacheSha256": sha256(EDGE_CACHE),
    "binary": BINARY.name,
    "binaryBytes": BINARY.stat().st_size,
    "binarySha256": sha256(BINARY),
    "nodeCount": node_count,
    "edgeCount": edge_count,
    "synapseCount": int(synapse_counts.sum()),
    "minimumSynapseCount": 5,
    "coordinateCount": int(np.count_nonzero(positions[:, 0] != MISSING_POSITION)),
    "coreNodeCount": int(core_mask.sum()),
    "missingPositionValue": int(MISSING_POSITION),
    "classNames": class_names,
    "inputIndices": input_indices.tolist(),
    "outputIndices": output_indices.tolist(),
    "outputNodes": output_nodes,
    "arrays": arrays,
    "solver": {
        "kind": "event-driven sparse rate reservoir",
        "iterationsPerControlTick": 1,
        "activityThreshold": 0.001,
        "edgeContributionThreshold": 0.000001,
        "activeNeuronBudget": 4096,
    },
    "selection": "All 166,700 rows with an official superclass annotation. All official directed connections between those neurons with at least 5 anatomical synapses. Sensor relay and DNa01/DNa02 output identities are retained from the audited v3 driving subset.",
    "modelBoundary": "Complete annotated >=5-synapse MaleCNS graph, but not a biological brain emulation. Runtime activity is an artificial unsigned normalized-rate approximation with an event-driven active-neuron budget; sensor injection, vehicle-physics channels and evolved motor decoding are artificial. Neurotransmitters, membrane physiology and synapse timing are not simulated.",
}
METADATA.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")

print(json.dumps({
    "nodes": node_count,
    "edges": edge_count,
    "synapses": int(synapse_counts.sum()),
    "coordinates": metadata["coordinateCount"],
    "binaryBytes": metadata["binaryBytes"],
    "binarySha256": metadata["binarySha256"],
}, indent=2))
