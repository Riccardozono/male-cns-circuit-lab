'use strict';
// Read-only replay of an experimental checkpoint, not a trajectory generator.
const fs=require('node:fs'),path=require('node:path'),E=require('./ppo-environment.cjs'),C=require('./experimental-checkpoint.cjs');
const root=path.resolve(__dirname,'..'),source=process.argv[2];if(!source)throw Error('Checkpoint path required');
const saved=JSON.parse(fs.readFileSync(path.resolve(root,source),'utf8')),sim=new E.F.Simulation(E.X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
if(!E.L.valid(sim.graph,saved.bestGenes))throw Error('Invalid experiment genes');
const genome=E.F.cloneGenome(sim.cars[0].genome);genome.policyWeights=saved.bestGenes.slice();const car=E.place(sim.track,sim.graph,genome,null),rows=[];let controls=[0,0,0],ticks=0;
while(car.alive&&ticks<120000){
  if(ticks%E.L.CONTROL_INTERVAL===0){E.observe(sim.track,sim.graph,car);controls=E.L.commands(sim.graph,car.brain,car.genome);
    if(car.bestProgress>600)rows.push({progress:car.bestProgress,time:car.lifetime,speedKmh:car.vehicle.speedMps*3.6,steering:controls[0],throttle:controls[1],brake:controls[2],roadWheelDeg:car.vehicle.steeringAngle*180/Math.PI,yawRate:car.yawRate,lateralG:car.lateralG,longitudinalG:car.longitudinalG,slipAngle:car.slipAngle,sensors:car.inputs,forwardClearance:E.F.sensorDistances(sim.track,car)[3],distanceToCentre:E.F.locate(sim.track,car.x,car.y).distance});}
  E.F.drive(sim.track,car,controls,E.F.DT);ticks++;
}
const report={sourceSha256:C.hashFile(path.resolve(root,source)),episode:{progress:car.bestProgress,laps:car.laps,fitness:car.fitness,reason:car.reason,complete:!car.alive},rows,boundary:'Independent deterministic replay from the start line. Centre distance and poses are diagnostic telemetry only and never neural inputs or target actions.'};
const out=path.resolve(root,'.impeccable/review/neural-cma/trace-'+path.basename(path.dirname(source))+'.json');fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({episode:report.episode,trace:rows.filter((row,index)=>index%10===0).slice(-15),last:rows.at(-1)},null,2));
