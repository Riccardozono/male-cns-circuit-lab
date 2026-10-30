'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('./neural-local-rbf.cjs'),E=require('./ppo-environment.cjs');
test('Local neural basis has exact compact support and no preferred action',()=>{
  assert.equal(R.feature([0,0],{values:[1,1],radius:.5}),0);assert.equal(R.feature([1,1],{values:[1,1],radius:.5}),1);
  const centres=R.centresFromExperience([[.1,.1],[.4,.4],[.7,.7]],[[0,0]],3);assert.ok(centres.length>0);assert.ok(R.vector([0,0],centres).every(v=>v===0));
});
test('Silent/disabled brain cannot drive, zero residual exactly preserves neural commands',()=>{
  const s=new E.F.Simulation(E.X.model(require('../outputs/data/connectome.json')),{population:1}),car=s.cars[0],n=s.graph.learning.nodes.length,centres=[{values:Array(n).fill(0),radius:1}];
  assert.deepEqual(R.commands(s.graph,car.brain,car.genome,centres,[8,8]),[0,0,0]);
  E.observe(s.track,s.graph,car);assert.deepEqual(R.commands(s.graph,car.brain,car.genome,centres,[0,0]),E.L.commands(s.graph,car.brain,car.genome));assert.deepEqual(R.commands(s.graph,car.brain,car.genome,centres,[8,8],true,false),[0,0,0]);
});
