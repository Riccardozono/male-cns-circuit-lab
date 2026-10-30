'use strict';
// Replay an actually evaluated neural candidate that was terminated by the
// progress guard. Diagnostics only: no hand-issued vehicle command or edit.
const fs=require('node:fs'),path=require('node:path'),E=require('./ppo-environment.cjs'),R=require('./neural-local-rbf.cjs'),root=path.resolve(__dirname,'..');
const report=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/neural-local-rbf/sparse-wide/report.json'),'utf8')),checkpoint=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/neural-local-rbf/initial/checkpoint.json'),'utf8'));
const candidate=report.records.filter(row=>row.round===0&&row.reason==='progresso non valido').toSorted((a,b)=>b.bestProgress-a.bestProgress)[0];if(!candidate)throw Error('No real invalid-progress candidate recorded');
const s=new E.F.Simulation(E.X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')}),genome=checkpoint.baseGenome,weights=checkpoint.bestWeights.slice();weights[candidate.coefficient]=Math.max(-8,Math.min(8,weights[candidate.coefficient]+candidate.amount));
const car=E.place(s.track,s.graph,genome,null),rows=[];let ticks=0,controls=[0,0,0];
while(car.alive&&ticks<120000){
  if(ticks%E.L.CONTROL_INTERVAL===0){E.observe(s.track,s.graph,car);controls=R.commands(s.graph,car.brain,genome,checkpoint.centres,weights);}
  const before={x:car.x,y:car.y,along:car.rewardState.along};E.F.drive(s.track,car,controls,E.F.DT);ticks++;
  const nearest=E.F.locate(s.track,car.x,car.y),travelled=Math.hypot(car.x-before.x,car.y-before.y);let delta=nearest.along-before.along;if(delta>s.track.total/2)delta-=s.track.total;if(delta<-s.track.total/2)delta+=s.track.total;
  if(car.rewardState.invalidSteps||rows.length)rows.push({tick:ticks,time:car.lifetime,x:car.x,y:car.y,speedKmh:car.vehicle.speedMps*3.6,progress:car.bestProgress,along:nearest.along,previousValidAlong:before.along,chainageDelta:delta,physicalMotion:travelled,maximumAllowedChainageDelta:travelled*2+.02,ratio:travelled?Math.abs(delta)/travelled:null,onRoad:E.F.onRoad(s.track,car.x,car.y),bodyCollision:E.F.collided(s.track,car),distanceToCentre:nearest.distance,invalidSteps:car.rewardState.invalidSteps,controls:controls.slice(),reason:car.reason});
}
const result={candidate,episode:{bestProgress:car.bestProgress,fitness:car.fitness,reason:car.reason},rows:rows.slice(-30),boundary:'Exact start-line replay of a previously recorded round-zero experimental neural proposal. Coordinates, chainage and collision data are diagnostic outputs only, never policy inputs, teacher targets or projected car motion.'};
const output=path.join(root,'.impeccable/review/progress-guard');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'actual-invalid-monza.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
