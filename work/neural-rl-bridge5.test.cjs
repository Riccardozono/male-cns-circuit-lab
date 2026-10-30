'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Old=require('./neural-rl-bridge.cjs'),New=require('./neural-rl-bridge5.cjs'),R=require('../.impeccable/experimental-penalty5/outputs/rewards.js');
test('Crash/off-road/invalid penalties are more severe than stopping, with an explicit new objective',()=>{assert.equal(R.REVISION,'progress-5-crash-safety-experiment');assert.ok(R.RULES.collision>R.RULES.stall);assert.ok(R.RULES.offTrack>R.RULES.stall);assert.ok(R.RULES.invalidProgress>R.RULES.collision);assert.equal(R.RULES.maxLapsPerGeneration,2);});
test('Changing terminal penalties does not alter real neurons, commands, physical motion or stopping rules',()=>{
  const old=Old.create(),current=New.create();old.reset('full');current.reset('full');let a,b;
  do{a=old.step([0,0]);b=current.step([0,0]);assert.deepEqual(a.observation,b.observation);const ca=old.inspect().car,cb=current.inspect().car;assert.deepEqual([ca.x,ca.y,ca.heading,ca.speed,ca.progress,ca.bestProgress,ca.alive,ca.reason,ca.vehicle],[cb.x,cb.y,cb.heading,cb.speed,cb.progress,cb.bestProgress,cb.alive,cb.reason,cb.vehicle]);}while(!a.terminated&&!a.truncated);
  assert.equal(b.info.bestProgress,a.info.bestProgress);assert.equal(b.info.reason,'urto');assert.ok(b.info.fitness<a.info.fitness-2300);assert.equal(old.metadata().objectiveRevision,'progress-4-guard-experiment');assert.equal(current.metadata().objectiveRevision,R.REVISION);
});
