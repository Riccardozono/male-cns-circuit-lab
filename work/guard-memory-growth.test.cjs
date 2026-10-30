'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),G=require('./guard-memory-runtime.cjs'),H=require('./guard-memory-checkpoint.cjs');
test('Adding neural basis functions with zero coefficients preserves every original coefficient and centre',()=>{
  const c=[{values:[.3,.3],radius:.1}],w=[1,-1],expanded=H.grow(c,w,[[.7,.5],[.5,.8]],[[0,0]],3);
  assert.ok(expanded.added>0);assert.deepEqual(expanded.centres.slice(0,1),c);assert.deepEqual(expanded.weights.slice(0,2),w);assert.ok(expanded.weights.slice(2).every(v=>v===0));assert.deepEqual(c,[{values:[.3,.3],radius:.1}]);
});
test('Zero-coefficient growth preserves recurrent neural inference, including existing memory',()=>{
  const s=G.create(),car=s.cars[0],n=s.graph.learning.nodes.length,raw=Array(n).fill(.2),centres=[{values:raw,radius:1}],weights=[1,-1],newCentres=centres.concat([{values:Array(n).fill(-.1),radius:1}]);
  for(const node of s.graph.learning.nodes)car.brain.activity[node]=Math.atanh(.2)/8;
  const a=G.F.makeBrain(s.graph),b=G.F.makeBrain(s.graph);a.activity.set(car.brain.activity);b.activity.set(car.brain.activity);a.decoderMemory=[.2,-.1];b.decoderMemory=[.2,-.1];
  const old=G.M.commands(s.graph,a,car.genome,centres,weights,.98),grown=G.M.commands(s.graph,b,car.genome,newCentres,weights.concat([0,0]),.98);assert.deepEqual(grown,old);assert.deepEqual(a.decoderMemory,b.decoderMemory);
});
