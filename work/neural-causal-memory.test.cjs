'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),G=require('./guard-memory-runtime.cjs'),N=require('./neural-causal-memory.cjs');
test('Causal feature separates equal neurons with different decoder history',()=>{
  const c={values:[.2,.3],radius:.1,memory:[-.5,.2],memoryRadius:.1};assert.equal(N.feature(c.values,c.memory,c),1);assert.equal(N.feature(c.values,[.5,.2],c),0);
  assert.equal(N.feature([1,1],c.memory,c),0);
});
test('Zero added causal weights preserve original memory and pedal identities',()=>{
  const sim=G.create(),graph=sim.graph,genome=sim.cars[0].genome,raw=Array(graph.learning.nodes.length).fill(.2),centre={values:raw,radius:1},old=G.F.makeBrain(graph),newBrain=G.F.makeBrain(graph);
  for(const i of graph.learning.nodes)old.activity[i]=Math.atanh(.2)/8;newBrain.activity.set(old.activity);old.decoderMemory=[-.3,.2];newBrain.decoderMemory=[-.3,.2];
  const extra={values:raw,radius:.1,memory:[-.3,.2],memoryRadius:.1},a=G.M.commands(graph,old,genome,[centre],[1,-1],.98),b=N.commands(graph,newBrain,genome,[centre,extra],[1,-1,0,0],.98);
  assert.deepEqual(a,b);assert.deepEqual(old.decoderMemory,newBrain.decoderMemory);assert.equal(Math.min(b[1],b[2]),0);
  assert.deepEqual(N.commands(graph,newBrain,genome,[centre,extra],[1,-1,0,0],.98,true,false),[0,0,0]);assert.deepEqual(newBrain.decoderMemory,[0,0]);
});
test('History basis is actual experience and exactly silent on its prefix',()=>{
  const rows=Array.from({length:40},(_,i)=>({raw:[.2,.3],memoryBefore:[i/40,0]})),grown=N.grow(rows,[],[],3);
  assert.ok(grown.added>0);assert.ok(grown.weights.every(v=>v===0));assert.ok(grown.centres.every(c=>rows.some(r=>JSON.stringify(r.memoryBefore)===JSON.stringify(c.memory))));
  assert.ok(rows.slice(0,grown.protectedFrames).every(r=>N.vector(r.raw,r.memoryBefore,grown.centres).every(v=>v===0)));
});
