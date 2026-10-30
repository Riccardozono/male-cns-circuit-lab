'use strict';
// Learn state-dependent retention of the old motor memory. The gate has no
// geometric or desired-action inputs. Zero old memory means zero correction,
// including when a commonly observed neural context is active at startup.
const G=require('./guard-memory-runtime.cjs'),N=require('./neural-causal-memory.cjs'),R=require('./neural-local-rbf.cjs'),L=G.X.L;
const readouts=new WeakMap();
function configure(graph,indices){
  if(!Array.isArray(indices)||indices.length<64||indices.length>251||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=graph.n||graph.classNames[graph.classCodes[i]]!=='descending_neuron'))throw Error('Expanded readout requires distinct actual descending neurons');
  readouts.set(graph,indices.slice());
}
function raw(graph,brain){const indices=readouts.get(graph);if(!indices)throw Error('Expanded neural readout not configured');return indices.map(i=>Math.tanh(8*brain.activity[i]));}
function features(raw,centres){return R.vector(raw,centres);}
function commands(graph,brain,genome,baseCentres,baseWeights,centres,weights,decay=.98,enabled=true,edgesEnabled=true){
  const base=N.commands(graph,brain,genome,baseCentres,baseWeights,decay,enabled,edgesEnabled);
  if(!enabled||!edgesEnabled||!graph.learning.nodes.some(i=>Math.abs(brain.activity[i])>=1e-7))return [0,0,0];
  if(weights.length!==centres.length*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid memory gate weights');
  const values=features(raw(graph,brain),centres),norm=centres.length?1/Math.sqrt(centres.length):0,memory=brain.decoderMemory;
  const correction=action=>memory[action]*values.reduce((sum,v,k)=>sum+v*weights[k*2+action]*norm,0),s=correction(0),a=correction(1);
  if(s===0&&a===0)return base;
  const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v))),steering=Math.tanh(atanh(base[0])+s),longitudinal=Math.tanh(atanh(base[1]-base[2])+a);
  return [steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
}
function centresFromExperience(observations,limit=12){
  if(!observations?.length||!Number.isInteger(limit)||limit<1||limit>24)throw Error('Actual neural observations required');
  const rows=observations.map(row=>row.raw),dimension=rows[0].length,mean=Array.from({length:dimension},(_,j)=>rows.reduce((sum,r)=>sum+r[j],0)/rows.length);
  const selected=[rows.reduce((a,b)=>R.rms(a,mean)<R.rms(b,mean)?a:b)];
  while(selected.length<limit){let next=null,largest=.005;for(const raw of rows){const d=Math.min(...selected.map(c=>R.rms(raw,c)));if(d>largest){largest=d;next=raw;}}if(!next)break;selected.push(next);}
  return selected.map(values=>{const nearest=Math.min(...selected.filter(c=>c!==values).map(c=>R.rms(values,c)));return {values:values.slice(),radius:Number.isFinite(nearest)?Math.max(.02,nearest*1.5):.1};});
}
function replay(track,graph,genome,baseCentres,baseWeights,centres,weights,{state=null,startTicks=0,maxTicks=120000,trace=false,decay=.98,runtime=G.F,onTick=null}={}){
  let car;if(state){car=structuredClone({...state,brain:null});car.genome=runtime.cloneGenome(genome);car.brain=runtime.makeBrain(graph);car.brain.activity.set(state.brain.activity);car.brain.decoderMemory=state.brain.decoderMemory.slice();}
  else{car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);}
  if(startTicks%L.CONTROL_INTERVAL!==0)throw Error('Unaligned memory gate prefix');let ticks=startTicks,controls=[0,0,0];const observations=[];
  while(car.alive&&ticks<maxTicks){
    if(ticks%L.CONTROL_INTERVAL===0){car.inputs=runtime.sense(track,car);car.physicsInputs=runtime.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);const memoryBefore=car.brain.decoderMemory?.slice()||[0,0];runtime.neuralStep(graph,car.brain,car.genome,car.sensorVector);controls=commands(graph,car.brain,car.genome,baseCentres,baseWeights,centres,weights,decay);if(trace)observations.push({raw:raw(graph,car.brain),baseRaw:Array.from(car.brain.policyFeatures),memoryBefore,memoryAfter:car.brain.decoderMemory.slice(),progress:car.bestProgress});}
    runtime.drive(track,car,controls,runtime.DT);onTick?.(car,controls,ticks);ticks++;
  }
  return {result:{bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'evaluation censored':car.reason,complete:!car.alive,simulationSeconds:ticks*runtime.DT,lapTimes:car.lapTimes.slice()},executedTicks:ticks-startTicks,ticks,observations};
}
function prefix(track,graph,genome,baseCentres,baseWeights,centres,decay=.98,runtime=G.F){
  const car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);let ticks=0,controls=[0,0,0];
  while(car.alive&&ticks<120000){
    if(ticks%L.CONTROL_INTERVAL===0){
      const previous=structuredClone({...car,brain:null}),activity=car.brain.activity.slice(),memory=car.brain.decoderMemory?.slice()||[0,0];car.inputs=runtime.sense(track,car);car.physicsInputs=runtime.physicsSense(car,track);car.sensorVector=car.inputs.concat(car.physicsInputs);runtime.neuralStep(graph,car.brain,car.genome,car.sensorVector);controls=N.commands(graph,car.brain,car.genome,baseCentres,baseWeights,decay);
      if(car.brain.decoderMemory.some(v=>v!==0)&&features(raw(graph,car.brain),centres).some(v=>v!==0)){previous.brain={activity,decoderMemory:memory};return {state:previous,ticks};}
    }
    runtime.drive(track,car,controls,runtime.DT);ticks++;
  }
  throw Error('No active memory-gated neural context');
}
module.exports={configure,raw,features,commands,centresFromExperience,replay,prefix};
