'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{correction}=require('./neural-branch-repair-env.cjs');
test('Late neural coefficient mapping is zero-preserving bounded independent and fail-closed',()=>{
  // Arithmetic unit fixtures only: never physical driving or optimizer data.
  assert.deepEqual(correction([0,0]),[0,0]);assert.equal(correction([.2,0])[1],0);assert.equal(correction([0,.2])[0],0);assert.equal(correction([.2,0])[0],Math.tanh(.2*.2));
  for(const x of [-100,-1,0,1,100])for(const y of [-100,-1,0,1,100])assert.ok(correction([x,y]).every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
  for(const invalid of [[NaN,0],[0,Infinity],[101,0],[0],null])assert.throws(()=>correction(invalid));
});
