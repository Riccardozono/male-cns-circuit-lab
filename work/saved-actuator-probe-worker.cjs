'use strict';
// Read-only actuator telemetry for a disposable replay of one saved generation.
// The sole stopping intervention happens AFTER the whole saved episode ends:
// do not train another generation when the diagnosis needs only saved policies.
const {parentPort,workerData}=require('node:worker_threads');
const crypto=require('node:crypto');
const F=require(workerData.simulationPath),OriginalSimulation=F.Simulation;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const saved=workerData.progressState,agents=new Map();let instance,lastReport=0;
const stats={physicsTicks:0,carTicks:0,movingTicks:0,brakeTicks:0,brakeMovingTicks:0,overlapTicks:0,
  maxProgressM:0,maxSpeedKmh:0,laps:0,reached650:0,reached750:0,finishedAgents:0};
function sample(car,sim){
  const features=Array.from(car.brain.policyFeatures||[]),ppm=sim.track.pixelsPerMeter||1;
  return {t:car.lifetime,progressM:car.progress/ppm,bestProgressM:car.bestProgress/ppm,
    speedKmh:car.vehicle.speedMps*3.6,steering:car.outputs[0],throttle:car.outputs[1],brake:car.outputs[2],
    frontRayM:car.inputs[3]*F.SENSOR_MAX/ppm,roadWheelDeg:car.vehicle.steeringAngle*180/Math.PI,
    lateralG:car.lateralG,ax:car.vehicle.ax,yawRate:car.vehicle.r,
    featureRange:features.length?[Math.min(...features),Math.max(...features)]:null,
    saturatedFeatures:features.filter(v=>Math.abs(v)>.99).length,
    visualSensors:Array.from(car.inputs),physicsSensors:Array.from(car.physicsInputs)};
}
function report(sim,complete=Boolean(sim.savedDiagnosticComplete)){
  lastReport=performance.now();
  const rows=[...agents.values()].map(a=>{const {previousFeatures,baselineFeatures,...row}=a;return row;});
  parentPort.postMessage({type:'saved-actuator-report',workerIndex:workerData.index,generation:sim.generation,
    elapsed:sim.elapsed,complete,stats:{...stats},agents:rows,
    optimizerUnchanged:hash({mean:sim.optimizer.mean,sigma:sim.optimizer.sigma,updates:sim.optimizer.updates,episodes:sim.optimizer.episodes})===hash(saved.optimizer),
    genomesUnchanged:hash(sim.cars.map(c=>F.cloneGenome(c.genome)))===hash(saved.genomes)});
}
function observe(sim){
  stats.physicsTicks++;
  for(const car of sim.cars){
    let row=agents.get(car.id);
    if(!row){row={id:car.id,carTicks:0,movingTicks:0,brakeTicks:0,brakeMovingTicks:0,maxBrake:0,maxSpeedKmh:0,
      maxAbsSteering:0,maxSteeringStep:0,signFlips:0,maxFeatureStep:0,maxFeatureChangeAfter100m:0,
      cornerTicks:0,cornerBrakeTicks:0,cornerMinThrottle:null,cornerMaxBrake:0,
      maxProgressM:0,laps:0,reason:null,firstMovingBrake:null,lastAlive:null,terminal:null,
      trace:[],nextTrace:550,previousLife:-1,previousSteering:0,previousFeatures:null,baselineFeatures:null};agents.set(car.id,row);}
    if(car.lifetime<=row.previousLife)continue;
    row.previousLife=car.lifetime;row.carTicks++;stats.carTicks++;
    const [steer,gas,brake]=car.outputs,progress=car.bestProgress/(sim.track.pixelsPerMeter||1),speed=car.vehicle.speedMps;
    row.maxBrake=Math.max(row.maxBrake,brake);row.brakeTicks+=Number(brake>.01);stats.brakeTicks+=Number(brake>.01);
    row.maxSpeedKmh=Math.max(row.maxSpeedKmh,speed*3.6);stats.maxSpeedKmh=Math.max(stats.maxSpeedKmh,speed*3.6);
    row.maxAbsSteering=Math.max(row.maxAbsSteering,Math.abs(steer));
    row.maxProgressM=Math.max(row.maxProgressM,progress);stats.maxProgressM=Math.max(stats.maxProgressM,progress);
    row.laps=Math.max(row.laps,car.laps);stats.laps=Math.max(stats.laps,car.laps);
    stats.overlapTicks+=Number(Math.min(gas,brake)>1e-9);
    if(car.alive&&speed>2){row.movingTicks++;stats.movingTicks++;if(brake>.01){row.brakeMovingTicks++;stats.brakeMovingTicks++;if(!row.firstMovingBrake)row.firstMovingBrake=sample(car,sim);}}
    if(car.alive&&progress>=650&&progress<900){row.cornerTicks++;row.cornerBrakeTicks+=Number(brake>.01);row.cornerMinThrottle=Math.min(row.cornerMinThrottle??Infinity,gas);row.cornerMaxBrake=Math.max(row.cornerMaxBrake,brake);}
    if((sim.ticks-1)%sim.neuralInterval===0){
      const features=Array.from(car.brain.policyFeatures||[]);
      if(row.previousFeatures){row.maxFeatureStep=Math.max(row.maxFeatureStep,...features.map((v,i)=>Math.abs(v-row.previousFeatures[i])));
        row.maxSteeringStep=Math.max(row.maxSteeringStep,Math.abs(steer-row.previousSteering));
        row.signFlips+=Number(steer*row.previousSteering<0&&Math.abs(steer)>.01&&Math.abs(row.previousSteering)>.01);}
      if(!row.baselineFeatures&&progress>=100)row.baselineFeatures=features.slice();
      if(row.baselineFeatures)row.maxFeatureChangeAfter100m=Math.max(row.maxFeatureChangeAfter100m,...features.map((v,i)=>Math.abs(v-row.baselineFeatures[i])));
      row.previousFeatures=features;row.previousSteering=steer;
      if(car.alive){row.lastAlive=sample(car,sim);if(progress>=row.nextTrace){row.trace.push(row.lastAlive);row.nextTrace=progress+10;}}
    }
    if(!car.alive&&!row.reason){row.reason=car.reason;row.terminal=sample(car,sim);}
  }
  stats.reached650=[...agents.values()].filter(a=>a.maxProgressM>=650).length;
  stats.reached750=[...agents.values()].filter(a=>a.maxProgressM>=750).length;
  stats.finishedAgents=[...agents.values()].filter(a=>a.reason).length;
  if(sim.cars.every(c=>!c.alive))sim.savedDiagnosticComplete=true;
  if(sim.savedDiagnosticComplete||performance.now()-lastReport>1000)report(sim);
}
F.Simulation=class extends OriginalSimulation{
  constructor(...args){super(...args);instance=this;this.onTrialTick=observe;}
  evolve(){if(saved&&this.savedDiagnosticComplete){this.running=false;return;}return super.evolve();}
};
parentPort.on('message',m=>{if(m.type==='saved-actuator-flush'&&instance)report(instance);});
require(workerData.savedDiagnosticOriginalWorker);
