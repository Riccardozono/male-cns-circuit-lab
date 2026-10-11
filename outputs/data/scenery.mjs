/* Presentation-only safety scenery. Named sections come from the existing
 * dated map registration. All extents, surfaces and barrier placements below
 * are authored estimates, NOT survey measurements or collision geometry. */
const monza='https://www.fia.com/system/files/decision-document/2025_monza_event_-_f2_monza_event_notes_2025_v1.pdf';
const monaco='https://www.fia.com/system/files/decision-document/2025_monaco_event_-_f3_monaco_event_notes_2025_v2.pdf';
const lemans='https://fiawec.alkamelsystems.com/Results_NoticeBoard/13_2025/04_24%20Hours%20of%20Le%20Mans/059_Doc%2059%20-%20BRIEFING%20NOTES.pdf';
const zone=(station,before,after,width,surface='gravel')=>({station,before,after,width,surface,estimated:true});
export const SCENERY_REVISION='circuit-scenery-1';
export const SCENERY_CATALOG={
  lab:{barrier:'rail',shoulder:1.6,setback:3.0,ground:'#263b2b',source:null,referenceYear:null,zones:[]},
  monza:{barrier:'rail',shoulder:1.6,setback:3.8,ground:'#263b2b',source:monza,referenceYear:2025,zones:[
    zone('Prima Variante · T1',100,150,32,'asphalt'),
    zone('Variante della Roggia',90,145,28),
    zone('Lesmo 1',45,155,22),
    zone('Lesmo 2',45,150,25),
    zone('Variante Ascari',80,210,30),
    zone('Curva Alboreto / Parabolica',100,320,40)
  ]},
  monaco:{barrier:'concrete',shoulder:.45,setback:1.05,ground:'#343f45',source:monaco,referenceYear:2025,zones:[
    zone('Sainte-Dévote',22,38,12,'asphalt'),
    zone('Mirabeau Haute',14,24,7,'asphalt'),
    zone('Nouvelle Chicane',28,48,10,'asphalt')
  ]},
  'le-mans':{barrier:'rail',shoulder:1.8,setback:4.2,ground:'#263e2d',source:lemans,referenceYear:2025,zones:[
    zone('Chicane Dunlop',100,180,28),
    zone('Tertre Rouge',75,180,23),
    zone('Prima chicane Hunaudières',110,180,25,'asphalt'),
    zone('Seconda chicane Hunaudières',110,180,25,'asphalt'),
    zone('Curva Mulsanne',140,220,38),
    zone('Indianapolis · sinistra',85,160,28),
    zone('Arnage',60,105,20),
    zone('Curve Porsche',120,250,30),
    zone('Chicane Ford',65,160,22,'asphalt')
  ]}
};
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
freeze(SCENERY_CATALOG);
