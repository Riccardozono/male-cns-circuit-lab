'use strict';
// Experimental recurrent residual decoder. The two artificial memory states
// are not biological neurons. No position or target action enters this model.
const E=require('./ppo-environment.cjs'),R=require('./neural-local-rbf.cjs'),{F,L}=E;
function commands(graph,brain,genome,centres,weights,decay=.9,enabled=true,edgesEnabled=true){
  if(!Number.isFinite(decay)||decay<0||decay>=1)throw Error('Invalid decoder memory decay');
  if(!enabled||!edgesEnabled||!graph.learning.nodes.some(index=>Math.abs(brain.activity[index])>=1e-7)){brain.decoderMemory=[0,0];return [0,0,0];}
  if(weights.length!==centres.length*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid residual coefficients');
  const base=L.commands(graph,brain,genome),raw=Array.from(brain.policyFeatures),features=R.vector(raw,centres),norm=1/Math.sqrt(raw.length),memory=brain.decoderMemory||(brain.decoderMemory=[0,0]);
  for(let action=0;action<2;action++){const drive=features.reduce((sum,v,k)=>sum+v*weights[k*2+action]*norm,0);memory[action]=Math.max(-2,Math.min(2,decay*memory[action]+drive));}
  if(memory[0]===0&&memory[1]===0)return base;
  const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v))),steer=Math.tanh(atanh(base[0])+memory[0]),longitudinal=Math.tanh(atanh(base[1]-base[2])+memory[1]);
  return [steer,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
}
function replay(track,graph,genome,centres,weights,{state=null,startTicks=0,maxTicks=120000,trace=false,decay=.9,runtime=F}={}){
  let car;if(state){car=structuredClone({...state,brain:null});car.genome=runtime.cloneGenome(genome);car.brain=runtime.makeBrain(graph);car.brain.activity.set(state.brain.activity);car.brain.decoderMemory=state.brain.decoderMemory?.slice()||[0,0];}else {car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);}
  if(startTicks%L.CONTROL_INTERVAL!==0)throw Error('Unaligned cached prefix');let controls=[0,0,0],ticks=startTicks;const observations=[];
  while(car.alive&&ticks<maxTicks){if(ticks%L.CONTROL_INTERVAL===0){car.sensorVector=runtime.sense(track,car).concat(runtime.physicsSense(car,track));runtime.neuralStep(graph,car.brain,car.genome,car.sensorVector);controls=commands(graph,car.brain,car.genome,centres,weights,decay);if(trace)observations.push({raw:Array.from(car.brain.policyFeatures),progress:car.bestProgress,memory:car.brain.decoderMemory.slice()});}runtime.drive(track,car,controls,runtime.DT);ticks++;}
  return {result:{bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'evaluation censored':car.reason,complete:!car.alive,simulationSeconds:ticks*runtime.DT,lapTimes:car.lapTimes.slice()},executedTicks:ticks-startTicks,ticks,observations};
}
module.exports={...R,commands,replay};
