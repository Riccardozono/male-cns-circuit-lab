'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {trustRegionAsk,SCALES}=require('./run-statehead-brake-lock-trust-region-3gen.cjs');

test('observed terminal context creates eight antithetic low-risk longitudinal candidates and protects the champion',()=>{
  const weights=Array.from({length:18},(_,i)=>i/100),features=[1,.5,-.25,.75,-.4,.3,-.6,.2,.1];
  const champion={weights,progress:6584,rewardDirectedContext:{features,gate:.89,brakeLockPenalty:869,progress:6584,laps:1,reason:'ferma / senza progresso'}};
  const archive={population:16,champion};
  const original=[{kind:'protected-champion',weights:weights.slice()},
    ...[.08,.16,.24,.32].map(sigma=>({kind:'reward-directed-slow-context',sigma})),
    ...Array.from({length:11},(_,i)=>({kind:'block-antithetic-mutation',i}))];
  const proposals=trustRegionAsk(archive,()=>.5,{strength:1},()=>original);
  assert.equal(proposals.length,16);
  assert.deepEqual(proposals[0],original[0]);
  const targeted=proposals.filter(p=>p.kind==='reward-directed-trust-region');
  assert.equal(targeted.length,8);
  assert.deepEqual(targeted.map(p=>p.sigma),SCALES.flatMap(s=>[s,s]));
  assert.deepEqual(targeted.map(p=>p.direction),['less-brake/more-drive','more-brake/less-drive','less-brake/more-drive','more-brake/less-drive','less-brake/more-drive','more-brake/less-drive','less-brake/more-drive','more-brake/less-drive']);
  assert.equal(proposals.filter(p=>p.kind==='block-antithetic-mutation').length,7);
  for(const candidate of targeted){
    assert.equal(candidate.weights.length,18);
    assert.equal(candidate.parentProgress,6584);
    assert.deepEqual(candidate.contextFeatures,features);
    for(let i=0;i<18;i++)if(i%2===0)assert.equal(candidate.weights[i],weights[i],'steering coefficients must not change');
    assert.ok(candidate.predictedLongitudinalShift!==0);
  }
  for(let j=0;j<SCALES.length;j++)assert.ok(Math.abs(targeted[j*2].predictedLongitudinalShift+targeted[j*2+1].predictedLongitudinalShift)<1e-12);
});

test('without an actually observed terminal context, the original proposal set is preserved',()=>{
  const original=[{kind:'protected-champion'}],archive={population:16,champion:{weights:Array(18).fill(0)}};
  assert.equal(trustRegionAsk(archive,()=>.5,{strength:1},()=>original),original);
});
