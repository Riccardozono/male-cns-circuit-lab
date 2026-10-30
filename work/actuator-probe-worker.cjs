'use strict';
// Diagnostic wrapper for our own disposable workers. Reads each real physics
// tick; never changes car state, actions, rewards, optimizer, or anatomy.
const {parentPort,workerData}=require('node:worker_threads');
const F=require(workerData.simulationPath),OriginalSimulation=F.Simulation;
const stats={instrumentation:'per-physics-tick-v2',ticks:0,carTicks:0,movingTicks:0,brakeTicks:0,brakeWhileMovingTicks:0,
  strongBrakeTicks:0,throttleTicks:0,overlapTicks:0,brakingDecelerationTicks:0,
  steeringSum:0,steeringSqSum:0,steeringOverPoint1Ticks:0,steeringOverPoint3Ticks:0,
  steeringDeltaSum:0,controlChanges:0,steeringSignFlips:0,maxSteeringStep:0,
  brakeSum:0,throttleSum:0,maxSpeedKmh:0,maxRoadWheelDeg:0,maxLateralG:0,
  maxBrake:0,minMovingBrakeAx:0,generations:0,completedLaps:0,maxProgressM:0};
const previous=new Map(),perGeneration=new Map();let lastReport=0;
function observe(sim){
  stats.ticks++;stats.generations=Math.max(stats.generations,sim.generation);
  for(const car of sim.cars){
    const key=sim.generation+':'+car.id,prior=previous.get(key),life=Number(car.lifetime)||0;
    if(prior&&life<=prior.life)continue;
    const [steer,gas,brake]=car.outputs,speed=car.vehicle.speedMps;
    stats.carTicks++;stats.steeringSum+=Math.abs(steer);stats.steeringSqSum+=steer*steer;
    stats.steeringOverPoint1Ticks+=Number(Math.abs(steer)>.1);stats.steeringOverPoint3Ticks+=Number(Math.abs(steer)>.3);
    stats.brakeSum+=brake;stats.throttleSum+=gas;stats.maxBrake=Math.max(stats.maxBrake,brake);
    stats.brakeTicks+=Number(brake>.01);stats.strongBrakeTicks+=Number(brake>.2);
    stats.throttleTicks+=Number(gas>.01);stats.overlapTicks+=Number(Math.min(gas,brake)>1e-9);
    if(car.alive&&speed>2){
      stats.movingTicks++;if(brake>.01){stats.brakeWhileMovingTicks++;stats.brakingDecelerationTicks+=Number(car.vehicle.ax<0);stats.minMovingBrakeAx=Math.min(stats.minMovingBrakeAx,car.vehicle.ax);}
    }
    stats.maxSpeedKmh=Math.max(stats.maxSpeedKmh,speed*3.6);
    stats.maxRoadWheelDeg=Math.max(stats.maxRoadWheelDeg,Math.abs(car.vehicle.steeringAngle)*180/Math.PI);
    stats.maxLateralG=Math.max(stats.maxLateralG,Math.abs(car.lateralG||0));
    stats.maxProgressM=Math.max(stats.maxProgressM,(car.bestProgress||0)/sim.track.pixelsPerMeter);
    stats.completedLaps=Math.max(stats.completedLaps,car.laps);
    // onTrialTick runs after tick() increments ticks, so the command computed
    // at tick 0 is observed with ticks===1, not at the end of its held interval.
    if(prior&&(sim.ticks-1)%sim.neuralInterval===0){const delta=Math.abs(steer-prior.steer);stats.steeringDeltaSum+=delta;stats.controlChanges++;stats.maxSteeringStep=Math.max(stats.maxSteeringStep,delta);stats.steeringSignFlips+=Number(steer*prior.steer<0&&Math.abs(steer)>.01&&Math.abs(prior.steer)>.01);}
    previous.set(key,{life,steer});
    const g=perGeneration.get(sim.generation)||{generation:sim.generation,carTicks:0,brakeTicks:0,maxBrake:0,maxSpeedKmh:0,maxProgressM:0};
    g.carTicks++;g.brakeTicks+=Number(brake>.01);g.maxBrake=Math.max(g.maxBrake,brake);g.maxSpeedKmh=Math.max(g.maxSpeedKmh,speed*3.6);g.maxProgressM=Math.max(g.maxProgressM,(car.bestProgress||0)/sim.track.pixelsPerMeter);perGeneration.set(sim.generation,g);
  }
  if(sim.ticks%60===0||sim.cars.every(c=>!c.alive)||performance.now()-lastReport>500){lastReport=performance.now();parentPort.postMessage({type:'actuator-diagnostic',stats:{...stats},perGeneration:[...perGeneration.values()]});}
}
F.Simulation=class extends OriginalSimulation{
  constructor(...args){
    super(...args);this.onTrialTick=observe;
    // Controlled decoder fixtures are NOT put in the population or optimizer.
    const p=F.ensureLearning(this.graph),fixtureBrain={activity:new Float32Array(this.graph.n)};
    fixtureBrain.activity[p.nodes[0]]=.1;
    const fixture=bias=>{const genome={adapterVersion:p.version,policyWeights:p.mean.slice()};genome.policyWeights[genome.policyWeights.length-1]=bias;return F.neuralOutputsFromBrain(this.graph,fixtureBrain,genome);};
    const positive=fixture(1.5),negative=fixture(-1.5);fixtureBrain.activity.fill(0);const silent=fixture(-1.5);
    parentPort.postMessage({type:'actuator-decoder',modelId:this.modelId,seed:this.seed,
      nodes:this.graph.n,parameters:p.length,controlRateHz:p.controlRateHz,
      positive,negative,silent,passed:positive[1]>.9&&positive[2]===0&&negative[1]===0&&negative[2]>.9&&silent.every(v=>v===0),
      boundary:'Synthetic descending-neuron activity and motor bias test of the real decoder. Not learned behaviour, not a teacher and not an injected driving action.'});
  }
};
require(workerData.actuatorOriginalWorker);
