'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('./neural-context-motor.cjs');
function fixture(){const graph={learning:{nodes:Uint32Array.of(0),readoutOffset:0}},brain={activity:Float64Array.of(.1),policyFeatures:Float64Array.of(1)},
  genome={policyWeights:[.1,-.2,0,0]},F={neuralStep:()=>[.123,0,.234]},context={direction:[1,0],threshold:0,rho:.9,floor:[.001,.002],ceiling:[.2,.3]};
  return {graph,brain,genome,F,context};}
test('zero context head retains exact original commands while tracking only neural memory',()=>{
  const {graph,brain,genome,F,context}=fixture(),runtime=M.wrap(F,graph,{context,weights:[0,0],retention:.9});
  assert.deepEqual(runtime.neuralStep(graph,brain,genome,[]),F.neuralStep());assert.equal(brain.contextMotorMemory,1);
});
test('head changes actual logits, pedals remain exclusive, disabled edges cannot drive',()=>{
  const {graph,brain,genome,F,context}=fixture(),runtime=M.wrap(F,graph,{context,weights:[.5,.7],retention:.9});
  const result=runtime.neuralStep(graph,brain,genome,[],true,true);
  assert.equal(result[0],Math.tanh(.1+.5));assert.equal(result[1],Math.tanh(-.2+.7));assert.equal(result[2],0);
  const disabled={...F,neuralStep:()=>[0,0,0]},off=M.wrap(disabled,graph,{context,weights:[3,3],retention:.9});
  assert.deepEqual(off.neuralStep(graph,brain,genome,[],true,false),[0,0,0]);assert.equal(brain.contextMotorMemory,0);
});
test('leaky memory depends on neuronal history and resets in a new brain',()=>{
  const {graph,brain,genome,F,context}=fixture(),runtime=M.wrap(F,graph,{context,weights:[1,1],retention:.9});
  runtime.neuralStep(graph,brain,genome,[]);brain.policyFeatures[0]=0;runtime.neuralStep(graph,brain,genome,[]);
  assert.equal(brain.contextMotorMemory,.9);const fresh={activity:Float64Array.of(.1),policyFeatures:Float64Array.of(0)};
  assert.deepEqual(runtime.neuralStep(graph,fresh,genome,[]),F.neuralStep());assert.equal(fresh.contextMotorMemory,0);
});
