'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),{makeRanker}=require('./experimental-progress-band-ranker-106.cjs');
const safe=(bestProgress,fitness,laps=0)=>({bestProgress,fitness,laps,reason:'troppo lenta / senza progresso'});
const crashed=(bestProgress,fitness)=>({bestProgress,fitness,laps:0,reason:'urto'});
test('Near the frontier actual penalties break ties, without rewarding crashes or near-start stalls',()=>{
  const frontier=safe(790.601,-4414),near=safe(789.435,-4392),nearBad=safe(790.461,-5593),far=safe(20,0),crash=crashed(850,10000);
  const compare=makeRanker([frontier,near,nearBad,far],1,F);
  assert.ok(compare(near,frontier)<0);assert.ok(compare(frontier,nearBad)<0);
  assert.ok(compare(frontier,far)<0);assert.ok(compare(far,crash)<0);
  assert.ok(compare(safe(5800,-10000,1),frontier)<0);
});
test('One generation anchor gives a transitive, permutation-independent order',()=>{
  const outcomes=[safe(790.6,-4400),safe(789.4,-4300),safe(785.5,-5000),safe(784,-2000),
    safe(780,-1000),safe(20,0),crashed(900,-10),crashed(800,-100)];
  const compare=makeRanker(outcomes.filter(F.isSafeLearningOutcome),1,F);
  for(const a of outcomes)for(const b of outcomes)for(const c of outcomes){
    assert.equal(Math.sign(compare(a,b))+Math.sign(compare(b,a)),0);
    if(compare(a,b)<=0&&compare(b,c)<=0)assert.ok(compare(a,c)<=0);
  }
  const order=outcomes.slice().sort(compare).map(x=>x.bestProgress);
  assert.deepEqual(outcomes.slice().reverse().sort(compare).map(x=>x.bestProgress),order);
});
