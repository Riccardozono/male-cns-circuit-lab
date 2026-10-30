'use strict';
// Independent native episode loop; no transport, practice snapshots or old driver.
const Core=require('./neural-direct-motorpool-core.cjs');
function create(){const frame=Core.createFrame(),{F,L}=Core;let car,ticks=0,steps=0,observation;
 function state(){return {car,x:observation.x,active:observation.active,bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'':car.reason,complete:!car.alive,totalSimulationSeconds:ticks*F.DT,lapTimes:car.lapTimes.slice(),controls:steps};}
 function reset(){car=F.makeCar(frame.track,0,F.cloneGenome(frame.genome));car.brain=F.makeBrain(frame.graph);ticks=steps=0;observation=Core.observe(frame,car);return state();}
 function step(weights,latent=null){if(!car.alive)return state();if(latent===null){Core.validate(weights,frame.dimension);latent=Core.mean(observation.x,weights);}const commands=Core.commands(latent,observation.active);car.outputs=commands;for(let i=0;i<L.CONTROL_INTERVAL&&car.alive;i++){F.drive(frame.track,car,commands,F.DT);ticks++;}steps++;if(car.alive)observation=Core.observe(frame,car);return state();}
 reset();return {reset,step,state,metadata:()=>Core.metadata(frame)};}
module.exports={create,stats:Core.stats,close:Core.close};
