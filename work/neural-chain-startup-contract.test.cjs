'use strict';
// Constructor contract only: no window opened and no physical episode claimed.
const test=require('node:test'),assert=require('node:assert/strict');
const Model=require('./neural-chain-desktop-model.cjs');
const {Coordinator}=require('./neural-chain-coordinator.cjs');

test('Default constructor preserves requested 16 cars, paused verified warm start',()=>{
  const choice=Model.defaultChoice();
  const c=new Coordinator({modelFile:choice.file});
  assert.equal(c.population,16);
  assert.equal(c.running,false);
  assert.equal(c.workers.length,0);
  assert.equal(c.completedEpisodes,0);
  assert.equal(c.updates,0);
  // Registry is a metric summary; the loaded proof additionally keeps diagnostics.
  for(const [key,value] of Object.entries(choice.result)){
    assert.deepEqual(c.loaded.data.verifiedFullResult[key],value,key);
  }
  assert.deepEqual(c.archive.champion.weights,c.loaded.data.weights);
  assert.equal(c.archive.champion.progress,choice.result.bestProgress);
});

test('100 car option remains paused; populations above maximum are rejected',()=>{
  const choice=Model.defaultChoice();
  const c=new Coordinator({modelFile:choice.file,population:100});
  assert.equal(c.population,100);
  assert.equal(c.running,false);
  assert.throws(()=>new Coordinator({modelFile:choice.file,population:101}),/Population|population/);
});
