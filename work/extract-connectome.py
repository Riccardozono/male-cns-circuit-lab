"""Reproducible official MaleCNS subset. Dependencies are isolated in work/python-deps.
No synapses, neuron IDs, annotations or synapse counts are invented.
"""
from pathlib import Path
import hashlib
import json
import sys
sys.path.insert(0, str(Path(__file__).parent / 'python-deps'))
import numpy as np
import pyarrow as pa
import pyarrow.feather as feather

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'work/source-data'
OUT = ROOT / 'outputs/data'
OUT.mkdir(parents=True, exist_ok=True)
ANNOTATIONS = 'body-annotations-male-cns-v1.0-minconf-0.5.feather'
WEIGHTS = 'connectome-weights-male-cns-v1.0-minconf-0.5.feather'
BASE = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/'
rows = feather.read_table(SOURCE / ANNOTATIONS, columns=['bodyId','type','instance','superclass','somaSide','somaLocation']).to_pylist()
annotations = {r['bodyId']:r for r in rows if r['superclass']}
valid = np.array(sorted(annotations), dtype=np.int64)
cache = SOURCE / 'strong-annotated-edges.npz'
if cache.exists():
    arrays=np.load(cache); pre,post,weight=(arrays[k] for k in ['pre','post','weight'])
else:
    chunks=[]
    reader=pa.ipc.open_file(pa.memory_map(str(SOURCE / WEIGHTS)))
    total=0
    for i in range(reader.num_record_batches):
        batch=reader.get_batch(i)
        a,b,w=(batch.column(k).to_numpy() for k in range(3))
        total+=len(a)
        strong=w>=5
        a,b,w=a[strong],b[strong],w[strong]
        known=np.isin(a,valid) & np.isin(b,valid)
        if known.any(): chunks.append(np.column_stack([a[known],b[known],w[known]]))
        if i%400==0: print(f'Filtering batch {i}/{reader.num_record_batches}',flush=True)
    joined=np.concatenate(chunks)
    pre,post,weight=(joined[:,k] for k in range(3))
    np.savez(cache,pre=pre,post=post,weight=weight)
    print(f'Scanned {total} original edges; retained {len(pre)} annotated edges >=5',flush=True)

# Expanded runtime graph: retain a wider, still auditable upstream neighborhood
# around the same four DNa01/DNa02 outputs. Counts are selection caps, not
# invented neurons; every retained ID and >=5-synapse edge comes from the
# official Feather files below.
FIRST_SHELL_COUNT=60
SECOND_SHELL_COUNT=3000
VISUAL_SHELL_COUNT=4500
MAX_INPUT_COUNT=1200
SHELL_CLASSES={'cb_intrinsic','visual_projection','descending_neuron','visual_centrifugal',
               'ascending_neuron','cb_efferent','cb_motor','efferent_ascending',
               'efferent_descending'}
outputs=sorted(r['bodyId'] for r in rows if r['type'] in ['DNa01','DNa02'])
assert len(outputs)==4
strong_annotated_mask=np.isin(pre,valid)&np.isin(post,valid)
strong_annotated_node_count=len(valid)
strong_annotated_edge_count=int(strong_annotated_mask.sum())
strong_annotated_synapse_count=int(weight[strong_annotated_mask].sum())
full_reachable=set(outputs)
while True:
    previous=len(full_reachable)
    upstream_mask=np.isin(post,np.fromiter(full_reachable,dtype=np.int64))
    full_reachable |= set(np.unique(pre[upstream_mask]).tolist()) & set(annotations)
    if len(full_reachable)==previous: break
full_closure_mask=np.isin(pre,np.fromiter(full_reachable,dtype=np.int64))&np.isin(post,np.fromiter(full_reachable,dtype=np.int64))
full_upstream_node_count=len(full_reachable)
full_upstream_edge_count=int(full_closure_mask.sum())
full_upstream_synapse_count=int(weight[full_closure_mask].sum())
selected=set(outputs)
def upstream(targets, count, classes=None):
    mask=np.isin(post,list(targets)) & ~np.isin(pre,list(selected))
    ids,inv=np.unique(pre[mask], return_inverse=True)
    strengths=np.bincount(inv,weights=weight[mask])
    candidates=sorted(zip(ids.tolist(),strengths.tolist()),key=lambda x:(-x[1],x[0]))
    return [i for i,s in candidates if classes is None or annotations[i]['superclass'] in classes][:count]

# Balanced first shell: strongest 60 inputs per descending neuron.
first=set()
for target in outputs: first.update(upstream([target],FIRST_SHELL_COUNT))
selected.update(first)
second=upstream(first,SECOND_SHELL_COUNT,SHELL_CLASSES)
selected.update(second)
visual=upstream(first|set(second),VISUAL_SHELL_COUNT,{'visual_projection'})
selected.update(visual)
ids=sorted(selected)
mask=np.isin(pre,ids) & np.isin(post,ids)
edges=[(int(a),int(b),int(w)) for a,b,w in zip(pre[mask],post[mask],weight[mask])]
# Remove any accidental dead-end branch. Every exported neuron can reach an output.
reachable=set(outputs)
while True:
    nxt=reachable | {a for a,b,w in edges if b in reachable}
    if nxt==reachable: break
    reachable=nxt
ids=sorted(selected & reachable)
index={body:i for i,body in enumerate(ids)}
nodes=[{'bodyId':body,'type':annotations[body]['type'],'instance':annotations[body]['instance'],
        'superclass':annotations[body]['superclass'],'side':annotations[body]['somaSide'],
        'position':[int(v) for v in annotations[body]['somaLocation']] if annotations[body]['somaLocation'] else None} for body in ids]
mask=np.isin(pre,ids) & np.isin(post,ids)
edge_rows=[(int(a),int(b),int(w)) for a,b,w in zip(pre[mask],post[mask],weight[mask])]
visual_strength={body:0 for body in ids if annotations[body]['superclass']=='visual_projection'}
for a,b,w in edge_rows:
    if a in visual_strength: visual_strength[a]+=w
input_bodies=sorted(visual_strength,key=lambda body:(-visual_strength[body],body))[:MAX_INPUT_COUNT]
input_indices=sorted(index[body] for body in input_bodies)
edges=sorted([[index[a],index[b],w] for a,b,w in edge_rows])
assert input_indices and edges
assert not set(input_indices)&{index[b] for b in outputs}
def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as stream:
        while chunk:=stream.read(1024*1024): h.update(chunk)
    return h.hexdigest()
sources=[{'file':name,'url':BASE+name,'bytes':(SOURCE/name).stat().st_size,'sha256':sha(SOURCE/name)} for name in [ANNOTATIONS,WEIGHTS]]
data={'schemaVersion':1,'modelRevision':3,'dataset':'male-cns:v1.0','license':'CC-BY-4.0',
      'credit':'MaleCNS consortium: FlyEM (HHMI Janelia), University of Cambridge, MRC LMB, Google Research',
      'sourcePage':'https://male-cns.janelia.org/download/','sources':sources,
      'selection':f'DNa01/DNa02; top {FIRST_SHELL_COUNT} incoming neurons per output; top {SECOND_SHELL_COUNT} incoming neurons from the expanded central/visual/descending shell; top {VISUAL_SHELL_COUNT} visual_projection inputs into the first two shells; top {MAX_INPUT_COUNT} visual_projection nodes by induced outgoing synapse count receive sensors. Classes: {sorted(SHELL_CLASSES)}. All induced edges with >=5 synapses; remove nodes without a directed path to an output. Ties by bodyId. Each node includes the official somaLocation [x,y,z] for the 3D atlas.',
      'modelBoundary':'Real IDs, annotations, directed edges and integer synapse counts. Reduced subset, not whole brain. Unsigned normalized rate dynamics, sensor injection and evolved motor decoding are artificial, not validated biology. Neurotransmitters and physiology are not simulated.',
      'nodes':nodes,'edges':edges,'inputIndices':input_indices,'outputIndices':[index[b] for b in outputs]}
serialized=json.dumps(data,separators=(',',':'),ensure_ascii=False,allow_nan=False)
(OUT/'connectome.json').write_text(serialized,encoding='utf-8')
(OUT/'connectome.js').write_text('/* Official MaleCNS subset; see connectome.json for provenance. */\nglobalThis.MALE_CNS_DATA = '+serialized+';\n',encoding='utf-8')
manifest={k:v for k,v in data.items() if k not in ['nodes','edges','inputIndices','outputIndices']}
manifest.update(nodeCount=len(nodes),edgeCount=len(edges),synapseCount=sum(e[2] for e in edges),inputCount=len(input_indices),outputs=[nodes[index[b]] for b in outputs],subsetSha256=sha(OUT/'connectome.json'),
               annotatedNodeCount=strong_annotated_node_count,annotatedStrongEdgeCount=strong_annotated_edge_count,annotatedStrongSynapseCount=strong_annotated_synapse_count,
               fullUpstreamNodeCount=full_upstream_node_count,fullUpstreamEdgeCount=full_upstream_edge_count,fullUpstreamSynapseCount=full_upstream_synapse_count)
(OUT/'provenance.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({k:manifest[k] for k in ['nodeCount','edgeCount','synapseCount','inputCount','subsetSha256']},indent=2),flush=True)
