import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'python-deps'))
import numpy as np
import pyarrow.feather as feather

root=Path(__file__).resolve().parent.parent
rows=feather.read_table(root/'work/source-data/body-annotations-male-cns-v1.0-minconf-0.5.feather',columns=['bodyId','type','instance','superclass','somaSide']).to_pylist()
annotations={r['bodyId']:r for r in rows if r['superclass']}
z=np.load(root/'work/source-data/strong-annotated-edges.npz');pre,post,weight=(z[k] for k in ['pre','post','weight'])
outputs=sorted(r['bodyId'] for r in rows if r['type'] in ['DNa01','DNa02'])
def measure(first_count,second_count,visual_count,allowed):
    selected=set(outputs)
    def upstream(targets,count,classes=None):
        mask=np.isin(post,list(targets)) & ~np.isin(pre,list(selected))
        ids,inv=np.unique(pre[mask],return_inverse=True)
        strengths=np.bincount(inv,weights=weight[mask])
        candidates=sorted(zip(ids.tolist(),strengths.tolist()),key=lambda x:(-x[1],x[0]))
        return [i for i,s in candidates if classes is None or annotations[i]['superclass'] in classes][:count]
    first=set()
    for target in outputs:first.update(upstream([target],first_count))
    selected.update(first)
    second=upstream(first,second_count,allowed);selected.update(second)
    visual=upstream(first|set(second),visual_count,{'visual_projection'});selected.update(visual)
    ids=sorted(selected);mask=np.isin(pre,ids)&np.isin(post,ids)
    edges=[(int(a),int(b),int(w)) for a,b,w in zip(pre[mask],post[mask],weight[mask])]
    reachable=set(outputs)
    while True:
        nxt=reachable|{a for a,b,w in edges if b in reachable}
        if nxt==reachable:break
        reachable=nxt
    ids=sorted(selected&reachable)
    emask=np.isin(pre,ids)&np.isin(post,ids)
    edges=[(int(a),int(b),int(w)) for a,b,w in zip(pre[emask],post[emask],weight[emask])]
    classes={x:sum(annotations[i]['superclass']==x for i in ids) for x in sorted({annotations[i]['superclass'] for i in ids})}
    return len(ids),len(edges),int(sum(e[2] for e in edges)),classes
allowed={'cb_intrinsic','visual_projection','descending_neuron','visual_centrifugal','ascending_neuron','cb_efferent','cb_motor','efferent_ascending','efferent_descending'}
for spec in [(20,120,160),(40,240,320),(60,400,500),(60,1200,1800),(60,2000,3000),(60,3000,4500),(100,800,1200),(120,1000,1600),(160,1400,2200),(200,1800,2800),(240,2200,3500),(300,3000,4500)]:
    print(spec,measure(*spec,allowed))
