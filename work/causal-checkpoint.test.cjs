'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),G=require('./guard-memory-runtime.cjs'),H=require('./causal-checkpoint.cjs');
test('Causal checkpoint checks decoder architecture, source and biological identity',()=>{
  const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',sim=G.create(),genome=sim.cars[0].genome,body={format:'male-cns-causal-memory-experiment',schema:1,decoder:'history-conditioned-neural-memory-v2',appVersion:'5.6.0',objectiveRevision:G.F.Rewards.REVISION,graph:G.X.P.compatibleGraph(sim.graph),sourceSha256:'local-fixture',legacySourceSha256:G.C.hashFile(original),sourceHashes:{'work/neural-causal-memory.cjs':G.C.hashFile(path.join(G.root,'work/neural-causal-memory.cjs'))},baseGenome:genome,centres:[{values:Array(sim.graph.learning.nodes.length).fill(.2),radius:.1},{values:Array(sim.graph.learning.nodes.length).fill(.3),radius:.1,memory:[-.1,.2],memoryRadius:.1}],championWeights:[0,0,0,0],explorerWeights:[0,0,0,0],decay:.98,fixedCoefficients:2};
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'malecns-causal-checkpoint-test-')),file=path.join(directory,'fixture.json');
  const write=b=>fs.writeFileSync(file,JSON.stringify(G.C.seal(b)));
  try{
    write(body);assert.equal(H.load(file).saved.decoder,body.decoder);
    for(const change of [b=>{b.decoder='legacy';},b=>{b.objectiveRevision='progress-3';},b=>{b.centres[1].memory[0]=3;},b=>{b.fixedCoefficients=3;},b=>{b.graph.nodes--;},b=>{b.sourceHashes['work/neural-causal-memory.cjs']='0'.repeat(64);}]){const invalid=structuredClone(body);change(invalid);write(invalid);assert.throws(()=>H.load(file));}
    write(body);const corrupt=JSON.parse(fs.readFileSync(file,'utf8'));corrupt.decay=.9;fs.writeFileSync(file,JSON.stringify(corrupt));assert.throws(()=>H.load(file),/checksum/);
  }finally{fs.unlinkSync(file);fs.rmdirSync(directory);}
});
