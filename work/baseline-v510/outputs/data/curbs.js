/* Presentation-only curb observations. Endpoints are manually registered to
 * the source MAP, not surveyed kerb coordinates. Never read by simulation.js.
 * Omit unobserved portions: curvature is not evidence that a kerb exists. */
(function(root){
  'use strict';
  const monza='https://www.fia.com/system/files/decision-document/2025_monza_event_-_f2_monza_event_notes_2025_v1.pdf';
  const monaco='https://www.fia.com/system/files/decision-document/2025_monaco_event_-_f3_monaco_event_notes_2025_v2.pdf';
  const mclaren='https://www.mclaren.com/racing/formula-1/2025/monaco-grand-prix/the-monaco-gp-briefing-powered-by-google-cloud/';
  const lemans='https://fiawec.alkamelsystems.com/Results_NoticeBoard/13_2025/04_24%20Hours%20of%20Le%20Mans/059_Doc%2059%20-%20BRIEFING%20NOTES.pdf';
  const s=(id,label,side,from,to,source,page,evidence)=>({id,label,side,from,to,source,page,evidence});
  const catalog={
    schemaVersion:1,
    registration:'Manual landmark registration in the existing map coordinates; endpoint lengths and width are approximate, not surveyed. No complete-circuit coverage claim.',
    circuits:{
      monza:{referenceYear:2025,mapRevision:2,sourceLabel:'FIA · Monza 2025, foto pp.6–7',url:monza,colors:['#df604c','#eee8d8'],coverage:'partial',
        // Coordinates in the 2023 source PDF points, not pixels of an aerial.
        segments:[
          s('t1-apex','Prima Variante · T1 apice','right',[1497,2186],[1465,2150],monza,7,'Aerial T1/T2: inside T1 kerb.'),
          s('t2-apex','Prima Variante · T2 apice','left',[1465,2154],[1416,2127],monza,7,'Aerial T1/T2: inside T2 kerb.'),
          s('t2-exit','Prima Variante · uscita T2','right',[1434,2122],[1198,2163],monza,7,'Aerial T1/T2: continuous outside exit kerb, not a whole straight.'),
          s('t4-apex','Roggia · T4 apice','left',[584,1187],[556,1123],monza,7,'Aerial T4/T5: inside first left apex.'),
          s('t5-apex','Roggia · T5 apice','right',[554,1123],[514,1075],monza,7,'Aerial T4/T5: inside second right apex.'),
          s('t5-exit','Roggia · uscita T5','left',[525,1109],[482,954],monza,7,'Aerial T4/T5: outside second-corner exit strip.'),
          s('t10-exit','Ascari · uscita T10','right',[2006,1837],[2130,1853],monza,6,'Ground photograph looking towards the bridge after T10: right edge stripe visible.')
        ]},
      monaco:{referenceYear:2025,mapRevision:2,sourceLabel:'FIA · Monaco 2025, §12; McLaren · T16',url:monaco,colors:['#df604c','#eee8d8'],coverage:'partial',
        // Coordinates in the FIA map PDF points. Apex-zone registration only.
        // Flat paint omitted in §12 is NOT recreated as a long physical kerb.
        segments:[
          s('t1-apex','Sainte-Dévote · T1 apice','right',[98,473],[125,457],monaco,4,'Section 12 explicitly retains the temporary apex kerb; flat paint behind it omitted. Side registered to FIA numbered map.'),
          s('t10-apex','Nouvelle Chicane · T10 apice','left',[299,451],[287,466],monaco,4,'Section 12 identifies the temporary T10 apex kerb; preceding and T10–T11 connecting flat paint omitted.'),
          s('t13-apex','Piscine · T13 apice','left',[113,554],[123,571],monaco,4,'Section 12 identifies temporary T13 apex kerb; preceding flat paint omitted.'),
          s('t14-apex','Piscine · T14 apice','right',[123,571],[133,587],monaco,4,'Section 12 identifies temporary T14 apex kerb; flat paint before and after omitted.'),
          s('t16-apex','Piscine · T16 apice','left',[134,657],[126,666],mclaren,null,'McLaren track engineer explicitly describes driving over the T16 apex kerb. Side registered to FIA numbered map.')
        ],
        omissions:'Non ricreate le fasce piatte eliminate nel 2025 a T1, T4, T10–T11, T12, T13–T14 e T15.'},
      'le-mans':{referenceYear:2025,mapRevision:2,sourceLabel:'FIA WEC / ACO · Le Mans 2025, foto pp.23,33',url:lemans,colors:['#77abd0','#ebca55'],coverage:'partial',
        // Coordinates of the existing ACO map rendering (2x, p.151).
        segments:[
          s('dunlop-left','Dunlop · primo apice','left',[238,1396],[225,1394],lemans,23,'MP3 photograph shows the striped outside/first left apex edge beside the gravel.'),
          s('dunlop-right','Dunlop · secondo apice','right',[227,1393],[215,1380],lemans,23,'MP3-RHS map and aerial identify inside right apex at the chicane.'),
          s('ford-t29','Ford · T29 apice','left',[427,1423],[406,1429],lemans,33,'Pit entry aerial: first left-apex blue/yellow strip on the GP route, not the Bugatti shortcut.'),
          s('ford-t30','Ford · T30 apice','right',[410,1427],[402,1436],lemans,33,'Pit entry aerial: first right apex of GP Ford chicane.'),
          s('ford-t31','Raccordement · T31 apice','left',[395,1437],[380,1442],lemans,33,'Pit entry aerial: final left apex beside the triangular island.'),
          s('ford-t32','Raccordement · T32 apice','right',[387,1441],[356,1440],lemans,23,'MP35-RHS aerial and map: final right apex onto start straight.'),
          s('ford-exit','Raccordement · uscita','left',[380,1442],[343,1440],lemans,33,'Pit entry aerial: outside final-right exit edge, stopping before the pit straight.')
        ]}
    }
  };
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  freeze(catalog);
  if(typeof module!=='undefined'&&module.exports)module.exports=catalog;else root.MaleCNSCurbs=catalog;
})(typeof globalThis!=='undefined'?globalThis:this);
