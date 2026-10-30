'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('./recurrent-v3-reward-env.cjs');
test('zero-exploration recurrent episode exactly reproduces the verified full native parent',()=>{
  const env=E.create(),m=env.metadata(),r=env.episode({std:[0,0],safetyCost:0,maxTicks:0});
  for(const key of ['ticks','fitness','bestProgress','laps','bestLapTime','reason','safe','censored'])assert.equal(r.result[key],m.expected[key],key);
  assert.equal(r.controls,722);assert.equal(r.totalNativeReward,r.result.fitness);
  assert.ok(r.chunks.every(c=>c.rows.length<=32));assert.equal(r.chunks.at(-1).rows.at(-1).done,true);
  for(const c of r.chunks)for(const row of c.rows)assert.ok(Math.min(row.commands[1],row.commands[2])===0);
});
test('stochastic terminal rewards reconcile and fixed-history identity rescore has zero KL',()=>{
  const env=E.create(),m=env.metadata(),r=env.episode({seed:20261024,std:[.015,.08],safetyCost:2000}),rows=r.chunks.flatMap(c=>c.rows);
  assert.ok(Math.abs(rows.reduce((s,x)=>s+x.reward,0)-r.trainingReward)<1e-8);
  assert.equal(r.extraSafetyCost,r.result.safe?0:2000);
  const score=env.rescore(m.genome.policyWeights,rows.map(()=>1));assert.equal(score.meanGaussianKL,0);assert.equal(score.meanClippedSurrogate,1);
  assert.equal(rows.at(-1).done,true);assert.equal(rows.slice(0,-1).some(r=>r.done),false);
  const weights=m.genome.policyWeights.slice();weights[72]+=.01;weights[201]-=.003;
  const advantages=rows.map((_,j)=>Math.sin(j*.1)),fast=env.rescore(weights,advantages),full=env.rescore(weights,advantages,{forceRecurrent:true});
  for(const key of ['activeRows','meanGaussianKL','meanClippedSurrogate','meanUnclippedSurrogate'])assert.equal(fast[key],full[key],key);
  assert.equal(fast.neuronalHistoryMode,'recorded-exact-frozen-adapter');assert.equal(full.neuronalHistoryMode,'replayed-from-zero');
});
