'use strict';
// Numerical fixtures only, not examples supplied to the car learner.
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('./neural-leaky-context.cjs');
const basis={scales:Array(516).fill(1),centres:[{values:Array(516).fill(0),radius:.5}]};
test('Context memory decays outside observed support rather than freezing or instantly disappearing',()=>{const c=Core.create(basis),parent=[0,.7,0];assert.deepEqual(c.observe(Array(516).fill(0)),[1]);assert.deepEqual(c.observe(Array(516).fill(1)),[.98]);assert.notDeepEqual(c.compose(parent,[0,-1]),parent);c.reset();assert.deepEqual(c.values(),[0]);assert.deepEqual(c.compose(parent,[0,-1]),parent);});
test('Own reached memory restores exactly and cannot be replaced by a foreign snapshot',()=>{const a=Core.create(basis),b=Core.create(basis);a.observe(Array(516).fill(0));const state=a.capture();a.observe(Array(516).fill(1));a.restore(state);assert.deepEqual(a.values(),[1]);assert.throws(()=>b.restore(state));assert.throws(()=>a.restore({values:[1]}));});
