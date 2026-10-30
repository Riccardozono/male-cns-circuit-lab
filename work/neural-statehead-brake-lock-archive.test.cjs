'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Archive}=require('./neural-statehead-brake-lock-archive.cjs');

test('observed terminal braking context creates bounded reward-directed longitudinal variants',()=>{
  const archive=new Archive({dimensions:18,population:16,maxProgress:12000});
  const features=[1,.5,-.25,.75,-.4,.3,-.6,.2,.1];
  const safe={weights:Array(18).fill(0),fitness:500,baseFitness:500,progress:6584,laps:1,lapTimes:[742.55],
    reason:'troppo lenta / senza progresso',censored:false,overlap:0,
    rewardDirectedContext:{features,gate:.89,brakeLockPenalty:869.16,progress:6584,laps:1,reason:'ferma / senza progresso'}};
  archive.offer(safe);
  const proposals=archive.ask(()=>.99,{strength:1});
  const directed=proposals.filter(child=>child.kind==='reward-directed-slow-context');
  assert.equal(directed.length,4,'four of sixteen agents receive targeted neural-context mutations');
  for(const child of directed){
    let longitudinalShift=0;
    for(let i=0;i<18;i++){
      if(i%2===0)assert.equal(child.weights[i],0,'steering coefficients stay fixed in the targeted branch');
      else {const feature=features[Math.floor(i/2)],delta=child.weights[i];assert.ok(Math.abs(delta)<=.32);longitudinalShift+=feature*delta;}
    }
    assert.ok(longitudinalShift>0,'the decoder output is shifted toward positive longitudinal drive in the observed penalized context');
  }
  const restored=Archive.restore(archive.snapshot());
  assert.deepEqual(restored.champion.rewardDirectedContext,safe.rewardDirectedContext,'the observed context survives archive snapshots');
});

test('shared CUDA archive does not generate reward-directed mutations',()=>{
  const Shared=require('./neural-statehead-cuda-archive.cjs').Archive;
  const archive=new Shared({dimensions:18,population:16,maxProgress:12000});
  const safe={weights:Array(18).fill(0),fitness:500,baseFitness:500,progress:6584,laps:1,lapTimes:[742.55],
    reason:'troppo lenta / senza progresso',censored:false,overlap:0};
  archive.offer(safe);
  assert.ok(archive.ask(()=>.99,{strength:1}).every(child=>child.kind!=='reward-directed-slow-context'));
});
