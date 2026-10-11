"""Read-only inspection of existing primary-source maps, not a survey."""
import sys, json, math, re
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'work/python-deps'))
import pymupdf as pdf
for name,page in [('monza.pdf',0),('monaco.pdf',1),('lemans-regulations.pdf',150)]:
    doc=pdf.open(ROOT/'work/maps'/name)
    p=doc[page]
    drawings=p.get_drawings()
    print(json.dumps({'file':name,'page':page+1,'size':[p.rect.width,p.rect.height],'drawings':len(drawings),'images':len(p.get_images()),'measurementText':[s for s in p.get_text().splitlines() if re.search(r'width|largeur|length|longueur|metri|[0-9]+\s*m\b',s,re.I)]},ensure_ascii=False))
    if name=='monaco.pdf':
        strip=[d for d in drawings if d['fill'] and .86<d['fill'][0]<.87]
        print('MONACO FIRST TRIANGLES',repr([d['items'] for d in strip[:4]]))
        widths=[math.hypot(d['items'][0][1].x-d['items'][0][2].x,d['items'][0][1].y-d['items'][0][2].y) for d in strip[::2]]
        print('MONACO DRAWING WIDTH UNITS',min(widths),max(widths),sorted(widths)[len(widths)//2])
    elif name=='monza.pdf':
        for i,d in enumerate(drawings[:8]):print('MONZA PATH',i,d['type'],d['width'],d['color'],d['fill'],len(d['items']),d['rect'])
