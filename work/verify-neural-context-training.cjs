'use strict';
// Run only after the CEM process exits: fresh-process physical verification.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),
  F=require('../outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),
  I=require('./neural-research-source-identity.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..');
const trainingDir=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-cem-20261024-01'),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-verification-20261024-01'),
  parentFile=path.join(root,'.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/zero-only.private.json'),
  parentReport=path.join(path.dirname(parentFile),'report.json'),
  probeReport=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-motor-probe-20261024-01/report.json'),
  original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
if(fs.existsSync(out))throw Error('Preserve previous verification');
const report=JSON.parse(fs.readFileSync(path.join(trainingDir,'report.json'),'utf8')),
  checkpointBytes=fs.readFileSync(path.join(trainingDir,'checkpoint.private.json')),checkpoint=JSON.parse(checkpointBytes),
  currentHashes={...I.collect(['work/train-neural-context-cem.cjs']),parentFile:I.sha(fs.readFileSync(parentFile)),
    parentReport:I.sha(fs.readFileSync(parentReport)),probeReport:I.sha(fs.readFileSync(probeReport))};
assert.equal(report.passed,true);assert.deepEqual(currentHashes,report.sourceHashes);assert.deepEqual(currentHashes,checkpoint.sourceHashes);
assert.deepEqual(checkpoint.bestSafe,report.bestSafe);assert.deepEqual(checkpoint.bestResearch,report.bestResearch);
assert.equal(I.sha(fs.readFileSync(original)),'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');
const sim=P.setup(),genome=JSON.parse(fs.readFileSync(parentFile,'utf8')).genome;assert.deepEqual(genome,checkpoint.genome);
function run(spec,headingOffsetRad=0){const hash=crypto.createHash('sha256'),base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}},api=spec?M.wrap(base,sim.graph,spec):base,
  result=fullRollout(api,sim.track,sim.graph,genome,{rewardRevision:'progress-3',onControl(car,tick){
    hash.update(JSON.stringify([tick,car.x,car.y,car.heading,car.speed,car.bestProgress,car.fitness,car.vehicle,car.slowOutputs,car.sensorVector])+'\n');
    hash.update(new Uint8Array(car.brain.activity.buffer,car.brain.activity.byteOffset,car.brain.activity.byteLength));
  }});return {outcome:outcome(F,result),traceSha256:hash.digest('hex')};}
const baseline=run(null),zero=run({...report.bestSafe.spec,weights:[0,0]}),safe=run(checkpoint.bestSafe.spec),research=run(checkpoint.bestResearch.spec);
assert.deepEqual(baseline.outcome,report.baseline);assert.deepEqual(zero,baseline);
assert.deepEqual(safe.outcome,report.bestSafe.outcome);assert.deepEqual(research.outcome,report.bestResearch.outcome);
assert.equal(baseline.traceSha256,JSON.parse(fs.readFileSync(probeReport,'utf8')).baselineTraceSha256);
assert.equal(I.sha(fs.readFileSync(original)),report.originalSaveSha256);
const perturbations=[];
for(const headingOffsetRad of [-.005,-.0025,.0025,.005]){
  const before=run(null,headingOffsetRad),after=run(checkpoint.bestSafe.spec,headingOffsetRad);
  perturbations.push({headingOffsetRad,before:before.outcome,after:after.outcome});
}
const result={format:'private-context-cem-fresh-process-proof-v1',passed:true,created:new Date().toISOString(),
  learningSucceeded:safe.outcome.safe&&safe.outcome.laps>=2,baseline,zero,safe,research,perturbations,
  trainingReportSha256:I.sha(fs.readFileSync(path.join(trainingDir,'report.json'))),checkpointSha256:I.sha(checkpointBytes),
  sourceHashes:currentHashes,verifierHashes:I.collect(['work/verify-neural-context-training.cjs']),originalSaveSha256:report.originalSaveSha256,
  boundary:'Fresh process confirms recorded physical outcomes and zero-head trace identity, not future optimizer continuation, generalization or successful learning.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'checkpoint-snapshot.private.json'),checkpointBytes,{flag:'wx'});
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2),{flag:'wx'});fs.copyFileSync(__filename,path.join(out,'verifier-at-run.cjs'));
console.log('CONTEXT_PROOF '+JSON.stringify({passed:true,learningSucceeded:result.learningSucceeded,safe:safe.outcome,research:research.outcome,
  report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
