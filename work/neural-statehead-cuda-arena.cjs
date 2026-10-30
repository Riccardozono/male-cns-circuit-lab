'use strict';
// Actual independent from-line agents; immutable topology only is shared.
const Model=require('./neural-statehead-cuda-model.cjs'),crypto=require('node:crypto');
function create(loaded,entries,{previousLapTime=null,sharedTopology=null}={}){
  if(!Array.isArray(entries)||entries.length<1||entries.length>100||new Set(entries.map(r=>r.id)).size!==entries.length)throw Error('One to 100 distinct actual agents required');
  const agents=[];let topology=sharedTopology;
  for(const entry of entries){const env=Model.createFromLoaded(loaded,{weights:entry.weights,sharedTopology:topology,id:entry.id,previousLapTime});topology=env.topology;agents.push({id:entry.id,weights:entry.weights.slice(),env,controls:0,trace:crypto.createHash('sha256')});}
  let cursor=0,rounds=0;
  function stepOne(){if(complete())return false;const agent=agents[cursor];cursor=(cursor+1)%agents.length;if(cursor===0)rounds++;if(agent.env.currentCar().alive){const state=agent.env.step();agent.controls++;agent.trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n');}return true;}
  const complete=()=>agents.every(a=>!a.env.currentCar().alive);
  function result(a){const s=a.env.state(),c=s.car;return {id:a.id,weights:a.weights.slice(),fitness:s.fitness,baseFitness:c.baseFitness,progress:s.bestProgress,laps:s.laps,reason:s.reason,lapTimes:s.lapTimes.slice(),totalSimulationSeconds:s.totalSimulationSeconds,complete:s.complete,censored:false,overlap:Number(c.outputs[1]>0&&c.outputs[2]>0),controls:a.controls,actionTraceSha256:a.trace.copy().digest('hex')};}
  return {agents,stepOne,complete,results:()=>agents.map(result),rounds:()=>rounds,topology};
}
module.exports={create};
