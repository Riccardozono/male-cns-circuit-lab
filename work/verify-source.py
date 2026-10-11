"""Independent check against the original downloaded Feather, not the extraction cache."""
from pathlib import Path
import sys,json
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'work/python-deps'))
import numpy as np
import pyarrow as pa
import pyarrow.feather as feather
d=json.loads((ROOT/'outputs/data/connectome.json').read_text(encoding='utf-8'))
ids=np.array([n['bodyId'] for n in d['nodes']])
expected={(int(ids[a]),int(ids[b]),w) for a,b,w in d['edges']}
assert len(expected)==len(d['edges'])
found=set()
reader=pa.ipc.open_file(pa.memory_map(str(ROOT/'work/source-data/connectome-weights-male-cns-v1.0-minconf-0.5.feather')))
for i in range(reader.num_record_batches):
    batch=reader.get_batch(i)
    a,b,w=(batch.column(k).to_numpy() for k in range(3))
    keep=w>=5
    if not keep.any(): continue
    a,b,w=a[keep],b[keep],w[keep]
    keep=np.isin(a,ids)&np.isin(b,ids)
    found.update((int(x),int(y),int(z)) for x,y,z in zip(a[keep],b[keep],w[keep]))
assert expected==found, (len(expected-found),len(found-expected))
annotations=feather.read_table(ROOT/'work/source-data/body-annotations-male-cns-v1.0-minconf-0.5.feather').to_pylist()
original={r['bodyId']:r for r in annotations}
for n in d['nodes']:
    for key in ['type','instance','superclass']:
        assert n[key]==original[n['bodyId']][key]
    assert n['side']==original[n['bodyId']]['somaSide']
    expected_position=original[n['bodyId']]['somaLocation']
    assert n['position']==([int(v) for v in expected_position] if expected_position else None)
result={'verified':True,'method':'Independent scan of original official Feather files; exact equality of all induced edges >=5 and every exported annotation.',
        'nodesVerified':len(d['nodes']),'coordinatesVerified':sum(n['position'] is not None for n in d['nodes']),'coordinatesMissing':sum(n['position'] is None for n in d['nodes']),'edgesVerified':len(found),'synapsesVerified':sum(w for a,b,w in found),'missingEdges':0,'extraEdges':0,'alteredAnnotations':0}
(ROOT/'outputs/data/source-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
