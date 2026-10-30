'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),F=require('../outputs/simulation.js'),
  Fixed=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),
  I=require('./neural-research-source-identity.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  input=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-safe-cem-20261024-01/checkpoint.private.json'),bytes=fs.readFileSync(input),checkpoint=JSON.parse(bytes),
  priorFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-retention-20261024-01/report.json'),prior=JSON.parse(fs.readFileSync(priorFile,'utf8')),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-progress-continuity-ab-20261024-01');
if(fs.existsSync(out))throw Error('Preserve continuity A/B');
const sim=P.setup(),before=I.collect(['work/verify-neural-progress-continuity.cjs']),started=Date.now(),records=[];
function run(api,spec,revision,prefixTicks){let ticks=0,atOldEnd=null;const hash=crypto.createHash('sha256');
  const runtime=M.wrap({...api,drive(track,car,commands,dt=api.DT){
    if(ticks<prefixTicks){hash.update(JSON.stringify([ticks,car.x,car.y,car.heading,car.vehicle,commands,car.brain.contextMotorGate,car.brain.contextMotorMemory])+'\n');
      hash.update(new Uint8Array(car.brain.activity.buffer,car.brain.activity.byteOffset,car.brain.activity.byteLength));}
    api.drive(track,car,commands,dt);ticks++;
    if(ticks===prefixTicks)atOldEnd={alive:car.alive,reason:car.reason,progress:car.bestProgress,invalidSteps:car.rewardState.invalidSteps};
  }},sim.graph,spec),result=fullRollout(runtime,sim.track,sim.graph,checkpoint.genome,{rewardRevision:revision});
  return {outcome:outcome(api,result),prefixTraceSha256:hash.digest('hex'),atOldEnd};
}
for(const retention of [.98,.9825,.985,.9875,.99]){
  const spec={...checkpoint.best.spec,retention},expected=prior.cases.find(c=>c.spec.retention===retention).outcome,
    original=run(F,spec,'progress-3',expected.ticks),legacyFork=run(Fixed,spec,'progress-3',expected.ticks),
    corrected=run(Fixed,spec,Fixed.Rewards.PRIVATE_CONTINUITY_REVISION,expected.ticks);
  assert.deepEqual(original.outcome,expected);assert.deepEqual(legacyFork,original);
  assert.equal(corrected.prefixTraceSha256,original.prefixTraceSha256);
  records.push({retention,original,legacyFork,corrected});
  console.log('CONTINUITY_CASE '+JSON.stringify({retention,original:original.outcome,corrected:corrected.outcome,
    atOldEnd:corrected.atOldEnd,exactPhysicalNeuralActionPrefix:true}));
}
const falseStops=records.filter(r=>r.original.outcome.reason==='progresso non valido'),
  fixedCount=falseStops.filter(r=>r.corrected.atOldEnd.alive&&r.corrected.atOldEnd.invalidSteps===0).length,
  best=records.filter(r=>r.corrected.outcome.safe).sort((a,b)=>F.compareLearningAgents(a.corrected.outcome,b.corrected.outcome))[0],
  save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',saveHash=I.sha(fs.readFileSync(save)),
  report={format:'private-neural-progress-continuity-ab-v1',created:new Date().toISOString(),passed:fixedCount===falseStops.length&&fixedCount===2,
    learningSucceeded:best.corrected.outcome.safe&&best.corrected.outcome.laps>=2,records,falseStopsFixed:fixedCount,bestSafe:best,
    checkpointSha256:I.sha(bytes),priorReportSha256:I.sha(fs.readFileSync(priorFile)),sourceHashes:before,originalSaveSha256:saveHash,
    wallSeconds:(Date.now()-started)/1000,revision:Fixed.Rewards.PRIVATE_CONTINUITY_REVISION,
    boundary:'Separate objective revision, incompatible with standard app saves. All original R3 outcomes reproduce in the fork; every corrected car has bit-identical physical/neural/action prefix through the original episode. Legitimate projection changes are evaluated, never supplied as steering or throttle. A removed false stop is not successful learning or a completed lap.'};
assert.equal(report.passed,true);assert.equal(saveHash,'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');assert.deepEqual(I.collect(['work/verify-neural-progress-continuity.cjs']),before);
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});fs.writeFileSync(path.join(out,'checkpoint-snapshot.private.json'),bytes,{flag:'wx'});
console.log('CONTINUITY_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,falseStopsFixed:fixedCount,bestSafe:best.corrected.outcome,
  report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json'))),wallSeconds:report.wallSeconds}));
