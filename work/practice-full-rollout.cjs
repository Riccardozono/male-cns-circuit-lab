'use strict';
// Research helper: a physical episode from the normal spawn, without a route
// controller or inherited distance. Callers must treat a watchdog as censored.
function fullRollout(F,track,graph,genome,{rewardRevision=F.Rewards.REVISION,previousLapTime=null,maxTicks=Infinity,onControl=null}={}){
  if(graph.full)throw Error('Full-graph validation requires its actual GPU solver');
  const car=F.makeCar(track,0,F.cloneGenome(genome),rewardRevision);
  car.footprintSensorsEnabled=graph.modelId==='v3';car.brain=F.makeBrain(graph);car.previousGenerationLapTime=previousLapTime;
  let ticks=0;const map=track.halfWidth<20;
  while(car.alive&&ticks<maxTicks){
    if(ticks%6===0){
      car.inputs=F.sense(track,car);car.physicsInputs=F.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);
      car.slowOutputs=F.neuralStep(graph,car.brain,car.genome,car.sensorVector,true,true,
        map?F.MAP_PHYSICS_ADAPTER_GAIN:F.PHYSICS_ADAPTER_GAIN,map?F.MAP_NEURAL_MOTOR_LAUNCH_BIAS:F.NEURAL_MOTOR_LAUNCH_BIAS);
      onControl?.(car,ticks);
    }
    F.drive(track,car,car.slowOutputs);ticks++;
  }
  if(car.alive)car.censored=true;
  return {car,ticks};
}
function outcome(F,result){const c=result.car;return {ticks:result.ticks,fitness:c.fitness,bestProgress:c.bestProgress,laps:c.laps,bestLapTime:Number.isFinite(c.bestLapTime)?c.bestLapTime:null,
  reason:c.reason,censored:Boolean(c.censored),safe:F.isSafeLearningOutcome(c)};}
module.exports={fullRollout,outcome};
