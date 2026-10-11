import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'python-deps'))
import fitz
base=Path(__file__).parent/'maps'
for name,page in [('monza',0),('monaco',1),('lemans',None)]:
    doc=fitz.open(base/(name+'.pdf'))
    if page is None:
        for i,p in enumerate(doc):
            if 'CIRCUIT MAP' in p.get_text().upper(): print(name,'map page',i,p.get_text()[:240])
        continue
    p=doc[page];p.get_pixmap(matrix=fitz.Matrix(2,2)).save(base/(name+'.png'))
    draws=p.get_drawings()
    summary=[]
    for i,d in enumerate(draws):
        if len(d['items'])>10 or (d['rect'].width>200 and d['rect'].height>150):
            summary.append({'id':i,'items':len(d['items']),'rect':list(d['rect']),'stroke':d['color'],'fill':d['fill'],'width':d['width'],'close':d['closePath']})
    (base/(name+'-paths.json')).write_text(json.dumps(summary,indent=2))
    print(name,'size',p.rect,'draws',len(draws),'candidates',len(summary))
