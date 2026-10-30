'use strict';
// Pure initial-state contract tests; no completed episode or learning result
// is invented. Actual worker episodes are covered by the separate UI fixture.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Save=require('./neural-chain-cuda-save.cjs'),CPU=require('./neural-chain-save.cjs'),Model=require('./neural-chain-cuda-model.cjs'),{Coordinator}=require('./neural-chain-cuda-coordinator.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
test('Verified compatible default is selected and constructor remains paused with sixteen cars',()=>{
 const selected=Model.defaultChoice(),c=new Coordinator({modelFile:selected.file});
 assert.equal(selected.modelSha256,'4a752dfb82c2268721f0ae100e550bd174be81a04e96ca7259b3e29814043d80');
 assert.equal(c.population,16);assert.equal(c.running,false);assert.equal(c.generation,1);assert.equal(c.completedEpisodes,0);assert.equal(c.updates,0);assert.equal(c.workers.length,0);
 assert.equal(c.loaded.data.verifiedFullResult.laps,1);assert.throws(()=>new Coordinator({modelFile:selected.file,population:101}));
});
test('Dedicated CUDA save roundtrips initial weights archive RNG; CPU engine and forged identity are refused',async()=>{
 const c=new Coordinator({modelFile:Model.defaultChoice().file});
 c.entries=c.archive.ask(c.random,{strength:c.mutation/.16}).map((row,id)=>({id,weights:row.weights}));
 const state=await c.exportState(),modelText=fs.readFileSync(c.modelFile,'utf8'),encoded=Save.encode(modelText,state),parsed=Save.parse(encoded);
 assert.deepEqual(parsed.state,state);assert.notEqual(parsed.engineIdentity,CPU.identity());assert.throws(()=>CPU.parse(encoded));assert.throws(()=>Save.parse(CPU.encode(modelText,state)));
 const envelope=JSON.parse(encoded),payload=JSON.parse(envelope.payloadJson);payload.engineIdentity='0'.repeat(64);envelope.payloadJson=JSON.stringify(payload);envelope.sha256=sha(envelope.payloadJson);assert.throws(()=>Save.parse(JSON.stringify(envelope)));
 const restored=new Coordinator({modelFile:c.modelFile,restored:parsed.state});assert.equal(restored.running,false);assert.deepEqual(restored.restoredEntries,c.entries);assert.deepEqual(restored.archive.snapshot(),c.archive.snapshot());
 const sourceFiles=Save.sourceFiles();assert(sourceFiles.includes('work/neural-chain-cuda-ui.js'));assert(sourceFiles.some(f=>f.endsWith('kernel.ptx')));assert(sourceFiles.some(f=>f.endsWith('koffi.node')));
});
