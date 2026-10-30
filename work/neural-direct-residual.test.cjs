'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),G=require('./guard-memory-runtime.cjs'),N=require('./neural-causal-memory.cjs'),D=require('./neural-direct-residual.cjs');
function fixture(){const sim=G.create(),graph=sim.graph,genome=sim.cars[0].genome,raw=Array(graph.learning.nodes.length).fill(.2),brain=G.F.makeBrain(graph);for(const i of graph.learning.nodes)brain.activity[i]=Math.atanh(.2)/8;brain.decoderMemory=[-.3,.2];return {graph,genome,brain,centre:{values:raw,radius:1},direct:{values:raw,radius:.1,memory:[-.3,.2],memoryRadius:.1}};}
test('Zero direct coefficients preserve previous action and memory exactly',()=>{
  const {graph,genome,brain,centre,direct}=fixture(),old=G.F.makeBrain(graph);old.activity.set(brain.activity);old.decoderMemory=brain.decoderMemory.slice();
  const a=N.commands(graph,old,genome,[centre],[1,-1],.98),b=D.commands(graph,brain,genome,[centre],[1,-1],[direct],[0,0],.98);assert.deepEqual(a,b);assert.deepEqual(old.decoderMemory,brain.decoderMemory);
});
test('Instantaneous correction changes action but does not accumulate into old memory',()=>{
  const {graph,genome,brain,centre,direct}=fixture(),old=G.F.makeBrain(graph);old.activity.set(brain.activity);old.decoderMemory=brain.decoderMemory.slice();
  const a=N.commands(graph,old,genome,[centre],[1,-1],.98),b=D.commands(graph,brain,genome,[centre],[1,-1],[direct],[2,-2],.98);assert.notDeepEqual(a,b);assert.deepEqual(old.decoderMemory,brain.decoderMemory);assert.equal(Math.min(b[1],b[2]),0);
});
test('No anatomical propagation means no direct drive even with nonzero coefficients',()=>{
  const {graph,genome,brain,centre,direct}=fixture();brain.activity.fill(0);assert.deepEqual(D.commands(graph,brain,genome,[centre],[1,-1],[direct],[8,8],.98),[0,0,0]);assert.deepEqual(brain.decoderMemory,[0,0]);
});
