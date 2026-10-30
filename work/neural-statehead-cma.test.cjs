'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Search}=require('./neural-statehead-cma.cjs'),{Search:Unbounded}=require('./neural-head-cma-transport.cjs');
// Transport-only unit checks. No invented physical fitness, policy training,
// optimizer tell or exported learned model is created here.
test('Returned bounded candidates and pending optimizer coordinates are identical',()=>{
  const config={mean:Array(18).fill(0),sigma:2,population:16,seed:15102115},bounded=new Search(config),plain=new Unbounded(config),elite=Array(18).fill(.125),a=bounded.ask(elite),b=plain.ask(elite);
  assert.deepEqual(a,b.map(row=>row.map(v=>Math.max(-8,Math.min(8,v)))));assert.deepEqual(a,bounded.pending.map(r=>r.x));assert.deepEqual(a[0],elite);assert.ok(a.flat().every(v=>Number.isFinite(v)&&Math.abs(v)<=8));assert.equal(bounded.optimizer.generation,0);assert.throws(()=>bounded.ask(elite),/Tell/);
});
test('Clipping really handles over-bound samples without assigning fake scores',()=>{
  const config={mean:Array(18).fill(7.9),sigma:2,population:16,seed:15102115},bounded=new Search(config),plain=new Unbounded(config),a=bounded.ask(),b=plain.ask();assert.ok(b.flat().some(v=>Math.abs(v)>8));assert.ok(a.flat().some(v=>v===8));assert.deepEqual(a,b.map(row=>row.map(v=>Math.max(-8,Math.min(8,v)))));assert.deepEqual(a,bounded.pending.map(r=>r.x));assert.equal(bounded.optimizer.generation,0);
});
