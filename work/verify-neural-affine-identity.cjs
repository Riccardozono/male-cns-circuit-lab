'use strict';

// Paired physical prefix on the independently verified V3/Monza clean model.
// The candidate differs only by the new four-parameter affine motor head at
// exact zero. Nothing is imported, saved, published, or allowed to run a gen.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const Model=require('./neural-chain-desktop-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),Live=require('./neural-command-live.cjs'),Affine=require('./neural-affine-motor.cjs');
const controls=Number(process.argv[2]||512);
if(!Number.isInteger(controls)||controls<1||controls>2048)throw Error('Prefix controls must be between 1 and 2048.');
const choice=Model.defaultChoice(),loaded=Model.load(choice.file),brain=Chain.controller(loaded.inner),base=Model.createFromLoaded(loaded),candidate=Live.create(choice.file,{sharedTopology:base.topology,id:0,
  modelOverride:loaded.inner.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
  onReset:()=>brain.reset(),actionOverride:(_model,raw)=>brain.observe(raw),
  motorOverride:(_model,_raw,prior)=>Affine.compose(brain.compose(prior,loaded.data.weights),[0,0,0,0])});
const digest=crypto.createHash('sha256');
try{
  for(let i=0;i<controls;i++){
    const a=base.step(),b=candidate.step(),ca=base.currentCar(),cb=candidate.currentCar();
    assert.equal(a.ticks,b.ticks,'control ticks');assert.equal(a.bestProgress,b.bestProgress,'progress');assert.equal(a.laps,b.laps,'laps');
    assert.deepEqual(ca.outputs,cb.outputs,'actual exclusive motor commands');assert.deepEqual(ca.brain.activity,cb.brain.activity,'MaleCNS activity');
    assert.equal(ca.x,cb.x,'x');assert.equal(ca.y,cb.y,'y');assert.equal(ca.heading,cb.heading,'heading');
    assert.deepEqual(ca.vehicle,cb.vehicle,'vehicle/physics state');
    digest.update(JSON.stringify([a.ticks,a.bestProgress,ca.outputs,ca.x,ca.y,ca.heading])+'\n');
    if(a.complete||b.complete){if(i+1!==controls)throw Error('The prefix terminated early; repeat with fewer controls.');}
  }
  console.log(JSON.stringify({passed:true,model:'verified V3 / Monza',modelSha256:choice.modelSha256,baseActionTraceSha256:choice.actionTraceSha256,
    affineWeights:[0,0,0,0],controls,matched:'commands, full neuronal activity, progress/laps, position, heading and complete vehicle state at every control',
    prefixSha256:digest.digest('hex'),bestProgress:candidate.state().bestProgress,laps:candidate.state().laps,complete:candidate.state().complete,
    boundary:'Identity/compatibility prefix proof only. It does not evaluate nonzero affine weights or claim a better lap.'},null,2));
}finally{base.close?.();candidate.close?.();Model.closeCuda?.();}
