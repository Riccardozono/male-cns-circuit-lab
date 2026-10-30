'use strict';
const F=require('../outputs/simulation.js'),Dense=require('../outputs/dense-neural.js');
const indices=new WeakMap();
function tick(sim,batch){
  if(sim.ticks%sim.neuralInterval!==0||sim.mode!=='connectome'||!sim.learningEnabled||sim.graph.full){sim.tick();return;}
  const cars=sim.cars.filter(c=>c.alive),requests=[],previous=Dense.step;
  if(!cars.length){sim.tick();return;}
  // Let the original encoder prepare each injection/gain request. Its temporary
  // old-state readout is discarded; the original tick decodes the updated brain.
  Dense.step=(graph,brain,iterations,enabled,gains)=>{if(graph!==sim.graph||!enabled)throw Error('Unsupported batch request');requests.push({brain,iterations,gains});};
  try{
    for(const car of cars){
      car.inputs=F.sense(sim.track,car);car.physicsInputs=F.physicsSense(car,sim.track);car.sensorVector=car.inputs.concat(car.physicsInputs);
      F.neuralStep(sim.graph,car.brain,car.genome,car.sensorVector,true,true,sim.track.halfWidth<20?F.MAP_PHYSICS_ADAPTER_GAIN:F.PHYSICS_ADAPTER_GAIN);
    }
  }finally{Dense.step=previous;}
  if(requests.length!==cars.length||requests.some(r=>r.iterations!==requests[0].iterations))throw Error('Incomplete batch preparation');
  batch.passMany(sim.graph,requests.map(r=>r.brain),requests[0].iterations,requests.map(r=>r.gains));
  let active=indices.get(sim.graph);if(!active){active=Uint32Array.from({length:sim.graph.n},(_,i)=>i);indices.set(sim.graph,active);}
  const overrides=new Map(cars.map(car=>[car.id,{active,values:car.brain.activity.slice()}]));
  sim.tick(overrides,true);
}
module.exports={tick};
