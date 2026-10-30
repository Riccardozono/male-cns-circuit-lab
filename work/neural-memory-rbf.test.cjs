'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('./neural-memory-rbf.cjs'),E=require('./ppo-environment.cjs');
test('Recurrent residual remembers only its own neural drive and resets when silenced',()=>{
  const s=new E.F.Simulation(E.X.model(require('../outputs/data/connectome.json')),{population:1}),car=s.cars[0];E.observe(s.track,s.graph,car);
  const raw=Array.from(car.brain.policyFeatures),centres=[{values:raw,radius:.1}],base=E.L.commands(s.graph,car.brain,car.genome);
  assert.deepEqual(M.commands(s.graph,car.brain,car.genome,centres,[0,0],.9),base);assert.deepEqual(car.brain.decoderMemory,[0,0]);
  M.commands(s.graph,car.brain,car.genome,centres,[1,-1],.9);assert.deepEqual(car.brain.decoderMemory,[.125,-.125]);
  const away=[{values:raw.map(v=>v+1),radius:.1}];M.commands(s.graph,car.brain,car.genome,away,[1,-1],.9);assert.deepEqual(car.brain.decoderMemory,[.1125,-.1125]);
  assert.deepEqual(M.commands(s.graph,car.brain,car.genome,centres,[8,8],.9,true,false),[0,0,0]);assert.deepEqual(car.brain.decoderMemory,[0,0]);assert.throws(()=>M.commands(s.graph,car.brain,car.genome,centres,[1,1],1),/decay/);
});
