'use strict';
// A learned, instantaneous residual over the previous neural controller.
// Its coefficients do not accumulate in the older decoder memory. Only real
// descending-neuron activity and previous decoder state enter this head.
const G=require('./guard-memory-runtime.cjs'),N=require('./neural-causal-memory.cjs'),L=G.X.L;
const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
function commands(graph,brain,genome,baseCentres,baseWeights,centres,weights,decay=.98,enabled=true,edgesEnabled=true){
  const previous=brain.decoderMemory?.slice()||[0,0],base=N.commands(graph,brain,genome,baseCentres,baseWeights,decay,enabled,edgesEnabled);
  if(!enabled||!edgesEnabled||!graph.learning.nodes.some(i=>Math.abs(brain.activity[i])>=1e-7))return [0,0,0];
  if(weights.length!==centres.length*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid direct residual weights');
  const features=N.vector(Array.from(brain.policyFeatures),previous,centres),norm=1/Math.sqrt(graph.learning.nodes.length);
  const steering=features.reduce((sum,v,k)=>sum+v*weights[k*2]*norm,0),longitudinal=features.reduce((sum,v,k)=>sum+v*weights[k*2+1]*norm,0);
  if(steering===0&&longitudinal===0)return base;
  const s=Math.tanh(atanh(base[0])+steering),a=Math.tanh(atanh(base[1]-base[2])+longitudinal);
  return [s,Math.max(0,a),Math.max(0,-a)];
}
function replay(track,graph,genome,baseCentres,baseWeights,centres,weights,{state=null,startTicks=0,maxTicks=120000,trace=false,decay=.98,runtime=G.F,onTick=null}={}){
  let car;if(state){car=structuredClone({...state,brain:null});car.genome=runtime.cloneGenome(genome);car.brain=runtime.makeBrain(graph);car.brain.activity.set(state.brain.activity);car.brain.decoderMemory=state.brain.decoderMemory.slice();}
  else{car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);}
  if(startTicks%L.CONTROL_INTERVAL!==0)throw Error('Unaligned direct prefix');let ticks=startTicks,controls=[0,0,0];const observations=[];
  while(car.alive&&ticks<maxTicks){
    if(ticks%L.CONTROL_INTERVAL===0){
      car.inputs=runtime.sense(track,car);car.physicsInputs=runtime.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);const memoryBefore=car.brain.decoderMemory?.slice()||[0,0];
      runtime.neuralStep(graph,car.brain,car.genome,car.sensorVector);controls=commands(graph,car.brain,car.genome,baseCentres,baseWeights,centres,weights,decay);
      if(trace)observations.push({raw:Array.from(car.brain.policyFeatures),memoryBefore,memoryAfter:car.brain.decoderMemory.slice(),progress:car.bestProgress});
    }
    runtime.drive(track,car,controls,runtime.DT);onTick?.(car,controls,ticks);ticks++;
  }
  return {result:{bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'evaluation censored':car.reason,complete:!car.alive,simulationSeconds:ticks*runtime.DT,lapTimes:car.lapTimes.slice()},executedTicks:ticks-startTicks,ticks,observations};
}
function prefix(track,graph,genome,baseCentres,baseWeights,centres,decay=.98,runtime=G.F){
  const car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);let ticks=0,controls=[0,0,0];
  while(car.alive&&ticks<120000){
    if(ticks%L.CONTROL_INTERVAL===0){
      const previous=structuredClone({...car,brain:null}),activity=car.brain.activity.slice(),memory=car.brain.decoderMemory?.slice()||[0,0];
      car.inputs=runtime.sense(track,car);car.physicsInputs=runtime.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);runtime.neuralStep(graph,car.brain,car.genome,car.sensorVector);
      if(N.vector(Array.from(car.brain.policyFeatures),memory,centres).some(v=>v!==0)){previous.brain={activity,decoderMemory:memory};return {state:previous,ticks};}
      controls=N.commands(graph,car.brain,car.genome,baseCentres,baseWeights,decay);
    }
    runtime.drive(track,car,controls,runtime.DT);ticks++;
  }
  throw Error('No active direct neural context');
}
module.exports={commands,replay,prefix};
