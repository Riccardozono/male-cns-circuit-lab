'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),
  F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),B=require('./neural-context-bank.cjs'),
  O=require('./neural-domain-objective.cjs'),I=require('./neural-research-source-identity.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  study=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-joint-cem-20261024-01'),
  parentDir=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-proof-20261024-01'),parentFile=path.join(parentDir,'checkpoint-snapshot.private.json'),parentProofFile=path.join(parentDir,'report.json'),
  dataFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-domains-20261024-01/training-observations.private.json'),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-joint-proof-20261024-01');
if(fs.existsSync(out))throw Error('Preserve joint proof');
const report=JSON.parse(fs.readFileSync(path.join(study,'report.json'),'utf8')),bytes=fs.readFileSync(path.join(study,'checkpoint.private.json')),c=JSON.parse(bytes),
  data=JSON.parse(fs.readFileSync(dataFile,'utf8')),current={...I.collect(['work/train-neural-domain-joint.cjs']),parentCheckpoint:I.sha(fs.readFileSync(parentFile)),
    parentProof:I.sha(fs.readFileSync(parentProofFile)),trainingData:I.sha(fs.readFileSync(dataFile))};
assert.equal(report.passed,true);assert.deepEqual(current,c.sourceHashes);assert.deepEqual(current,report.sourceHashes);assert.deepEqual(c.bestSafe,report.bestSafe);
assert.deepEqual(c.testOffsets,report.settings.testOffsets);assert.equal(c.testOffsets.some(v=>c.trainingOffsets.includes(v)||c.heldOutOffsets.includes(v)),false);
const sim=P.setup();
function run(weights,offset){const base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=offset;return car;}},
  heads=[{...c.firstHead,weights:weights.slice(0,2)},{context:c.context,weights:weights.slice(2),retention:.9}],reference=data.training.find(r=>r.headingOffsetRad===offset),
  protection=reference?641:0,hash=crypto.createHash('sha256');let controls=0,positive=[0,0];
  const r=fullRollout(B.wrap(base,sim.graph,heads),sim.track,sim.graph,c.genome,{rewardRevision:c.revision,onControl(car,tick){
    for(let i=0;i<2;i++)positive[i]+=car.brain.contextBankGates[i]>0;
    if(controls<protection){assert.deepEqual(car.slowOutputs,reference.observations[controls].commands);assert.deepEqual(Array.from(car.brain.policyFeatures),reference.observations[controls].features);
      assert.ok(car.brain.contextBankGates.every(g=>g===0));hash.update(JSON.stringify([tick,car.x,car.y,car.heading,car.vehicle,car.slowOutputs])+'\n');
      hash.update(new Uint8Array(car.brain.activity.buffer,car.brain.activity.byteOffset,car.brain.activity.byteLength));}
    controls++;
  }});return {result:outcome(F,r),protectedControls:protection,prefixTraceSha256:hash.digest('hex'),positiveGateControls:positive,
    physical:{distanceM:r.car.distance/(sim.track.pixelsPerMeter||1),seconds:r.car.lifetime,onRoad:F.onRoad(sim.track,r.car.x,r.car.y),collision:F.collided(sim.track,r.car)}};
}
const training=[];
for(const offset of c.trainingOffsets){const before=run(report.baselineWeights,offset),after=run(c.bestSafe.weights,offset),repeat=run(c.bestSafe.weights,offset),expected=c.bestSafe.outcomes.find(r=>r.headingOffsetRad===offset).result;
  assert.deepEqual(before.result,report.baseline.find(r=>r.headingOffsetRad===offset).result);assert.deepEqual(after.result,expected);assert.deepEqual(after,repeat);
  assert.equal(before.prefixTraceSha256,after.prefixTraceSha256);training.push({headingOffsetRad:offset,before,after,repeatIdentical:true});
  console.log('JOINT_PROOF_TRAIN '+JSON.stringify({headingOffsetRad:offset,before:before.result,after:after.result}));
}
assert.deepEqual(O.aggregate(training.map(r=>r.after.result)),c.bestSafe.aggregate);
const evaluateOffsets=(offsets,label)=>offsets.map(offset=>{assert.equal(c.trainingOffsets.includes(offset),false);
  const row={headingOffsetRad:offset,before:run(report.baselineWeights,offset),after:run(c.bestSafe.weights,offset)};
  console.log('JOINT_PROOF_EVAL '+JSON.stringify({split:label,headingOffsetRad:offset,before:row.before.result,after:row.after.result}));return row;});
const validation=evaluateOffsets(c.heldOutOffsets,'prior-validation'),test=evaluateOffsets(c.testOffsets,'new-prespecified-test'),
  validationBefore=O.aggregate(validation.map(r=>r.before.result)),validationAfter=O.aggregate(validation.map(r=>r.after.result)),
  testBefore=O.aggregate(test.map(r=>r.before.result)),testAfter=O.aggregate(test.map(r=>r.after.result)),
  saveHash=I.sha(fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save'));
assert.equal(saveHash,report.originalSaveSha256);assert.equal(saveHash,'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');
const proof={format:'private-neural-domain-joint-independent-proof-v1',passed:true,created:new Date().toISOString(),
  learningSucceeded:c.bestSafe.aggregate.minimumLaps>=2&&validationAfter.minimumLaps>=2&&testAfter.minimumLaps>=2&&validationAfter.allSafe&&testAfter.allSafe,
  training,trainingAggregate:c.bestSafe.aggregate,validation,validationBefore,validationAfter,test,testBefore,testAfter,
  trainingReportSha256:I.sha(fs.readFileSync(path.join(study,'report.json'))),checkpointSha256:I.sha(bytes),sourceHashes:current,
  verifierHashes:I.collect(['work/verify-neural-domain-joint.cjs']),originalSaveSha256:saveHash,
  boundary:'Fresh native replays, same retained physical/neural/action prefix for training starts. Previous ±0.005 validation was already observed for older models; ±0.00125 was predeclared for this new fit and excluded from calibration/training. Limited checks, not all-track/model or cold-start learning. Private decoder and objective revision, no app deployment.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(proof,null,2),{flag:'wx'});fs.writeFileSync(path.join(out,'checkpoint-snapshot.private.json'),bytes,{flag:'wx'});
console.log('JOINT_PROOF_RESULT '+JSON.stringify({passed:true,learningSucceeded:proof.learningSucceeded,trainingAggregate:c.bestSafe.aggregate,
  validationBefore,validationAfter,testBefore,testAfter,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
