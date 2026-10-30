'use strict';
// Actual neuronal states; perturbations test numerical invalidation only,
// never supply driving labels or fictitious optimizer fitness.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Ref=require('./exact-coo.cjs'),Fast=require('./exact-incoming-stable.cjs'),Model=require('./neural-statehead-model.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'),env=Model.createFromLoaded(Model.load(file)),snapshots=[];
const clone=b=>Object.fromEntries(['activity','next','sum','injection'].map(k=>[k,b[k].slice()]));
for(let k=0;k<8;k++){snapshots.push(clone(env.currentCar().brain));env.step();}
const graph={...env.graph,from:env.graph.from.slice(),to:env.graph.to.slice(),weights:env.graph.weights.slice(),learning:{...env.graph.learning,groups:env.graph.learning.groups.slice()}},gains=env.runtime.synapticGains(env.graph,env.currentCar().genome);
function compare(state,iterations=4,enabled=true,g=gains){const a=clone(state),b=clone(state);Ref.pass(graph,a,iterations,enabled,g);Fast.pass(graph,b,iterations,enabled,g);for(const key of ['activity','next','sum','injection'])assert.deepEqual(Buffer.from(b[key].buffer),Buffer.from(a[key].buffer),key);}
test('Bitwise equality on8actually reached brains with1/2/4/8iterations and both gain modes',()=>{
  for(const s of snapshots)for(const it of [1,2,4,8])for(const g of [null,gains])compare(s,it,true,g);
});
test('In-place topology weights groups and gains changes invalidate the prepared layout',()=>{
  compare(snapshots[0]);graph.weights[0]*=.95;compare(snapshots[0]);
  graph.from[0]=(graph.from[0]+1)%graph.n;compare(snapshots[1]);
  graph.to[0]=(graph.to[0]+1)%graph.n;compare(snapshots[2]);
  graph.learning.groups[0]=(graph.learning.groups[0]+1)%gains.length;compare(snapshots[3]);
  const changed=gains.slice();changed[0]*=1.01;compare(snapshots[4],4,true,changed);
  assert.ok(Fast.stats().builds>=3);assert.ok(Fast.stats().refreshes>=5);
});
test('Disabled edges use original kernel and preserve exact zero-graph behavior',()=>{
  compare(snapshots[0],4,false,gains);assert.ok(Fast.stats().fallbacks>=1);
});
