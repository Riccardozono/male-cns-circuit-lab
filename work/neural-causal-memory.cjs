'use strict';
// Experimental history-conditioned decoder. No position, heading, time,
// waypoint or desired action enters its features. These memory cells are
// artificial decoder state, not extra biological MaleCNS neurons.
const G=require('./guard-memory-runtime.cjs'),R=require('./neural-local-rbf.cjs'),L=G.X.L;
function feature(raw,memory,centre){
  if(!centre.memory)return R.feature(raw,centre);
  const distance=Math.hypot(R.rms(raw,centre.values)/centre.radius,R.rms(memory,centre.memory)/centre.memoryRadius);
  return distance>=1?0:(1-distance)**4*(4*distance+1);
}
const vector=(raw,memory,centres)=>centres.map(c=>feature(raw,memory,c));
function commands(graph,brain,genome,centres,weights,decay=.98,enabled=true,edgesEnabled=true){
  if(!Number.isFinite(decay)||decay<0||decay>=1)throw Error('Invalid causal memory decay');
  if(!enabled||!edgesEnabled||!graph.learning.nodes.some(i=>Math.abs(brain.activity[i])>=1e-7)){brain.decoderMemory=[0,0];return [0,0,0];}
  if(weights.length!==centres.length*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid causal weights');
  const base=L.commands(graph,brain,genome),raw=Array.from(brain.policyFeatures),memory=brain.decoderMemory||(brain.decoderMemory=[0,0]),features=vector(raw,memory,centres),norm=1/Math.sqrt(raw.length);
  for(let action=0;action<2;action++){const drive=features.reduce((sum,v,k)=>sum+v*weights[k*2+action]*norm,0);memory[action]=Math.max(-2,Math.min(2,decay*memory[action]+drive));}
  if(memory[0]===0&&memory[1]===0)return base;
  const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v))),steering=Math.tanh(atanh(base[0])+memory[0]),longitudinal=Math.tanh(atanh(base[1]-base[2])+memory[1]);
  return [steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
}
function replay(track,graph,genome,centres,weights,{state=null,startTicks=0,maxTicks=120000,trace=false,decay=.98,runtime=G.F,onTick=null}={}){
  let car;if(state){car=structuredClone({...state,brain:null});car.genome=runtime.cloneGenome(genome);car.brain=runtime.makeBrain(graph);car.brain.activity.set(state.brain.activity);car.brain.decoderMemory=state.brain.decoderMemory.slice();}
  else {car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);}
  if(startTicks%L.CONTROL_INTERVAL!==0)throw Error('Unaligned causal prefix');let ticks=startTicks,controls=[0,0,0];const observations=[];
  while(car.alive&&ticks<maxTicks){
    if(ticks%L.CONTROL_INTERVAL===0){
      car.inputs=runtime.sense(track,car);car.physicsInputs=runtime.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);
      const memoryBefore=car.brain.decoderMemory?.slice()||[0,0];runtime.neuralStep(graph,car.brain,car.genome,car.sensorVector);controls=commands(graph,car.brain,car.genome,centres,weights,decay);
      if(trace)observations.push({raw:Array.from(car.brain.policyFeatures),memoryBefore,memoryAfter:car.brain.decoderMemory.slice(),progress:car.bestProgress});
    }
    runtime.drive(track,car,controls,runtime.DT);onTick?.(car,controls,ticks);ticks++;
  }
  return {result:{bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'evaluation censored':car.reason,complete:!car.alive,simulationSeconds:ticks*runtime.DT,lapTimes:car.lapTimes.slice()},executedTicks:ticks-startTicks,ticks,observations};
}
const contextDistance=(a,b)=>Math.hypot(R.rms(a.raw,b.raw)/.15,R.rms(a.memoryBefore,b.memoryBefore)/.5);
function grow(observations,existing,weights,limit=8){
  if(observations.length<20||!Number.isInteger(limit)||limit<1||limit>16)throw Error('Actual experience required');
  const prefix=observations.slice(0,Math.floor(observations.length*.85)),late=observations.slice(prefix.length),added=[];
  while(added.length<limit){
    let selected=null,largest=.05;
    for(const row of late){const protectedDistance=Math.min(...prefix.map(p=>contextDistance(row,p))),novelty=Math.min(protectedDistance,...added.map(c=>contextDistance(row,{raw:c.values,memoryBefore:c.memory})));if(novelty>largest){largest=novelty;selected={row,protectedDistance};}}
    if(!selected)break;const radius=selected.protectedDistance*.65;
    added.push({values:selected.row.raw.slice(),memory:selected.row.memoryBefore.slice(),radius:.15*radius,memoryRadius:.5*radius});
  }
  if(!added.length)throw Error('No independent late neural-memory context');
  if(prefix.some(row=>added.some(c=>feature(row.raw,row.memoryBefore,c)!==0)))throw Error('History features violate protected neural prefix');
  return {centres:existing.concat(added),weights:weights.concat(Array(added.length*2).fill(0)),added:added.length,protectedFrames:prefix.length};
}
function prefix(track,graph,genome,centres,weights,newOffset,decay=.98,runtime=G.F){
  const car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);let ticks=0,controls=[0,0,0],protectedControls=0;
  while(car.alive&&ticks<120000){
    if(ticks%L.CONTROL_INTERVAL===0){
      const previous=structuredClone({...car,brain:null}),activity=car.brain.activity.slice(),memory=car.brain.decoderMemory?.slice()||[0,0];
      car.inputs=runtime.sense(track,car);car.physicsInputs=runtime.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);runtime.neuralStep(graph,car.brain,car.genome,car.sensorVector);
      if(vector(Array.from(car.brain.policyFeatures),memory,centres.slice(newOffset)).some(v=>v!==0)){previous.brain={activity,decoderMemory:memory};return {state:previous,ticks,protectedControls};}
      controls=commands(graph,car.brain,car.genome,centres,weights,decay);protectedControls++;
    }
    runtime.drive(track,car,controls,runtime.DT);ticks++;
  }
  throw Error('No active history-conditioned basis in original episode');
}
module.exports={feature,vector,commands,replay,grow,prefix};
