'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-chain-desktop-model.cjs'),Save=require('./neural-chain-save.cjs'),OldSave=require('./neural-projected-save.cjs'),Arena=require('./neural-chain-arena.cjs'),{Coordinator}=require('./neural-chain-coordinator.cjs'),{Archive}=require('./neural-chain-archive.cjs');
const choice=Model.defaultChoice(),file=choice.file,text=fs.readFileSync(file,'utf8'),base=path.resolve(__dirname,'../.impeccable/review/neural-sacl');
async function state(modelFile=file){const c=new Coordinator({modelFile,population:16,speedMultiplier:30});c.entries=c.archive.ask(c.random).map((r,id)=>({id,weights:r.weights}));return c.exportState();}
test('Best default is the globally protected proven model, not the latest experiment',()=>{
  assert.equal(choice.modelSha256,'4a752dfb82c2268721f0ae100e550bd174be81a04e96ca7259b3e29814043d80');assert.equal(choice.result.laps,1);assert.equal(choice.result.bestProgress,6584.838934902363);assert.equal(Model.load(file).data.weights.length,2);
  assert.throws(()=>Model.load(path.join(base,'neuronal-chain-6541-search/exploration.malecns-frontier-chain.json')),/exploration/);
});
test('New file embeds the complete decoder, two coefficients, archive, RNG and history',async()=>{
  const s=await state(),encoded=Save.encode(text,s),parsed=Save.parse(encoded);assert.deepEqual(parsed.state,s);assert.equal(parsed.modelText,text);assert.equal(parsed.protocol,'neuronal-chain-from-line-v1');assert.equal(parsed.state.archive.dimensions,2);assert.equal(parsed.state.entries.length,16);assert.throws(()=>OldSave.parse(encoded),/Formato/);
  const files=Save.sourceFiles();for(const source of ['work/neural-frontier-chain.cjs','work/neural-command-live.cjs','work/neural-command-residual.cjs','.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-penalty5/outputs/terrain.js','.impeccable/experimental-penalty5/outputs/data/terrain.js','work/neural-chain-ui.js','outputs/styles.css','.impeccable/runtime-node24/node.exe'])assert.ok(files.includes(source),source);
});
test('Wrong formats, sources, runtime, fabricated generations, poses and action tapes are rejected',async()=>{
  const s=await state(),encoded=Save.encode(text,s),change=fn=>{const e=JSON.parse(encoded),p=JSON.parse(e.payloadJson);fn(p);e.payloadJson=JSON.stringify(p);e.sha256=crypto.createHash('sha256').update(e.payloadJson).digest('hex');return JSON.stringify(e);};
  assert.throws(()=>Save.parse('{"format":"male-cns-save"}'),/Formato/);assert.throws(()=>Save.parse(change(p=>p.engineIdentity='0'.repeat(64))),/stesso motore/);assert.throws(()=>Save.parse(change(p=>p.numericRuntime='22.22.0')),/stesso motore/);assert.throws(()=>Save.parse(change(p=>p.state.entries[0].weights.pop())),/incompatibile/);assert.throws(()=>Save.parse(change(p=>p.state.x=20)),/incompatibile/);assert.throws(()=>Save.parse(change(p=>p.state.actions=[[0,1,0]])),/incompatibile/);assert.throws(()=>Save.parse(change(p=>p.state.updates=1)),/incompatibile/);assert.throws(()=>Save.parse(change(p=>p.state.archive.evaluations++)),/incompatibile/);
});
test('Protected elite and channel-specific antithetic mutation preserve exact RNG behavior',()=>{
  const c=new Coordinator({modelFile:file,population:100}),rng=require('../outputs/simulation.js').rng(151216);assert.ok(c.archive.ask(rng,{strength:0}).every(x=>JSON.stringify(x.weights)===JSON.stringify(c.archive.champion.weights)));const before=c.archive.snapshot(),rows=c.archive.ask(rng,{strength:1});assert.equal(rows.length,100);assert.deepEqual(rows[0].weights,c.archive.champion.weights);assert.deepEqual(c.archive.snapshot(),before);
  for(const row of rows.slice(1)){assert.ok(row.weights.every(v=>Number.isFinite(v)&&Math.abs(v)<=8));if(row.block==='longitudinal')assert.equal(row.weights[0],row.parentWeights[0]);if(row.block==='steering')assert.equal(row.weights[1],row.parentWeights[1]);}
  const a=Archive.restore(before),b=Archive.restore(before),saved=rng.getState(),make=require('../outputs/simulation.js').rng;assert.deepEqual(a.ask(make(saved)),b.ask(make(saved)));assert.throws(()=>new Archive({dimensions:18,maxProgress:11586,population:16}),/two-coefficient/);
});
test('One hundred actual ghost cars share only topology and keep independent neuronal and physical state',()=>{
  const loaded=Model.load(file),arena=Arena.create(loaded,Array.from({length:100},(_,id)=>({id,weights:loaded.data.weights})));assert.equal(new Set(arena.agents.map(a=>a.env.graph)).size,1);assert.equal(new Set(arena.agents.map(a=>a.env.currentCar().brain)).size,100);assert.equal(new Set(arena.agents.map(a=>a.env.currentCar().vehicle)).size,100);
  for(let i=0;i<100;i++)arena.stepOne();for(const a of arena.agents){const s=a.env.state();assert.ok(s.ticks>0);assert.equal(s.car.id,a.id);assert.ok(s.car.outputs.every(Number.isFinite));assert.equal(Math.min(s.car.outputs[1],s.car.outputs[2]),0);}
  assert.throws(()=>Model.createFromLoaded(loaded,{sharedTopology:{}}),/locally compiled/);assert.throws(()=>Model.createFromLoaded({...loaded}),/Actually loaded/);assert.throws(()=>Model.createFromLoaded(loaded,{weights:[0,NaN]}),/Actually loaded/);
});
