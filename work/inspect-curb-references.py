"""Read-only PDF inspection; raster proofs are not app assets."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'python-deps'))
import pymupdf as pdf
from PIL import Image,ImageDraw
base=Path(__file__).resolve().parent.parent/'tmp/pdfs/curb-references'
for name in ['monaco-notes-2025-v2','monza-notes-2025-v1','lemans-briefing-2025']:
    doc=pdf.open(base/(name+'.pdf'))
    cols=4;rows=(len(doc)+cols-1)//cols;sheet=Image.new('RGB',(cols*350,rows*255),'#d8dce0');draw=ImageDraw.Draw(sheet)
    for i,page in enumerate(doc):
        pix=page.get_pixmap(matrix=pdf.Matrix(1,1));img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);img.thumbnail((344,231))
        x=(i%cols)*350+(350-img.width)//2;y=(i//cols)*255+22;sheet.paste(img,(x,y));draw.text(((i%cols)*350+5,(i//cols)*255+3),str(i+1),fill='black')
    sheet.save(base/(name+'-contact.png'))
    print(name,len(doc),str(base/(name+'-contact.png')))
    selected={'monza-notes-2025-v1':[5,6,7],'monaco-notes-2025-v2':[2,4],'lemans-briefing-2025':[17,18,19,21,22,32,47]}[name]
    for i in selected:
        doc[i].get_pixmap(matrix=pdf.Matrix(1.5,1.5)).save(base/(name+'-p'+str(i+1)+'.png'))
        if name!='lemans-briefing-2025':print(name,'PAGE',i+1,doc[i].get_text())
