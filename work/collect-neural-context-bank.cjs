'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),
  P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),B=require('./neural-context-bank.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  input=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-safe-verification-20261024-01/checkpoint-snapshot.private.json'),bytes=fs.readFileSync(input),c=JSON.parse(bytes),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-observations-20261024-01');
if(fs.existsSync(out))throw Error('Preserve bank observations');
const sim=P.setup(),observations=[];
const replay=fullRollout(M.wrap(F,sim.graph,c.best.spec),sim.track,sim.graph,c.genome,{rewardRevision:F.Rewards.PRIVATE_CONTINUITY_REVISION,onControl(car,tick){
  observations.push({control:observations.length,tick,progressM:car.bestProgress/(sim.track.pixelsPerMeter||1),speedMps:car.vehicle.speedMps,
    features:Array.from(car.brain.policyFeatures),sensors:car.sensorVector.slice(),commands:car.slowOutputs.slice(),firstGate:car.brain.contextMotorGate,firstMemory:car.brain.contextMotorMemory});
}}),baseline=outcome(F,replay);assert.deepEqual(baseline,c.best.outcome);
const zero={...c.best.spec,weights:[0,0]},comparison=[],zeroReplay=fullRollout(B.wrap(F,sim.graph,[c.best.spec,zero]),sim.track,sim.graph,c.genome,
  {rewardRevision:F.Rewards.PRIVATE_CONTINUITY_REVISION,onControl(car,tick){const r=observations[comparison.length];assert.equal(tick,r.tick);
    assert.deepEqual(Array.from(car.brain.policyFeatures),r.features);assert.deepEqual(car.slowOutputs,r.commands);assert.equal(car.bestProgress,r.progressM);comparison.push(tick);}});
assert.deepEqual(outcome(F,zeroReplay),baseline);assert.equal(comparison.length,observations.length);
const report={format:'private-neural-context-bank-observations-v1',passed:true,created:new Date().toISOString(),baseline,observations,genome:c.genome,heads:[c.best.spec],
  readoutNodes:Array.from(sim.graph.learning.nodes),revision:F.Rewards.PRIVATE_CONTINUITY_REVISION,zeroHeadIdenticalControls:comparison.length,
  checkpointSha256:I.sha(bytes),sourceHashes:I.collect(['work/collect-neural-context-bank.cjs']),
  boundary:'Actual neural observations, no desired actions. World progress/time annotations are excluded from runtime features. Added zero head reproduces every observed command and neural feature.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'observations.private.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log('BANK_OBSERVATIONS '+JSON.stringify({passed:true,baseline,controls:observations.length,zeroHeadIdenticalControls:comparison.length,
  report:path.join(out,'observations.private.json'),sha256:I.sha(fs.readFileSync(path.join(out,'observations.private.json')))}));
