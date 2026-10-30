'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Add=require('./neural-ppo-additive-failure-cost.cjs'),Floor=require('./neural-ppo-failure-cost.cjs');
test('Extra incomplete cost preserves the original crash/stall reward difference',()=>{
 const crash=-33,stall=-14;
 assert.equal(Floor.reward(crash,true,1).reward,Floor.reward(stall,true,1).reward);
 assert.equal(Add.reward(crash,true,1).reward-Add.reward(stall,true,1).reward,crash-stall);
 assert.deepEqual(Add.reward(crash,true,1),{rawReward:-33,reward:-73,auxiliaryPenalty:40});
});
test('Actual two-lap completion and nonterminal progress keep original rewards',()=>{
 assert.deepEqual(Add.reward(3,false,0),{rawReward:3,reward:3,auxiliaryPenalty:0});
 assert.deepEqual(Add.reward(7,true,2),{rawReward:7,reward:7,auxiliaryPenalty:0});
 assert.equal(Add.reward(-80,true,0).reward,-120);
 assert.throws(()=>Add.reward(NaN,true,1));assert.throws(()=>Add.reward(0,'yes',1));assert.throws(()=>Add.reward(0,true,3));
});
