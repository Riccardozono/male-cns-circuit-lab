'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Motors=require('./neural-prior-kernel-motors.cjs'),Support=require('./neural-prior-local-support.cjs'),{Search}=require('./neural-prior-kernel-search.cjs');
const actual=require('../.impeccable/review/neural-sacl/learned-prior-initial-calibration-r2/actual-rollouts.json');
test('kernel basis and zero-policy identity on actual recorded neuronal inputs',()=>{
 const batches=actual.blocks.flat();assert.ok(Array.isArray(batches));let count=0;
 for(const b of batches)for(const row of b.rows){const h=Motors.features(row.x);assert.equal(h.length,8);assert.equal(Math.max(...h),Support.value(row.x));assert.deepEqual(Motors.mean(row.x,Motors.initialWeights()),row.x.slice(640,642));assert.ok(h.every(v=>v>=0&&v<=1));count++;}assert.equal(count,2048);
});
test('actual pending bounded vectors, not different scored genomes',()=>{
 const s=new Search({mean:Array(16).fill(3.9),sigma:2,population:16,seed:181026}),x=s.ask(Array(16).fill(0));assert.deepEqual(x,s.pending.map(r=>r.x));assert.ok(x.flat().every(v=>Math.abs(v)<=4));assert.deepEqual(x[0],Array(16).fill(0));assert.throws(()=>s.ask());assert.throws(()=>Motors.validate(Array(16).fill(4.01)));
});
