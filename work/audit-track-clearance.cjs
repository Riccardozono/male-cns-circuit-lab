'use strict';
// Static geometry diagnostics only; these poses never enter learning.
const fs=require('node:fs'),path=require('node:path'),F=require('../outputs/simulation.js'),L=require('../outputs/legacy-models.js'),C=require('./experimental-checkpoint.cjs');
const root=path.resolve(__dirname,'..'),catalog=require('../outputs/data/circuits.json'),reports=[];
for(const definition of catalog.circuits){
  const s=new F.Simulation(L.tagV3(require('../outputs/data/connectome.json')),{population:1,circuitId:definition.id,circuits:catalog}),t=s.track,car=F.makeCar(t),blocked=[],outside=[];
  for(let i=0;i<t.center.length;i++){const point=t.center[i],next=t.center[(i+1)%t.center.length];Object.assign(car,point,{heading:Math.atan2(next.y-point.y,next.x-point.x)});if(F.collided(t,car))blocked.push(t.segments[i].start);if(!F.onRoad(t,car.x,car.y))outside.push(t.segments[i].start);}
  reports.push({circuit:definition.id,staticPoses:t.center.length,centrePosesWithOrientedBodyCollision:blocked,centrePosesOutsideRoad:outside});
}
const output=path.join(root,'.impeccable/review/track-clearance');fs.mkdirSync(output,{recursive:true});const report={reports,sourceHashes:Object.fromEntries(['outputs/simulation.js','outputs/vehicle-992.js','outputs/data/circuits.json'].map(file=>[file,C.hashFile(path.join(root,file))])),boundary:'Static metric map geometry diagnostics only, not a driving policy, training demonstration or proof of dynamic corner feasibility. No moving-body projection, assigned controls, source edits or awarded progress.'};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
