'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),B=require('./neural-context-bank.cjs'),M=require('./neural-context-motor.cjs');
function fixture(){return {graph:{learning:{nodes:Uint32Array.of(0),readoutOffset:0}},brain:{activity:Float64Array.of(.1),policyFeatures:Float64Array.of(1)},
  genome:{policyWeights:[.1,-.2,0,0]},F:{neuralStep:()=>[.123,0,.234]},context:{direction:[1,0],threshold:0,rho:.9,floor:[.001,.002],ceiling:[.2,.3]}};}
test('a second zero head preserves the complete single-head command sequence',()=>{
  const {graph,genome,F,context}=fixture(),one={context,weights:[.4,.2],retention:.98},zero={context,weights:[0,0],retention:.9},a=fixture().brain,b=fixture().brain,
    original=M.wrap(F,graph,one),bank=B.wrap(F,graph,[one,zero]);
  for(const feature of [1,.5,0,0,.2,0,1]){a.policyFeatures[0]=b.policyFeatures[0]=feature;assert.deepEqual(bank.neuralStep(graph,b,genome,[]),original.neuralStep(graph,a,genome,[]));assert.equal(b.contextMotorMemory,a.contextMotorMemory);}
});
test('independent contexts retain separate neural memories and sum only actual neural logits',()=>{
  const {graph,brain,genome,F,context}=fixture(),heads=[{context,weights:[.4,.2],retention:.9},{context,weights:[-.3,.5],retention:.5}],bank=B.wrap(F,graph,heads),r=bank.neuralStep(graph,brain,genome,[]);
  assert.equal(r[0],Math.tanh(.1+(.4-.3)));assert.equal(r[1],Math.tanh(-.2+(.2+.5)));assert.equal(r[2],0);
  brain.policyFeatures[0]=0;bank.neuralStep(graph,brain,genome,[]);assert.deepEqual(brain.contextBankMemories,[.9,.5]);
  const off=B.wrap({...F,neuralStep:()=>[0,0,0]},graph,heads);assert.deepEqual(off.neuralStep(graph,brain,genome,[],true,false),[0,0,0]);assert.deepEqual(brain.contextBankMemories,[0,0]);
});
