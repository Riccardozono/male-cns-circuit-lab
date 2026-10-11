/* Authored elevation anchors, not a survey. Qualitative primary references do
 * not establish all local heights. All registration/interpolation is estimated. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MaleCNSTerrainData=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const entry=(reference,anchors,notice)=>({reference,anchors,notice,estimated:true});
  const profiles={
    lab:entry(null,[], 'Laboratorio pianeggiante sintetico.'),
    monza:entry('https://www.monzanet.it/tracciato-pista-monza/',[
      ['Rettifilo principale',2],['Prima Variante · T1',2],['Curva Biassono',4],['Variante della Roggia',5],['Lesmo 1',7],['Lesmo 2',8],['Serraglio',1],['Variante Ascari',0],['Rettilineo verso Parabolica',1],['Curva Alboreto / Parabolica',2],['Uscita Parabolica',2]
    ],'Quote relative interamente stimate, non fornite dalla mappa ufficiale. Nessun banking dell’ovale storico.'),
    monaco:entry('https://www.formula1.com/en/latest/article/need-to-know-the-most-important-facts-stats-and-trivia-ahead-of-the-2025-monaco-grand-prix.7FbX7r8dNJZQF6jnyLnoJC',[
      ['Boulevard Albert Ier · partenza',0],['Sainte-Dévote',0],['Beau Rivage',20],['Massenet',42],['Casino',40],['Mirabeau Haute',28],['Tornante Fairmont',19],['Mirabeau Bas',12],['Portier',3],['Ingresso Tunnel',3],['Tunnel',3],['Nouvelle Chicane',0],['Tabac',0],['Piscine · prima variante',0],['Rascasse',0],['Ritorno al rettifilo',0]
    ],'Salita Sainte-Dévote–Casino documentata da F1 (2025); tutte le quote numeriche e i raccordi sono stime.'),
    'le-mans':entry('https://www.24h-lemans.com/en/news/landmarks-of-the-24-hours-of-le-mans-circuit-57442',[
      ['Rettilineo dei box · partenza',58],['Curva Dunlop',62],['Chicane Dunlop',76],['Esses de la Forêt',60],['Tertre Rouge',49],['Hunaudières · primo rettilineo',48],['Prima chicane Hunaudières',47],['Seconda chicane Hunaudières',49],['Curva Mulsanne',42],['Indianapolis · ingresso',52],['Arnage',46],['Curve Porsche',51],['Maison Blanche',57],['Chicane Ford',58],['Uscita verso i box',58]
    ],'ACO (2023) riporta Dunlop a 76 m s.l.m. e una salita del 7%; gli altri punti, l’ancoraggio locale e il profilo completo sono stime, non un rilievo 2026.')
  };
  const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
  return freeze({revision:'terrain-profile-1',profiles});
});
