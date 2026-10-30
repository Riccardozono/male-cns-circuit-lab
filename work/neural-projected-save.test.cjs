'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Save=require('./neural-projected-save.cjs'),OldSave=require('./neural-grown-save.cjs'),{Coordinator}=require('./neural-projected-coordinator.cjs'),{Archive}=require('./neural-projected-archive.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),file=path.join(base,'projected-block-3680/model.malecns-projected-frontier.json'),text=fs.readFileSync(file,'utf8');
async function state(modelFile=file){const c=new Coordinator({modelFile,population:16,speedMultiplier:30});c.entries=c.archive.ask(c.random).map((r,id)=>({id,weights:r.weights}));return c.exportState();}
test('Projected file embeds the complete model and round-trips18 weights, RNG and archive',async()=>{const s=await state(),p=Save.parse(Save.encode(text,s));assert.deepEqual(p.state,s);assert.equal(p.modelText,text);assert.equal(p.state.archive.dimensions,18);assert.equal(p.protocol,'projected-from-line-v1');assert.equal(p.state.entries.length,16);assert.throws(()=>OldSave.parse(Save.encode(text,s)),/checksum/);});
test('Wrong formats, source fingerprint, runtime, dimensions, poses and fabricated updates fail closed',async()=>{
  const s=await state(),encoded=Save.encode(text,s),change=fn=>{const e=JSON.parse(encoded),p=JSON.parse(e.payloadJson);fn(p);e.payloadJson=JSON.stringify(p);e.sha256=crypto.createHash('sha256').update(e.payloadJson).digest('hex');return JSON.stringify(e);};
  assert.throws(()=>Save.parse('{"format":"male-cns-save"}'),/Formato/);assert.throws(()=>Save.parse(change(p=>p.engineIdentity='0'.repeat(64))),/stesso motore/);assert.throws(()=>Save.parse(change(p=>p.numericRuntime='22.22.0')),/stesso motore/);
  assert.throws(()=>Save.parse(change(p=>p.state.entries[0].weights.pop())),/incompatibile/);assert.throws(()=>Save.parse(change(p=>p.state.x=20)),/incompatibile/);assert.throws(()=>Save.parse(change(p=>p.state.actions=[[0,1,0]])),/incompatibile/);assert.throws(()=>Save.parse(change(p=>p.state.updates=1)),/incompatibile/);
});
test('The file can load another embedded compatible projected model, not only the default',async()=>{
  const other=path.join(base,'projected-frontier-3680/model.malecns-projected-frontier.json'),otherText=fs.readFileSync(other,'utf8'),s=await state(other),p=Save.parse(Save.encode(otherText,s)),dir=fs.mkdtempSync(path.join(base,'projected-save-test-'));
  const cached=await Save.materialize(p,dir);assert.equal(fs.readFileSync(cached,'utf8'),otherText);assert.equal(await Save.materialize(p,dir),cached);assert.notEqual(p.modelSha256,crypto.createHash('sha256').update(text).digest('hex'));
});
test('Block mutations preserve the other channel, protected elite and reproducible RNG',()=>{
  const c=new Coordinator({modelFile:file,population:100}),r=require('../outputs/simulation.js').rng(151216);assert.ok(c.archive.ask(r,{strength:0}).every(x=>JSON.stringify(x.weights)===JSON.stringify(c.archive.champion.weights)));
  const before=c.archive.snapshot(),rows=c.archive.ask(r,{strength:1});assert.equal(rows.length,100);assert.deepEqual(rows[0].weights,c.archive.champion.weights);assert.deepEqual(c.archive.snapshot(),before);
  for(const row of rows.slice(1)){assert.ok(row.weights.every(v=>Number.isFinite(v)&&Math.abs(v)<=8));if(row.block==='longitudinal')assert.deepEqual(row.weights.filter((_,i)=>i%2===0),row.parentWeights.filter((_,i)=>i%2===0));if(row.block==='steering')assert.deepEqual(row.weights.filter((_,i)=>i%2===1),row.parentWeights.filter((_,i)=>i%2===1));}
  const savedRng=r.getState(),a=Archive.restore(c.archive.snapshot()),b=Archive.restore(c.archive.snapshot());assert.deepEqual(a.ask(require('../outputs/simulation.js').rng(savedRng)),b.ask(require('../outputs/simulation.js').rng(savedRng)));
  assert.throws(()=>new Archive({dimensions:12,maxProgress:11586,population:16}),/18/);
});
