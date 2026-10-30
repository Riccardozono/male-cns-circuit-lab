'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Save=require('./neural-grown-save.cjs'),Model=require('./neural-grown-model.cjs'),OldSave=require('./neural-native-save.cjs'),{Coordinator}=require('./neural-grown-coordinator.cjs');
const base=path.resolve(__dirname,'../.impeccable/review/neural-sacl'),file=path.join(base,'grown-coordinates-native/model.malecns-neural-grown.json'),text=fs.readFileSync(file,'utf8');
test('Whole numeric decoder plus actual archive/RNG/genes round-trips, no position or actions',async()=>{
  // exportState requires begin() for current genes; do not start workers here.
  const c=new Coordinator({modelFile:file,population:4,speedMultiplier:30});c.entries=c.archive.ask(c.random).map((r,id)=>({id,weights:r.weights}));
  const s=await c.exportState(),p=Save.parse(Save.encode(text,s));assert.deepEqual(p.state,s);assert.equal(p.modelText,text);assert.equal(p.protocol,'grown-from-line-v1');assert.equal(p.state.x,undefined);assert.equal(p.state.actions,undefined);assert.equal(p.state.archive.dimensions,12);
  assert.throws(()=>OldSave.parse(Save.encode(text,s),'0'.repeat(64)),/checksum/);
});
test('Old formats, forged engine, wrong dimensions, historical actions and invented generations are rejected',async()=>{
  const c=new Coordinator({modelFile:file,population:4});c.entries=c.archive.ask(c.random).map((r,id)=>({id,weights:r.weights}));const s=await c.exportState(),encoded=Save.encode(text,s);
  const alter=fn=>{const e=JSON.parse(encoded),p=JSON.parse(e.payloadJson);fn(p);e.payloadJson=JSON.stringify(p);e.sha256=crypto.createHash('sha256').update(e.payloadJson).digest('hex');return JSON.stringify(e);};
  assert.throws(()=>Save.parse('{"format":"male-cns-save"}'),/checksum/);assert.throws(()=>Save.parse(alter(p=>p.engineIdentity='0'.repeat(64))),/stessa copia/);assert.throws(()=>Save.parse(alter(p=>p.numericRuntime='22.22.0')),/stessa copia/);
  assert.throws(()=>Save.parse(alter(p=>p.state.entries[0].weights.pop())),/incompatibile/);assert.throws(()=>Save.parse(alter(p=>p.state.actions=[[0,1,0]])),/incompatibile/);assert.throws(()=>Save.parse(alter(p=>p.state.updates=1)),/incompatibile/);
});
test('Embedded compatible parent is importable even when different from the current default model',async()=>{
  const other=path.join(base,'grown-native-model/model.malecns-neural-grown.json'),otherText=fs.readFileSync(other,'utf8'),c=new Coordinator({modelFile:other,population:4});c.entries=c.archive.ask(c.random).map((r,id)=>({id,weights:r.weights}));
  const p=Save.parse(Save.encode(otherText,await c.exportState())),dir=fs.mkdtempSync(path.join(base,'grown-save-test-')),cached=await Save.materialize(p,dir);assert.equal(Model.load(cached).sha256,p.modelSha256);assert.notEqual(p.modelSha256,Model.load(file).sha256);assert.equal(fs.readFileSync(cached,'utf8'),otherText);
  assert.equal(await Save.materialize(p,dir),cached); // never overwrite an existing model
});
test('Zero mutation clones protected learned weights; nonzero includes small and broad proposals',()=>{
  const c=new Coordinator({modelFile:file,population:100}),r=require('../outputs/simulation.js').rng(151216),z=c.archive.ask(r,{strength:0});assert.ok(z.every(x=>JSON.stringify(x.weights)===JSON.stringify(c.archive.champion.weights)));
  const proposals=c.archive.ask(r,{strength:1});assert.deepEqual(proposals[0].weights,c.archive.champion.weights);assert.ok(proposals.some(x=>x.sigma>=1.1));assert.ok(proposals.some(x=>x.sigma<=.05));assert.ok(proposals.every(x=>x.weights.every(v=>Number.isFinite(v)&&Math.abs(v)<=8)));
});
