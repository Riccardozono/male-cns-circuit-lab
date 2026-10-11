"""Source-map centerlines calibrated in metres; explicitly estimated local widths.
No axis stretching, route smoothing, policy assistance or measured-width claim.
Run this generator to reproduce both offline catalogs and the geometry report.
"""
import sys,json,math,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'work/python-deps'))
import pymupdf as pdf
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
from shapely.validation import explain_validity
from shapely import set_precision

PROFILES=json.loads((ROOT/'work/track-width-profiles.json').read_text(encoding='utf-8'))

def variable_corridor(points,profile,source_scale,source_low):
    line=LineString(points+[points[0]])
    anchors=[]
    for label,x,y,width in profile['stations']:
        probe=Point((x-source_low[0])*source_scale+140,(y-source_low[1])*source_scale+140)
        along=line.project(probe)
        pose=line.interpolate(along)
        anchors.append({'label':label,'alongMeters':along,'widthMeters':width,
                        'x':pose.x,'y':pose.y,'estimated':True})
    # The first station is the actual start line, not a near-by projection.
    anchors[0].update(alongMeters=0,x=points[0][0],y=points[0][1])
    anchors.sort(key=lambda a:a['alongMeters'])
    assert all(b['alongMeters']-a['alongMeters']>.1 for a,b in zip(anchors,anchors[1:]))
    def width_at(along):
        left=next((i-1 for i,a in enumerate(anchors) if a['alongMeters']>along),len(anchors)-1)
        a=anchors[left];b=anchors[(left+1)%len(anchors)]
        end=b['alongMeters'] if left+1<len(anchors) else line.length
        t=max(0,min(1,(along-a['alongMeters'])/(end-a['alongMeters'])))
        t=t*t*(3-2*t)  # C1 periodic transitions, no sudden steps in road width.
        return a['widthMeters']+(b['widthMeters']-a['widthMeters'])*t
    chainages=[0]
    for a,b in zip(points,points[1:]):chainages.append(chainages[-1]+distance(a,b))
    widths=[width_at(s) for s in chainages]
    pieces=[]
    for i,(a,b) in enumerate(zip(points,points[1:]+points[:1])):
        length=distance(a,b);nx=-(b[1]-a[1])/length;ny=(b[0]-a[0])/length
        ha=widths[i]/2;hb=widths[(i+1)%len(points)]/2
        pieces.append(Polygon([(a[0]+nx*ha,a[1]+ny*ha),(b[0]+nx*hb,b[1]+ny*hb),
                               (b[0]-nx*hb,b[1]-ny*hb),(a[0]-nx*ha,a[1]-ny*ha)]))
        pieces.append(Point(a).buffer(ha,quad_segs=8))
    # Snap with topology preservation BEFORE serializing: naive decimal
    # rounding can turn microscopic union slivers into self-intersections.
    corridor=set_precision(unary_union(pieces),1e-6).simplify(.015,preserve_topology=True)
    # Micrometre grid snapping can leave nanometric holes between coincident
    # joins. Remove ONLY sub-square-millimetre artefacts, never a real infield.
    if corridor.geom_type=='Polygon':
        corridor=Polygon(corridor.exterior,[r for r in corridor.interiors if Polygon(r).area>=1e-6])
    assert corridor.is_valid and corridor.geom_type=='Polygon' and len(corridor.interiors)==1, f"{profile['lengthMeters']}: {explain_validity(corridor)}; type={corridor.geom_type}; hole areas={[Polygon(r).area for r in corridor.interiors] if corridor.geom_type=='Polygon' else 'multi'}"
    assert corridor.covers(line)
    for i,a in enumerate(anchors):
        a['endMeters']=anchors[i+1]['alongMeters'] if i+1<len(anchors) else line.length
    return corridor,widths,anchors

def distance(a,b):return math.hypot(a[0]-b[0],a[1]-b[1])
def densify(points,step=1.5):
    out=[]
    for a,b in zip(points,points[1:]+points[:1]):
        count=max(1,math.ceil(distance(a,b)/step))
        for j in range(count):out.append([a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count])
    return out
def bezier(items):
    points=[]
    for item in items:
        ps=[list(p) for p in item[1:]]
        if item[0]=='c':
            count=max(3,math.ceil(sum(distance(a,b) for a,b in zip(ps,ps[1:]))/6))
            for j in range(count):
                t=j/count;u=1-t
                points.append([u**3*ps[0][k]+3*u*u*t*ps[1][k]+3*u*t*t*ps[2][k]+t**3*ps[3][k] for k in [0,1]])
        elif item[0]=='l': points.append(ps[0])
    points.append(list(items[-1][-1]));return points

monza=bezier(pdf.open(ROOT/'work/maps/monza.pdf')[0].get_drawings()[2]['items'])
# The official cartographic path has a short break where the historic oval passes over it.
# Closing that gap restores the uninterrupted GP Serraglio straight; the oval is not used.
monaco_draws=pdf.open(ROOT/'work/maps/monaco.pdf')[1].get_drawings()
strip=[d for d in monaco_draws if d['fill'] and .86<d['fill'][0]<.87]
assert len(strip)==986
monaco=[]
for i in range(0,len(strip),2):
    a,b=strip[i]['items'][0][1:]
    monaco.append([(a.x+b.x)/2,(a.y+b.y)/2])
assert max(distance(a,b) for a,b in zip(monaco,monaco[1:]+monaco[:1]))<20
# Centerline manually digitized from the 2x rendering of ACO 2025 regulations, p151.
# This is an approximation of the observed raster, never surveyed/geospatial data.
lemans=[
 [315,1440],[295,1438],[275,1433],[259,1426],[247,1412],[238,1396],[233,1391],[225,1394],
 [218,1384],[209,1370],[199,1359],[190,1350],[185,1341],[183,1331],[183,1319],[181,1310],
 [174,1304],[160,1300],[153,1291],[147,1280],[142,1267],[141,1254],[145,1240],[155,1226],
 [174,1210],[201,1194],[229,1179],[272,1164],[325,1148],[381,1131],[432,1117],[452,1110],
 [458,1105],[469,1113],[477,1109],[489,1097],[555,1077],[630,1054],[704,1031],[759,1011],
 [771,1004],[778,1001],[790,1006],[801,1005],[819,1001],[843,996],[898,994],[960,993],
 [1013,993],[1031,994],[1045,999],[1048,1005],[1044,1015],[1036,1040],[1025,1080],[1010,1123],
 [990,1163],[969,1201],[947,1235],[923,1268],[905,1290],[896,1296],[883,1299],
 [874,1305],[875,1316],[881,1334],[885,1351],[881,1357],[867,1362],[834,1367],[799,1375],
 [779,1382],[752,1393],[725,1408],[699,1424],[685,1432],[675,1431],[664,1426],[651,1415],
 [639,1406],[627,1406],[613,1409],[601,1419],[589,1430],[579,1432],[570,1430],[558,1422],
 [550,1413],[540,1408],[527,1409],[510,1412],[491,1410],[480,1411],[465,1414],[447,1417],
 [431,1422],[414,1425],[406,1429],[403,1435],[391,1438],[382,1443],[365,1440],[347,1440]]

specs=[
 {'id':'monza','name':'Monza','description':'Prima Variante, Lesmo, Ascari e Parabolica. Profilo dal vettoriale ufficiale.',
  'file':'monza.pdf','page':1,'url':'https://www.monzanet.it/wp-content/uploads/2023/09/MAPPA_CIRCUITO_2023_tribune.pdf',
  'sourceLabel':'Autodromo Nazionale Monza · mappa 2023','method':'37 curve Bezier del percorso GP; chiusura del piccolo vuoto grafico al sovrappasso del vecchio ovale. L’ovale non fa parte del tracciato.',
  'raw':monza,'start':[2600,2288],'direction':[1500,2185],
  'landmarks':[['Prima Variante',1460,2150],['Lesmo',540,548],['Ascari',1890,1775],['Parabolica',3455,2140]]},
 {'id':'monaco','name':'Monaco','description':'Tornante, tunnel e chicane: il circuito cittadino, senza allargare il profilo.',
  'file':'monaco.pdf','page':2,'url':'https://www.fia.com/system/files/decision-document/2025_monaco_grand_prix_-_race_directors_event_notes_-_circuit_map_pit_lane_map_ers_battery_containment_area_red_zones.pdf',
  'sourceLabel':'FIA · mappa GP Monaco 2025','method':'Mezzeria ricavata dalle coppie di triangoli della fascia stradale vettoriale (986 triangoli). Proporzioni e orientamento preservati.',
  'raw':monaco,'start':[88,590],'direction':[85,550],
  'landmarks':[['Tornante',494,254],['Tunnel',515,319],['Chicane',281,461],['Piscine',131,580],['Rascasse',190,755]]},
 {'id':'le-mans','name':'Le Mans','description':'Circuit de la Sarthe: Hunaudières con due chicane, Mulsanne, Arnage e Porsche.',
  'file':'lemans-regulations.pdf','page':151,'url':'https://assets.lemans.org/explorer/pdf/courses/2025/24-heures-du-mans/regulations/2025-24-hours-of-le-mans-supplementary-regulations.pdf',
  'sourceLabel':'ACO · mappa 24 Ore di Le Mans 2025, p.151','method':'Digitalizzazione manuale della mezzeria sulla mappa raster ufficiale (rendering 2x); interpolazione lineare, senza deformazioni degli assi.',
  'raw':lemans,'start':[315,1440],'direction':[275,1433],
  'landmarks':[['Dunlop',229,1400],['Tertre Rouge',160,1220],['Hunaudières',565,1075],['Mulsanne',1046,1004],['Arnage',883,1354],['Porsche',620,1410]]}
]
circuits=[];reports=[]
for s in specs:
    raw=s.pop('raw')
    start=min(range(len(raw)),key=lambda i:distance(raw[i],s['start']))
    raw=raw[start:]+raw[:start]
    if distance(raw[1],s['direction'])>distance(raw[-1],s['direction']):raw=[raw[0]]+list(reversed(raw[1:]))
    low=[min(p[k] for p in raw) for k in [0,1]]
    span=[max(p[k] for p in raw)-low[k] for k in [0,1]]
    old_scale=2400/max(span)
    old_transform=lambda p:[round((p[k]-low[k])*old_scale+140,4) for k in [0,1]]
    old_points=[[round(x,4),round(y,4)] for x,y in densify([old_transform(p) for p in raw],8)]
    old_length=LineString(old_points+[old_points[0]]).length
    profile=PROFILES['circuits'][s['id']]
    metric_factor=profile['lengthMeters']/old_length
    scale=old_scale*metric_factor
    transform=lambda p:[round((p[k]-low[k])*scale+140,4) for k in [0,1]]
    points=[[round((x-140)*metric_factor+140,6),round((y-140)*metric_factor+140,6)] for x,y in old_points]
    corridor,widths,stations=variable_corridor(points,profile,scale,low)
    boundaries=[[[round(x,6),round(y,6)] for x,y in ring.coords[:-1]]
                for ring in [corridor.exterior,corridor.interiors[0]]]
    road=Polygon(boundaries[0],[boundaries[1]])
    assert road.is_valid and road.covers(LineString(points+[points[0]])), f"{s['id']}: {explain_validity(road)}; centerline covered={road.covers(LineString(points+[points[0]]))}"
    # Check the actual Porsche footprint at EVERY center sample, not just spawn.
    minimum_clearance=float('inf')
    for a,b in zip(points,points[1:]+points[:1]):
        angle=math.atan2(b[1]-a[1],b[0]-a[0]);c=math.cos(angle);n=math.sin(angle)
        footprint=Polygon([(a[0]+x*c-y*n,a[1]+x*n+y*c) for x,y in
                           [(-2.3095,-1.025),(2.3095,-1.025),(2.3095,1.025),(-2.3095,1.025)]])
        assert road.covers(footprint), f"Blocked centerline pose: {s['id']} {a}"
        minimum_clearance=min(minimum_clearance,road.boundary.distance(footprint))
    s['landmarks']=[{'label':label,'x':transform([x,y])[0],'y':transform([x,y])[1]} for label,x,y in s['landmarks']]
    s.update(points=points,boundaries=boundaries,halfWidth=sum(widths)/len(widths)/2,
             widthMeters=[round(w,6) for w in widths],widthStations=stations,
             dimensions={'coordinateUnit':'metre','lengthMeters':profile['lengthMeters'],
                         'lengthSource':profile['lengthSource'],'widthEstimated':True,
                         'widthRangeMeters':[min(a['widthMeters'] for a in stations),max(a['widthMeters'] for a in stations)],
                         'documentedWidthRangeMeters':profile.get('documentedWidthRangeMeters'),
                         'widthRangeSource':profile.get('widthRangeSource'),'basis':profile['basis'],
                         'profileSha256':hashlib.sha256((ROOT/'work/track-width-profiles.json').read_bytes()).hexdigest(),
                         'interpolation':'periodic smoothstep; tapered corridor union; every centerline segment covered'},
             revision=2,sourceSha256=hashlib.sha256((ROOT/'work/maps'/s['file']).read_bytes()).hexdigest(),
             uniformScale=scale,sourceBounds={'x':low[0],'y':low[1],'width':span[0],'height':span[1]},
             notice='Forma e proporzioni della mappa preservate, lunghezza del giro calibrata in metri. Larghezze locali variabili stimate, non un rilievo. Auto in scala metrica; nessuna altimetria, box o barriera rilevata.')
    del s['start'];del s['direction']
    circuits.append(s)
    reports.append({'id':s['id'],'revision':s['revision'],'lengthMeters':LineString(points+[points[0]]).length,
                    'targetLengthMeters':profile['lengthMeters'],'widthRangeMeters':s['dimensions']['widthRangeMeters'],
                    'widthEstimated':True,'stations':len(stations),'centerSamples':len(points),
                    'wallVertices':sum(len(b) for b in boundaries),'validRoad':road.is_valid,
                    'singleHole':len(road.interiors)==1,'allCarPosesClear':True,
                    'minimumCarBoundaryClearanceMeters':minimum_clearance})
data={'schemaVersion':2,'circuits':circuits}
encoded=json.dumps(data,ensure_ascii=False,separators=(',',':'))
(ROOT/'outputs/data/circuits.json').write_text(encoded,encoding='utf-8')
(ROOT/'outputs/data/circuits.js').write_text('/* Source-map centerlines; provenance in circuits.json. */\nglobalThis.MALE_CNS_CIRCUITS = '+encoded+';\n',encoding='utf-8')
(ROOT/'outputs/metric-geometry-v470.json').write_text(json.dumps({'version':'4.7.0','profilesNotice':PROFILES['notice'],
    'circuits':reports,'passed':True},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(reports,indent=2))
# Retain a self-contained geometry-only regression fixture in the source and
# package; tests never depend on an installed/old release being present.
baseline_path=ROOT/'dist-selection-v463/win-unpacked/resources/app/outputs/data/circuits.json'
if baseline_path.exists():
    baseline=json.loads(baseline_path.read_text(encoding='utf-8'))
    fixture={'version':'4.6.3','circuits':[{k:c[k] for k in ['id','points','uniformScale','sourceSha256']} for c in baseline['circuits']]}
    fixture_dir=ROOT/'outputs/tests/fixtures';fixture_dir.mkdir(exist_ok=True)
    (fixture_dir/'metric-source-v463.json').write_text(json.dumps(fixture,separators=(',',':')),encoding='utf-8')
