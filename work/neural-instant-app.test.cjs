'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Model=require('./neural-instant-desktop-model.cjs'),Save=require('./neural-instant-save.cjs'),Old=require('./neural-chain-cuda-save.cjs'),{Coordinator}=require('./neural-instant-coordinator.cjs');
const file=path.resolve('.impeccable/review/neural-sacl/neuronal-instant-context256-first/clean.malecns-instant-context.json');
test('Six learned context coefficients, sixteen paused initial candidates and hundred-car cap',async()=>{
 const c=new Coordinator({modelFile:file});assert.equal(c.dimensions,6);assert.equal(c.population,16);assert.equal(c.running,false);assert.equal(c.updates,0);assert.equal(c.workers.length,0);
 c.entries=c.archive.ask(c.random,{strength:1}).map((r,id)=>({id,weights:r.weights}));assert.equal(new Set(c.entries.map(e=>JSON.stringify(e.weights))).size,16);
 const state=await c.exportState(),text=Save.encode(fs.readFileSync(file,'utf8'),state);assert.deepEqual(Save.parse(text).state,state);assert.throws(()=>Old.parse(text));assert.throws(()=>Save.parse(fs.readFileSync('.impeccable/review/neural-sacl/chain-cuda-training-ui-first/roundtrip.malecns-chain-cuda-dev','utf8')));
 assert.throws(()=>new Coordinator({modelFile:file,population:101}));const restored=new Coordinator({modelFile:file,restored:Save.parse(text).state});assert.equal(restored.running,false);assert.deepEqual(restored.archive.snapshot(),c.archive.snapshot());
});
test('Actually stepped cars share immutable topology/model data, never brains or physical/controller memory',()=>{
 try{const loaded=Model.load(file),a=Model.createFromLoaded(loaded,{id:0}),b=Model.createFromLoaded(loaded,{id:1,sharedTopology:a.topology});
 assert.equal(a.graph,b.graph);assert.notEqual(a.currentCar().brain,b.currentCar().brain);assert.notEqual(a.currentCar().brain.activity.buffer,b.currentCar().brain.activity.buffer);
 const before=structuredClone(b.state());for(let i=0;i<12;i++)a.step();assert.deepEqual(b.state(),before);assert(a.state().totalSimulationSeconds>0);assert.equal(b.state().totalSimulationSeconds,0);assert.equal(Model.stats().cpuFallbacks,0);
 }finally{Model.closeCuda();}
});
