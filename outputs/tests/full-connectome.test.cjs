const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const F=require('../simulation.js');
const metadata=require('../data/connectome-full.json');

const constructors={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array};

function loadFull(){
  const bytes=fs.readFileSync(path.join(__dirname,'../data',metadata.binary));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const data={...metadata,compact:true};
  for(const [name,descriptor] of Object.entries(metadata.arrays))data[name]=new constructors[descriptor.dtype](buffer,descriptor.offset,descriptor.length);
  return {bytes,data};
}

test('Complete annotated MaleCNS bundle has verified counts and checksum',()=>{
  const {bytes,data}=loadFull();
  assert.equal(metadata.nodeCount,166700);
  assert.equal(metadata.edgeCount,6242118);
  assert.equal(metadata.synapseCount,89860280);
  assert.equal(metadata.minimumSynapseCount,5);
  assert.equal(metadata.coreNodeCount,7721);
  assert.equal(metadata.solver.iterationsPerControlTick,2);
  assert.equal(metadata.solver.activeNeuronBudget,8192);
  assert.equal(bytes.length,metadata.binaryBytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),metadata.binarySha256);
  assert.equal(data.bodyIds.length,metadata.nodeCount);
  assert.equal(data.positions.length,metadata.nodeCount*3);
  assert.equal(data.rowOffsets.length,metadata.nodeCount+1);
  assert.equal(data.rowOffsets.at(-1),metadata.edgeCount);
  assert.equal(data.targets.length,metadata.edgeCount);
  assert.equal(data.weights.length,metadata.edgeCount);
  assert.equal(data.coreMask.reduce((sum,value)=>sum+value,0),metadata.coreNodeCount);
});

test('Full sparse graph drives real DNa outputs without exceeding its active budget',()=>{
  const {data}=loadFull(),graph=F.compileGraph(data),brain=F.makeBrain(graph),genome=F.makeGenome(F.rng(1),graph.outputs.length),sensors=Array(F.SENSOR_COUNT).fill(.5);
  let outputs;
  for(let i=0;i<24;i++)outputs=F.neuralStep(graph,brain,genome,sensors);
  assert.equal(graph.full,true);
  assert.equal(graph.n,metadata.nodeCount);
  assert.equal(graph.edgeCount,metadata.edgeCount);
  assert.equal(graph.outputs.length,4);
  assert.ok(outputs.every(Number.isFinite));
  assert.ok(outputs.some(value=>Math.abs(value)>1e-4));
  assert.ok(brain.activeCount>0&&brain.activeCount<=metadata.solver.activeNeuronBudget);
  assert.ok(graph.outputs.some(index=>Math.abs(brain.activity[index])>1e-5));
});

test('Corrupted compact graph fails closed',()=>{
  const {data}=loadFull();
  assert.throws(()=>F.compileGraph({...data,targets:data.targets.subarray(1)}),/complete non valide/);
});
