'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Model=require('./neural-statehead-model.cjs'),Exact=require('./exact-coo.cjs'),Memo=require('./exact-coo-memo.cjs');
const loaded=Model.load(require('node:path').resolve(__dirname,'../.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json')),env=Model.createFromLoaded(loaded),graph=env.graph,gains=env.runtime.synapticGains(graph,env.model.head.causalModel.baseGenome);
const clone=b=>Object.fromEntries(['activity','next','sum','injection'].map(k=>[k,b[k].slice()]));
const bits=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
function same(a,b){for(const k of ['activity','next','sum','injection'])assert.ok(bits(a[k]).equals(bits(b[k])),k);}
test('Actual neuronal states yield bit-identical miss/hit arrays with exact swap identity and isolated outputs',()=>{
  Memo.reset();for(let step=0;step<12;step++){env.step();for(const iterations of [1,2,4]){const source=clone(env.currentCar().brain),reference=clone(source),miss=clone(source),hit=clone(source),beforeActivity=hit.activity,beforeNext=hit.next;Exact.pass(graph,reference,iterations,true,gains);Memo.pass(graph,miss,iterations,true,gains);Memo.pass(graph,hit,iterations,true,gains);same(reference,miss);same(reference,hit);assert.equal(hit.activity,iterations%2?beforeNext:beforeActivity);assert.equal(hit.next,iterations%2?beforeActivity:beforeNext);
    hit.sum[0]=123;const again=clone(source);Memo.pass(graph,again,iterations,true,gains);same(reference,again);
  }}assert.equal(Memo.stats().misses,36);assert.equal(Memo.stats().hits,72);
});
test('Actual graph copies detect in-place weight/group/input/gain changes; no stale results',()=>{
  Memo.reset();const g={...graph,from:graph.from.slice(),to:graph.to.slice(),weights:graph.weights.slice(),learning:{...graph.learning,groups:graph.learning.groups.slice()}},source=clone(env.currentCar().brain),gs=gains.slice();
  const compare=()=>{const a=clone(source),b=clone(source);Exact.pass(g,a,4,true,gs);Memo.pass(g,b,4,true,gs);same(a,b);};compare();g.weights[0]*=.5;compare();g.learning.groups[0]=(g.learning.groups[0]+1)%gs.length;compare();source.activity[0]*=.5;compare();source.injection[0]*=.5;compare();gs[0]*=.5;compare();assert.equal(Memo.stats().invalidations,2);assert.equal(Memo.stats().misses,6);
});
test('Unsupported/aliased cases fall back to the original kernel without changing its semantics',()=>{
  Memo.reset();const a=clone(env.currentCar().brain),b=clone(a);Exact.pass(graph,a,4,false,gains);Memo.pass(graph,b,4,false,gains);same(a,b);assert.equal(Memo.stats().bypassed,1);
  const x=clone(env.currentCar().brain),y=clone(x);x.sum=x.injection;y.sum=y.injection;Exact.pass(graph,x,2,true,gains);Memo.pass(graph,y,2,true,gains);same(x,y);assert.equal(Memo.stats().bypassed,2);
});
