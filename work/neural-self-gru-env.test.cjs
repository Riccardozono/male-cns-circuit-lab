'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {learningSignal}=require('./neural-self-gru-env.cjs');

test('fitness mode preserves the current official reward delta',()=>{
  const signal=learningSignal('fitness',{progressDelta:12,lapsDelta:0,fitnessDelta:-1400,terminal:true,safe:true,trackLength:5793});
  assert.equal(signal.reward,-1400);
});

test('safe zero-lap outcomes learn from real progress even when fitness falls',()=>{
  const signal=learningSignal('optimizer-progress-curriculum',{progressDelta:40,lapsDelta:0,fitnessDelta:-1400,terminal:true,safe:true,trackLength:5793});
  assert.deepEqual(signal,{reward:40,progressReward:40,lapReward:0,unsafeTerminalPenalty:0});
});

test('completed laps receive an actual track-length bonus',()=>{
  const signal=learningSignal('optimizer-progress-curriculum',{progressDelta:0,lapsDelta:1,fitnessDelta:-2000,terminal:false,safe:true,trackLength:5793});
  assert.equal(signal.reward,5793);
});

test('unsafe two-lap terminal outcome ranks below a safe zero-progress outcome',()=>{
  const signal=learningSignal('optimizer-progress-curriculum',{progressDelta:11586,lapsDelta:2,fitnessDelta:5000,terminal:true,safe:false,trackLength:5793});
  assert.equal(signal.reward,-11586);
  assert.ok(signal.reward<0);
});

test('unknown modes and invalid measurements are rejected',()=>{
  assert.throws(()=>learningSignal('route-following',{}));
  assert.throws(()=>learningSignal('optimizer-progress-curriculum',{progressDelta:NaN,lapsDelta:0,fitnessDelta:0,terminal:false,safe:true,trackLength:5793}));
});
