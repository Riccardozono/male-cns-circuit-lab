'use strict';
// An experimental residual decoder over actual descending-neuron activity.
// Compact support guarantees exactly zero contribution outside each learned
// neural neighbourhood. Centres are observations, not locations or actions.
const Env=require('./ppo-environment.cjs'),{F,L}=Env;
const rms=(a,b)=>Math.sqrt(a.reduce((s,v,j)=>s+(v-b[j])**2,0)/a.length);
function feature(raw,centre){const r=rms(raw,centre.values)/centre.radius;return r>=1?0:(1-r)**4*(4*r+1);}
function vector(raw,centres){return centres.map(centre=>feature(raw,centre));}
function centresFromExperience(rows,prefix,limit=16,existing=[]){
  if(!rows.length||!prefix.length||!Number.isInteger(limit)||limit<1)throw Error('Actual neural experience required');
  const centres=existing.map(c=>({values:c.values.slice(),radius:c.radius}));
  while(centres.length<limit){
    let selected=null,largest=.025;
    for(const raw of rows){const d=Math.min(...prefix.map(p=>rms(raw,p)));if(d<.05)continue;const novelty=Math.min(d,...centres.map(c=>rms(raw,c.values)));if(novelty>largest){largest=novelty;selected={values:raw.slice(),radius:d*.65};}}
    if(!selected)break;centres.push(selected);
  }
  return centres;
}
function commands(graph,brain,genome,centres,weights,enabled=true,edgesEnabled=true){
  const base=L.commands(graph,brain,genome,enabled,edgesEnabled);if(!enabled||!edgesEnabled||!L.valid(graph,genome.policyWeights))return base;
  const p=graph.learning,raw=Array.from(p.nodes,index=>Math.tanh(8*(Number(brain.activity[index])||0)));
  if(!p.nodes.some(index=>Math.abs(brain.activity[index])>=1e-7))return [0,0,0];
  const features=vector(raw,centres),norm=1/Math.sqrt(p.nodes.length);let steering=0,longitudinal=0;
  if(weights.length!==centres.length*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid residual decoder coefficients');
  for(let k=0;k<centres.length;k++){steering+=features[k]*weights[k*2]*norm;longitudinal+=features[k]*weights[k*2+1]*norm;}
  if(steering===0&&longitudinal===0)return base;
  const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v))),s=Math.tanh(atanh(base[0])+steering),a=Math.tanh(atanh(base[1]-base[2])+longitudinal);
  return [s,Math.max(0,a),Math.max(0,-a)];
}
function replay(track,graph,genome,centres,weights,{state=null,startTicks=0,maxTicks=120000,trace=false}={}){
  let car;if(state){car=structuredClone({...state,brain:null});car.genome=F.cloneGenome(genome);car.brain=F.makeBrain(graph);car.brain.activity.set(state.brain.activity);}else car=Env.place(track,graph,genome,null);
  let controls=[0,0,0],ticks=startTicks,maxBrake=0,maxSteer=0;const observations=[];
  if(ticks%L.CONTROL_INTERVAL!==0)throw Error('Cached prefix is not aligned to a real control tick');
  while(car.alive&&ticks<maxTicks){
    if(ticks%L.CONTROL_INTERVAL===0){Env.observe(track,graph,car);controls=commands(graph,car.brain,car.genome,centres,weights);if(trace)observations.push({raw:Array.from(car.brain.policyFeatures),progress:car.bestProgress});}
    maxBrake=Math.max(maxBrake,controls[2]);maxSteer=Math.max(maxSteer,Math.abs(controls[0]));F.drive(track,car,controls,F.DT);ticks++;
  }
  const result={bestProgress:car.bestProgress,fitness:car.fitness,laps:car.laps,reason:car.alive?'evaluation censored':car.reason,complete:!car.alive,simulationSeconds:ticks*F.DT,lapTimes:car.lapTimes.slice()};
  return {result,ticks,executedTicks:ticks-startTicks,maxBrake,maxSteer,observations};
}
function prefixState(track,graph,genome,centres,runtime=F){
  const car=runtime.makeCar(track,0,runtime.cloneGenome(genome));car.brain=runtime.makeBrain(graph);
  const observed=[];let ticks=0,controls=[0,0,0];
  while(car.alive&&ticks<120000){
    // Capture BEFORE observing at the next control boundary, so the copied
    // tail performs exactly the same neural iteration as a full replay.
    if(ticks%L.CONTROL_INTERVAL===0){
      const previous=structuredClone({...car,brain:null}),activity=car.brain.activity.slice();
      car.sensorVector=runtime.sense(track,car).concat(runtime.physicsSense(car,track));runtime.neuralStep(graph,car.brain,car.genome,car.sensorVector);const raw=Array.from(car.brain.policyFeatures);
      if(vector(raw,centres).some(v=>v!==0)){previous.brain={activity};return {state:previous,ticks,observed,firstActive:raw};}
      observed.push(raw);controls=L.commands(graph,car.brain,car.genome);
    }
    runtime.drive(track,car,controls,runtime.DT);ticks++;
  }
  throw Error('No active learned neural neighbourhood in the incumbent episode');
}
module.exports={rms,feature,vector,centresFromExperience,commands,replay,prefixState};
