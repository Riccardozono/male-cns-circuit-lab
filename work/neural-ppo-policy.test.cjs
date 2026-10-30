'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./neural-ppo-policy.cjs');
test('Unit transport: zero policy preserves prior motors and cannot overlap pedals',()=>{
  const x=P.features([1,0,0,0,0,0,0,0,0],[.2,.5,0],[0,0]);assert.equal(x.length,13);assert.deepEqual(P.mean(x,Array(26).fill(0)),[0,0]);
  for(const gate of [0,.5,1])assert.deepEqual(P.compose([.2,.5,0],gate,[0,0]),[.2,.5,0]);
  for(const a of [[10,-10],[-10,10],[0,0]]){const y=P.compose([0,.5,0],1,a);assert.equal(Math.min(y[1],y[2]),0);assert.ok(y.every(v=>Math.abs(v)<=1));}
});
test('Unit transport: learned linear mean has explicit feature order and rejects nonfinite weights',()=>{
  const x=Array(13).fill(.5),w=Array(26).fill(.25);assert.deepEqual(P.mean(x,w),[1.625,1.625]);w[0]=NaN;assert.throws(()=>P.mean(x,w));
});
