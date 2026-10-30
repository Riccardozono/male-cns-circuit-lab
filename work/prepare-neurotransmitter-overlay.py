"""Extract official predicted transmitter labels for an isolated dynamics study."""
from collections import Counter
from pathlib import Path
import hashlib
import json
import math
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.feather as feather

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / '.impeccable/review/neurotransmitter-source-20261022-01'
SOURCE = FOLDER / 'body-neurotransmitters-male-cns-v1.0.feather'
TARGET = FOLDER / 'v3-transmitter-overlay.json'
URL = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-neurotransmitters-male-cns-v1.0.feather'


def main():
    data = json.loads((ROOT / 'outputs/data/connectome.json').read_text(encoding='utf-8'))
    ids = [node['bodyId'] for node in data['nodes']]
    columns = ['body', 'consensus_nt', 'predicted_nt', 'predicted_nt_confidence', 'ground_truth']
    table = feather.read_table(SOURCE, columns=columns)
    subset = table.filter(pc.is_in(table['body'], value_set=pa.array(ids, type=pa.int64())))
    rows = subset.to_pylist()
    by_id = {row['body']: row for row in rows}
    if len(by_id) != len(rows):
        raise ValueError('Duplicate body IDs in the official transmitter subset')
    nodes = []
    for body_id in ids:
        row = by_id.get(body_id, {})
        confidence = row.get('predicted_nt_confidence')
        if confidence is not None and not math.isfinite(confidence):
            confidence = None
        nodes.append({'bodyId': body_id, 'consensus': row.get('consensus_nt'),
                      'individualPrediction': row.get('predicted_nt'), 'individualConfidence': confidence,
                      'groundTruth': row.get('ground_truth')})
    report = {
        'format': 'male-cns-transmitter-overlay-v1',
        'source': {'url': URL, 'page': 'https://male-cns.janelia.org/download/',
                   'license': 'CC-BY-4.0', 'bytes': SOURCE.stat().st_size,
                   'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
        'dataset': 'male-cns:v1.0', 'nodeCount': len(ids), 'matchedRows': len(rows),
        'consensusCounts': dict(Counter(node['consensus'] or 'missing' for node in nodes)),
        'boundary': 'Official transmitter predictions joined by original body ID. Predictions do not establish synaptic receptor effects. Computational sign assignments are separate experimental hypotheses; the released graph and user saves are not changed.',
        'nodes': nodes,
    }
    with TARGET.open('x', encoding='utf-8', newline='\n') as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False, allow_nan=False)
        handle.write('\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'nodes'}, indent=2))
    print(str(TARGET))


if __name__ == '__main__':
    main()
