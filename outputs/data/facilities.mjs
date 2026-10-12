/* Official diagrams establish zones, not surveyed coordinates or architecture.
 * All offsets, building dimensions, rows, colours and structures are authored
 * display estimates. This catalogue has no simulation/controller parameters. */
export const FACILITIES_REVISION='track-facilities-1';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const FACILITIES_CATALOG=freeze({
  lab:{source:null,referenceYear:null,sourceLabel:'Laboratorio sintetico',estimated:true,
    stands:[{name:'Tribuna laboratorio',fraction:.08,side:'outer',width:44,rows:10,roof:true,colour:0x4d8ab1}],
    pit:{name:'Box laboratorio',fraction:.92,side:'inner',width:46,bays:6},
    braking:[],cabins:[{fraction:.32},{fraction:.70}]},
  monza:{source:'https://www.monzanet.it/wp-content/uploads/2026/03/GP_F1_2026_LISTINO_PREZZI_3_2.pdf',referenceYear:2026,sourceLabel:'Monzanet · mappa tribune 2026',estimated:true,
    stands:[
      {name:'Centrale · zona tribuna 1',station:'Rettifilo principale',side:'outer',offset:0,width:76,rows:15,roof:true,colour:0x4685b2},
      {name:'Prima Variante · zona tribuna 8',station:'Prima Variante · T1',side:'outer',offset:36,width:54,rows:12,roof:false,colour:0xa74e48},
      {name:'Roggia · zona tribuna 10',station:'Variante della Roggia',side:'inner',offset:30,width:52,rows:10,roof:false,colour:0x4b8c73},
      {name:'Ascari · zona tribuna 16',station:'Variante Ascari',side:'inner',offset:55,width:58,rows:12,roof:false,colour:0x4b8c73},
      {name:'Ascari esterna · zona tribuna 17',station:'Uscita Ascari',side:'outer',offset:-12,width:64,rows:12,roof:false,colour:0xa74e48},
      {name:'Parabolica · zona tribuna 22',station:'Curva Alboreto / Parabolica',side:'outer',offset:-95,width:62,rows:13,roof:false,colour:0xa74e48}],
    pit:{name:'Box · rettilineo principale',station:'Rettifilo principale',side:'inner',offset:80,width:104,bays:14},
    braking:['Prima Variante · T1','Variante della Roggia','Ingresso Ascari','Curva Alboreto / Parabolica'],
    cabins:[{station:'Uscita Prima Variante'},{station:'Lesmo 2'},{station:'Uscita Ascari'}]},
  monaco:{source:'https://acm.mc/wp-content/uploads/2025/05/Hospitalites_ACM_F12026_F-3.pdf',referenceYear:2026,sourceLabel:'ACM · mappa circuito e tribune 2026',estimated:true,
    stands:[
      {name:'Sainte-Dévote · zona tribuna A',station:'Sainte-Dévote',side:'outer',offset:-15,width:34,rows:10,roof:false,colour:0xb05751},
      {name:'Casino · zona tribuna B',station:'Casino',side:'outer',offset:0,width:34,rows:10,roof:false,colour:0xb05751},
      {name:'Porto · zona tribuna K',station:'Tabac',side:'inner',offset:25,width:60,rows:14,roof:false,colour:0xb05751},
      {name:'Piscine · zona tribuna L',station:'Piscine · seconda variante',side:'inner',offset:-18,width:34,rows:10,roof:false,colour:0xb05751},
      {name:'Porto · zona tribuna T',station:'Piscine · seconda variante',side:'inner',offset:65,width:54,rows:12,roof:false,colour:0xb05751},
      {name:'Anthony Noghès · zona tribuna V',station:'Anthony Noghès',side:'outer',offset:-10,width:30,rows:9,roof:false,colour:0xb05751}],
    pit:{name:'Box · zona Piscine / porto',station:'Piscine · prima variante',side:'outer',offset:50,width:68,bays:10},
    braking:['Sainte-Dévote','Mirabeau Haute','Nouvelle Chicane','Rascasse'],
    cabins:[{station:'Portier'},{station:'Tabac'},{station:'Rascasse'}]},
  'le-mans':{source:'https://assets.lemans.org/explorer/pdf/aco/2026/2026-plan-aco-tribunes-24h.pdf',referenceYear:2026,sourceLabel:'ACO · plan tribunes 24 Heures 2026',estimated:true,
    stands:[
      {name:'Box · zona tribuna 52 Stands',station:'Rettilineo dei box · partenza',side:'inner',offset:70,width:90,rows:14,roof:true,colour:0x517cb1},
      {name:'ACO · zona tribuna 18',station:'Rettilineo dei box · partenza',side:'outer',offset:65,width:72,rows:14,roof:true,colour:0x786692},
      {name:'Sommer · zona tribuna 16',station:'Rettilineo dei box · partenza',side:'outer',offset:165,width:66,rows:13,roof:true,colour:0x786692},
      {name:'Goodyear · zona tribuna 9',station:'Curva Dunlop',side:'outer',offset:-36,width:54,rows:12,roof:true,colour:0x786692},
      {name:'Dunlop · zona tribuna 7 Bollée',station:'Chicane Dunlop',side:'outer',offset:42,width:50,rows:10,roof:false,colour:0xbb784d},
      {name:'Tertre Rouge · zona tribuna 1',station:'Tertre Rouge',side:'outer',offset:15,width:44,rows:10,roof:true,colour:0x517cb1},
      {name:'Raccordement · zona tribuna 23',station:'Chicane del raccordo',side:'outer',offset:10,width:50,rows:12,roof:true,colour:0x786692}],
    pit:{name:'Box · rettilineo di Le Mans',station:'Rettilineo dei box · partenza',side:'inner',offset:-65,width:112,bays:16},
    braking:['Chicane Dunlop','Prima chicane Hunaudières','Seconda chicane Hunaudières','Curva Mulsanne','Arnage','Chicane Ford'],
    cabins:[{station:'Tertre Rouge'},{station:'Curva Mulsanne'},{station:'Arnage'},{station:'Curve Porsche'}]}
});
