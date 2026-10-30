'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),O=require('./neural-domain-objective.cjs'),
  preflight=require('../.impeccable/review/learning-ml/v3-neural-domain-preflight-20261024-01/report.json'),
  safe=preflight.cases.map(c=>c.zero.result),unsafe=preflight.cases.map(c=>c.warm.result);
test('actual high-score crashing transfers cannot displace an all-safe domain candidate',()=>{
  const a=O.aggregate(safe),b=O.aggregate(unsafe);assert.ok(O.researchScore(b)>O.researchScore(a));assert.equal(a.allSafe,true);assert.equal(b.allSafe,false);
  assert.ok(O.compareSafe(a,b)<0);assert.equal(a.minimumProgress,Math.min(...safe.map(r=>r.bestProgress)));
});
test('every domain must be valid, uncensored and safe for the retained candidate',()=>{
  assert.equal(O.aggregate([safe[0],unsafe[0],safe[2]]).allSafe,false);
  assert.throws(()=>O.aggregate([safe[0],{...safe[1],censored:true},safe[2]]),/uncensored/);
  assert.throws(()=>O.aggregate([]),/uncensored/);assert.throws(()=>O.aggregate([{...safe[0],fitness:NaN}]),/uncensored/);
});
