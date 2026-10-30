'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),P=require('../progress-save.js'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json');
const {DesktopEngine}=require('../../desktop/engine.cjs');

test('Inspection of a restored paused generation cannot broadcast a champion',()=>{
  const engine=new DesktopEngine('',()=>{},()=>{}),messages=[];
  engine.options={running:false};engine.seenGenerations=[80,65];engine.workers=[{postMessage:m=>messages.push(m)},{postMessage:m=>messages.push(m)}];
  const champion={marker:'genome'},state={generation:80,bestEver:100,champion,championStats:{fitness:100}};
  engine.considerChampion(0,state);assert.equal(engine.globalChampion,null);assert.deepEqual(messages,[]);
  engine.considerChampion(0,{...state,generation:81});
  assert.deepEqual(engine.globalChampion,champion);assert.equal(messages.filter(m=>m.type==='adoptChampion').length,2,
    'an explicit completed generation while paused may still update the record');
});

test('Resuming a restored global champion broadcasts it to the workers',async()=>{
  const engine=new DesktopEngine('',()=>{},()=>{}),messages=[];
  engine.options={running:false};engine.workers=[{postMessage:m=>messages.push(m)},{postMessage:m=>messages.push(m)}];
  engine.globalChampion={marker:'genome'};
  await engine.command({type:'pause',value:true});
  assert.deepEqual(messages.map(m=>m.type),['pause','pause','adoptChampion','adoptChampion']);
  assert.equal(engine.options.running,true);
});

test('A new shared champion waits for the previously saved champion to be evaluated',()=>{
  const make=()=>new F.Simulation(Legacy.buildV2(data),{population:4,seed:7717});
  const sim=make(),first=F.cloneGenome(sim.cars[1].genome),second=F.cloneGenome(sim.cars[2].genome);
  assert.notDeepEqual(first,second);
  sim.adoptChampion(first);sim.adoptChampion(second);
  assert.deepEqual(sim.externalChampion,first);assert.deepEqual(sim.pendingExternalChampion,second);
  const saved=P.capture(sim);assert.deepEqual(saved.externalChampion,first);
  assert.equal(JSON.stringify(saved).includes('pendingExternalChampion'),false,'transient queue must not change the save schema');
  const restored=make();P.restore(restored,saved);assert.equal(restored.pendingExternalChampion,null);
  restored.adoptChampion(second);restored.evolve();
  assert.ok(restored.cars.some(car=>JSON.stringify(car.genome)===JSON.stringify(first)),'first champion must reach the next population');
  assert.deepEqual(restored.externalChampion,second,'the latest shared champion is queued for the following generation');
  assert.equal(restored.pendingExternalChampion,null);
  restored.evolve();assert.ok(restored.cars.some(car=>JSON.stringify(car.genome)===JSON.stringify(second)),'second champion must also reach a population');
});
