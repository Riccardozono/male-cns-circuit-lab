'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),
  F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),B=require('./neural-context-bank.cjs'),
  O=require('./neural-domain-objective.cjs'),I=require('./neural-research-source-identity.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  study=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-cem-20261024-02'),
  dataFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-domains-20261024-01/training-observations.private.json'),
  configFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-calibration-20261024-01/config.private.json'),calibrationFile=path.join(path.dirname(configFile),'report.json'),
  preflightFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-preflight-20261024-01/report.json'),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-proof-20261024-01');
if(fs.existsSync(out))throw Error('Preserve domain proof');
const report=JSON.parse(fs.readFileSync(path.join(study,'report.json'),'utf8')),bytes=fs.readFileSync(path.join(study,'checkpoint.private.json')),c=JSON.parse(bytes),
  data=JSON.parse(fs.readFileSync(dataFile,'utf8')),context=JSON.parse(fs.readFileSync(configFile,'utf8')),calibration=JSON.parse(fs.readFileSync(calibrationFile,'utf8')),
  current={...I.collect(['work/train-neural-domain-context.cjs']),trainingObservations:I.sha(fs.readFileSync(dataFile)),context:I.sha(fs.readFileSync(configFile)),
    calibration:I.sha(fs.readFileSync(calibrationFile)),preflight:I.sha(fs.readFileSync(preflightFile))};
assert.equal(report.passed,true);assert.deepEqual(current,report.sourceHashes);assert.deepEqual(current,c.sourceHashes);assert.deepEqual(c.bestSafe,report.bestSafe);
assert.deepEqual(c.trainingOffsets,data.trainingOffsets);assert.deepEqual(c.heldOutOffsets,data.heldOutOffsets);
const sim=P.setup(),zero={context,weights:[0,0],retention:.9};
function run(spec,offset){let control=0,positive=0,maxGate=0;const reference=data.training.find(d=>d.headingOffsetRad===offset),
  protection=calibration.profiles.find(p=>p.headingOffsetRad===offset)?.protectedControls??0,hash=crypto.createHash('sha256'),
  base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=offset;return car;}},
  r=fullRollout(B.wrap(base,sim.graph,[...c.heads,spec]),sim.track,sim.graph,c.genome,{rewardRevision:c.revision,onControl(car,tick){
    const gate=car.brain.contextBankGates[1];positive+=gate>0;maxGate=Math.max(maxGate,gate);
    if(control<protection){assert.equal(gate,0);assert.deepEqual(car.slowOutputs,reference.observations[control].commands);assert.deepEqual(Array.from(car.brain.policyFeatures),reference.observations[control].features);
      hash.update(JSON.stringify([tick,car.x,car.y,car.heading,car.vehicle,car.slowOutputs])+'\n');hash.update(new Uint8Array(car.brain.activity.buffer,car.brain.activity.byteOffset,car.brain.activity.byteLength));}
    control++;
  }});
  return {result:outcome(F,r),protectedControls:protection,prefixTraceSha256:hash.digest('hex'),positiveGateControls:positive,maxGate,
    physical:{distanceM:r.car.distance/(sim.track.pixelsPerMeter||1),seconds:r.car.lifetime,onRoad:F.onRoad(sim.track,r.car.x,r.car.y),collision:F.collided(sim.track,r.car)}};
}
const training=[];
for(const offset of c.trainingOffsets){const before=run(zero,offset),first=run(c.bestSafe.spec,offset),second=run(c.bestSafe.spec,offset),expected=c.bestSafe.outcomes.find(r=>r.headingOffsetRad===offset).result;
  assert.deepEqual(before.result,data.training.find(d=>d.headingOffsetRad===offset).baseline);assert.deepEqual(first.result,expected);assert.deepEqual(second,first);
  assert.equal(first.prefixTraceSha256,before.prefixTraceSha256);training.push({headingOffsetRad:offset,before,after:first,repeatIdentical:true});
}
assert.deepEqual(O.aggregate(training.map(r=>r.after.result)),c.bestSafe.aggregate);
const heldOut=[];for(const offset of c.heldOutOffsets){assert.equal(c.trainingOffsets.includes(offset),false);
  heldOut.push({headingOffsetRad:offset,before:run(zero,offset),after:run(c.bestSafe.spec,offset)});}
const heldOutBefore=O.aggregate(heldOut.map(r=>r.before.result)),heldOutAfter=O.aggregate(heldOut.map(r=>r.after.result)),
  saveHash=I.sha(fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save'));
assert.equal(saveHash,report.originalSaveSha256);assert.equal(saveHash,'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');
const proof={format:'private-neural-domain-independent-proof-v1',passed:true,created:new Date().toISOString(),
  learningSucceeded:c.bestSafe.aggregate.minimumLaps>=2&&heldOutAfter.minimumLaps>=2&&heldOutAfter.allSafe,
  training,trainingAggregate:c.bestSafe.aggregate,heldOut,heldOutBefore,heldOutAfter,
  trainingReportSha256:I.sha(fs.readFileSync(path.join(study,'report.json'))),checkpointSha256:I.sha(bytes),sourceHashes:current,
  verifierHashes:I.collect(['work/verify-neural-domain-context.cjs']),originalSaveSha256:saveHash,
  boundary:'Fresh process confirms three training starts and protected physical/neural/action prefixes. Two other headings were excluded from fitting/training; this is their first evaluation for the newly fitted policy. A limited held-out check is not all-track/model convergence. Incompatible private objective/decoder, no app update.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(proof,null,2),{flag:'wx'});fs.writeFileSync(path.join(out,'checkpoint-snapshot.private.json'),bytes,{flag:'wx'});
console.log('DOMAIN_PROOF '+JSON.stringify({passed:true,learningSucceeded:proof.learningSucceeded,trainingAggregate:c.bestSafe.aggregate,heldOutBefore,heldOutAfter,
  heldOut:heldOut.map(r=>({heading:r.headingOffsetRad,before:r.before.result,after:r.after.result,gateControls:r.after.positiveGateControls})),
  report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
