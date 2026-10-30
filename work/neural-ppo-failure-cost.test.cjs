'use strict';
// Mathematical fixtures, not invented car episodes or optimizer examples.
const test=require('node:test'),assert=require('node:assert/strict'),F=require('./neural-ppo-failure-cost.cjs');
test('Incomplete terminal cost can only increase; severe crashes never get softened',()=>{
  for(const raw of [-80,-40,-33,-14,0,2])for(const laps of [0,1]){const r=F.reward(raw,true,laps);assert.ok(r.reward<=raw);assert.ok(r.reward<=-40);assert.equal(r.auxiliaryPenalty,raw-r.reward);}
  assert.equal(F.reward(-80,true,1).reward,-80);
});
test('Real nonterminal transitions and completed two-lap result are unchanged',()=>{
  for(const raw of [-80,-14,0,2])for(const laps of [0,1,2])assert.equal(F.reward(raw,false,laps).reward,raw);
  assert.equal(F.reward(2,true,2).reward,2);assert.throws(()=>F.reward(NaN,true,1));
});
