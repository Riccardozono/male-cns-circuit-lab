'use strict';
// Numerical invariants on actual reached neuronal state; no desired actions
// or invented driving fitness. Own graph copy never mutates the live model.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Model=require('./neural-statehead-model.cjs'),Original=require('./exact-coo.cjs'),{CudaPass}=require('./cuda-exact-v3-packed-pass.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'),env=Model.createFromLoaded(Model.load(file)),gpu=new CudaPass();
const graph={...env.graph,from:env.graph.from.slice(),to:env.graph.to.slice(),weights:env.graph.weights.slice(),learning:{...env.graph.learning,groups:env.graph.learning.groups.slice()}},gains=env.runtime.synapticGains(env.graph,env.currentCar().genome),initial=env.currentCar().brain;
const clone=b=>Object.fromEntries(['activity','next','sum','injection'].map(k=>[k,b[k].slice()]));
function compare(g=gains,iters=4,enabled=true,alias=false){const a=clone(initial),b=clone(initial);if(alias){a.next=a.activity;b.next=b.activity;}Original.pass(graph,a,iters,enabled,g);gpu.pass(graph,b,iters,enabled,g);for(const key of ['activity','next','sum','injection'])assert.deepEqual(Buffer.from(a[key].buffer),Buffer.from(b[key].buffer),key);}
test('In-place weights topology group and gain edits are reflected in real CUDA results',()=>{
  compare();graph.weights[0]*=.99;compare();graph.from[0]=(graph.from[0]+1)%graph.n;compare();graph.to[0]=(graph.to[0]+1)%graph.n;compare();graph.learning.groups[0]=(graph.learning.groups[0]+1)%gains.length;compare();const changed=gains.slice();changed[0]*=1.01;compare(changed);compare(null);compare(gains,1);compare(gains,2);compare(gains,8);assert.equal(gpu.stats().cpuFallbacks,0);assert.equal(gpu.stats().gpuCalls,10);
});
test('Disabled edges and aliased buffers deliberately use original CPU kernel',()=>{
  compare(gains,4,false);compare(gains,4,true,true);assert.equal(gpu.stats().cpuFallbacks,2);assert.equal(gpu.stats().gpuCalls,10);
});
test.after(()=>gpu.close());
