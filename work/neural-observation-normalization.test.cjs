'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),N=require('./neural-observation-normalization.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/neuronal-normalization-520-prepared/normalization.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));
test('Actual fitted means map to zero without dimension loss; arrays are privately copied',()=>{
  const d=structuredClone(data),encode=N.create(d);assert.deepEqual(encode(data.mean),Array(520).fill(0));
  const x=Array(520).fill(.25),before=encode(x);d.mean.fill(1);d.scales.fill(2);assert.deepEqual(encode(x),before);assert.deepEqual(x,Array(520).fill(.25));assert.ok(before.every(v=>Math.abs(v)<=1));
});
test('No malformed stats or controller provenance silently load',()=>{
  assert.throws(()=>N.create({...data,mean:[0]}));assert.throws(()=>N.create({...data,scales:Array(520).fill(0)}));assert.throws(()=>N.load(file,'0'.repeat(64)));
  const encode=N.create(data);assert.throws(()=>encode(Array(520).fill(NaN)));assert.throws(()=>encode(Array(519).fill(0)));
});
