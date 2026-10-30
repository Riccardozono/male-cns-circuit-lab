'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const Model=require('./neural-statehead-cuda-model.cjs');
const {Coordinator}=require('./neural-statehead-brake-lock-coordinator.cjs');
after(()=>Model.closeCuda());

test('finish selects the strongest actually penalized context before asking the next generation',async()=>{
  const choice=Model.defaultChoice(),coordinator=new Coordinator({modelFile:choice.file,population:16,workers:4});
  const baseline=coordinator.loaded.data.weights.slice(),featuresA=[1,.1,.2,.1,.1,.1,.1,.1,.1],featuresB=[1,-.6,.4,-.3,.5,-.2,.7,-.1,.2];
  const results=Array.from({length:16},(_,id)=>({id,complete:true,censored:false,overlap:0,weights:baseline.slice(),
    fitness:3200,baseFitness:3200,lapTimes:[742.55],progress:6584,laps:1,reason:'ferma / senza progresso',
    totalSimulationSeconds:850,terminalSlow:true,terminalContextFeatures:(id===11?featuresB:featuresA).slice(),
    terminalGate:.89,brakeLockPenalty:id===11?93:id+1}));
  coordinator.workers=[{done:results,cars:[]}];
  coordinator.begin=async()=>{};
  await coordinator.finish();
  assert.deepEqual(coordinator.archive.champion.rewardDirectedContext,{features:featuresB,gate:.89,brakeLockPenalty:93,
    progress:6584,laps:1,reason:'ferma / senza progresso'});
  const proposals=coordinator.archive.ask(()=>.99,{strength:1});
  assert.equal(proposals.filter(candidate=>candidate.kind==='reward-directed-slow-context').length,4);
  assert.equal(coordinator.history[0].rewardRevision,coordinator.rewardRevision);
});
