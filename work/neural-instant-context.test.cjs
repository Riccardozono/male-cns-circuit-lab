'use strict';
// Numerical fixtures only; not driving examples or ideal actions.
const test=require('node:test'),assert=require('node:assert/strict'),Core=require('./neural-instant-context.cjs');
const basis={scales:Array(516).fill(1),centres:[{values:Array(516).fill(0),radius:.5}]};
test('Zero coefficients preserve parent, and an instantaneous context releases outside its observed support',()=>{const p=[.2,.7,0],near=Array(516).fill(0),far=Array(516).fill(1);assert.deepEqual(Core.compose(p,near,basis,[0,0]),p);assert.deepEqual(Core.features(near,basis),[1]);assert.deepEqual(Core.features(far,basis),[0]);assert.notDeepEqual(Core.compose(p,near,basis,[.1,-1]),p);assert.deepEqual(Core.compose(p,far,basis,[.1,-1]),p);});
test('Local corrections preserve bounded exclusive pedals and reject unsupported coefficients',()=>{const r=Core.compose([0,1,0],Array(516).fill(0),basis,[8,-8]);assert(r.every(v=>Math.abs(v)<=1));assert.equal(Math.min(r[1],r[2]),0);assert(r[2]>0);assert.throws(()=>Core.compose([0,1,0],Array(516).fill(0),basis,[9,0]));});
