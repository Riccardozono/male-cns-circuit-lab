'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Model=require('./neural-frontier-model.cjs'),Arena=require('./neural-native-arena.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json');
test('Shared real topology preserves two independent full agent trajectories exactly',()=>{
  const loaded=Model.load(file),solo=Model.createFromLoaded(loaded),arena=Arena.create(loaded,[{id:0,weights:loaded.data.weights},{id:1,weights:loaded.data.weights}]);
  assert.equal(arena.agents[0].env.graph,arena.agents[1].env.graph);
  assert.notEqual(arena.agents[0].env.state().car.brain,arena.agents[1].env.state().car.brain);
  assert.notEqual(arena.agents[0].env.state().car.vehicle,arena.agents[1].env.state().car.vehicle);
  while(!solo.state().complete){solo.step();for(const a of arena.agents){a.env.step();a.controls++;}}
  for(const a of arena.agents){const s=a.env.state(),ref=solo.state();for(const k of ['x','y','heading','fitness','bestProgress'])assert.equal(s.car[k],ref.car[k]);assert.deepEqual(s.car.brain.activity,ref.car.brain.activity);assert.equal(s.laps,0);}
  assert.equal(solo.state().bestProgress,2982.192214727352);assert.ok(arena.complete());
});
test('One hundred real ghost agents start at the line with independent neurons and physics',()=>{
  const loaded=Model.load(file),arena=Arena.create(loaded,Array.from({length:100},(_,id)=>({id,weights:loaded.data.weights})));
  assert.equal(arena.agents.length,100);assert.equal(new Set(arena.agents.map(a=>a.env.graph)).size,1);
  assert.equal(new Set(arena.agents.map(a=>a.env.state().car.brain)).size,100);assert.equal(new Set(arena.agents.map(a=>a.env.state().car.vehicle)).size,100);
  for(let i=0;i<100;i++)assert.ok(arena.stepOne());
  for(const a of arena.agents){const s=a.env.state();assert.ok(s.ticks>0);assert.equal(s.car.id,a.id);assert.ok(s.car.bestProgress>=0);assert.equal(Math.min(s.car.outputs[1],s.car.outputs[2]),0);}
  assert.throws(()=>Model.createFromLoaded(loaded,{sharedTopology:{}}),/locally compiled/);
});
