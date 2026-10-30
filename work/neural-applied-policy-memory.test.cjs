'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),memory=require('./neural-applied-policy-memory.cjs');
test('Unapplied neural proposals do not leak into later policy memory',()=>{assert.deepEqual(memory(0,[3,-7]),[0,0]);assert.deepEqual(memory(-0,[-2,8]),[0,0]);});
test('Positive authority preserves previous bounded latent behavior',()=>{for(const g of [Number.MIN_VALUE,.1,1])assert.deepEqual(memory(g,[3,-7]),[3,-7].map(Math.tanh));assert.throws(()=>memory(-1,[0,0]));assert.throws(()=>memory(1,[NaN,0]));});
