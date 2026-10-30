'use strict';
// Synthetic scalar fixtures exercise archive bookkeeping only. They are never
// vehicle actions, neuronal observations, replay transitions or training data.
const {test}=require('node:test'),assert=require('node:assert/strict'),{Archive}=require('./neural-diversity.cjs'),{rng}=require('../outputs/simulation.js');
const row=(progress,fitness,reason='troppo lenta / senza progresso',more={})=>({weights:[0,0],progress,fitness,reason,laps:0,censored:false,overlap:0,...more});
test('Exploration keeps unsafe learned alternatives without promoting them to the protected champion',()=>{
  const a=new Archive({dimensions:2,maxProgress:10000,population:48});a.offer(row(2000,-2300));
  assert.ok(a.offer(row(2100,-4100,'urto',{weights:[.2,.3]})).accepted);
  assert.equal(a.champion.progress,2000);assert.equal(a.snapshot().cells.length,2);
  assert.equal(a.offer(row(1990,-2290)).promoted,false);assert.equal(a.champion.progress,2000);
  assert.ok(a.offer(row(2150,-2100)).promoted);assert.equal(a.champion.progress,2150);
});
test('Deterministic bounded mutations change only parameters and retain one actual protected member',()=>{
  const a=new Archive({dimensions:2,maxProgress:10000,population:100});a.offer(row(2000,-2300));a.offer(row(2100,-4100,'urto',{weights:[7.9,-7.9]}));
  const x=a.ask(rng(1509)),y=a.ask(rng(1509));assert.deepEqual(x,y);assert.equal(x.length,100);assert.deepEqual(x[0].weights,a.champion.weights);
  assert.ok(x.slice(1).some(r=>r.parentCategory==='unsafe'));assert.ok(x.every(r=>r.weights.every(v=>Number.isFinite(v)&&Math.abs(v)<=8)));
  x[0].weights[0]=8;assert.deepEqual(a.champion.weights,[0,0]);
});
test('Invalid/censored/overlapping candidates are not reusable training parents',()=>{
  const a=new Archive({dimensions:2,maxProgress:10000});a.offer(row(2000,-2300));
  for(const more of [{censored:true},{overlap:1},{reason:'progresso non valido'}])assert.equal(a.offer(row(9000,5000,undefined,more)).accepted,false);
  assert.equal(a.snapshot().cells.length,1);assert.throws(()=>a.offer(row(10001,0)),/Invalid/);assert.throws(()=>a.offer(row(1000,0,undefined,{weights:[NaN,0]})),/Invalid/);
});
test('A recorded archive restores exact parameters without any body/episode state',()=>{
  const a=new Archive({dimensions:2,maxProgress:10000});a.offer(row(2000,-2300));a.offer(row(2100,-4100,'urto',{weights:[.2,.3]}));
  const snapshot=a.snapshot(),restored=Archive.restore(snapshot);assert.deepEqual(restored.snapshot(),snapshot);
  assert.deepEqual(restored.ask(rng(77)),a.ask(rng(77)));
  assert.throws(()=>Archive.restore({...snapshot,champion:row(3000,1000,'urto')}),/clean/);
  assert.throws(()=>Archive.restore({...snapshot,cells:snapshot.cells.map(c=>({...c,key:'wrong'}))}),/cell/);
});
