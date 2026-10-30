'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('./neural-training-state.cjs');
test('Critic-only features are36bounded copied values and do not modify sensors or physical timers',()=>{
  // Isolated shape/alias fixture, never an optimizer example or vehicle action.
  const car={sensorVector:Array(28).fill(.2),lifetime:50,lastProgressTime:47,progress:500,bestProgress:500,laps:0,lastLapStartTime:0,rewardState:{paceTime:45,paceProgress:490,nextCheckpoint:5}},before=JSON.stringify(car),features=S.features(car);
  assert.equal(features.length,36);assert.equal(S.ACTOR_DIMENSIONS,521);assert.equal(S.CRITIC_DIMENSIONS,557);assert.ok(features.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));assert.equal(features[28],3/16);assert.equal(JSON.stringify(car),before);car.sensorVector[0]=.9;assert.equal(features[0],.2);assert.throws(()=>S.features({...car,sensorVector:[]}),/28sensor/);
});
