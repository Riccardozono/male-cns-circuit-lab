'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),
  F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),B=require('./neural-context-bank.cjs'),
  I=require('./neural-research-source-identity.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  study=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-cem-ab-20261024-01'),
  obsFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-observations-20261024-01/observations.private.json'),
  contextFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-calibration-20261024-01/config.private.json'),
  calibrationFile=path.join(path.dirname(contextFile),'report.json'),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-proof-20261024-01');
if(fs.existsSync(out))throw Error('Preserve bank proof');
const report=JSON.parse(fs.readFileSync(path.join(study,'report.json'),'utf8')),bytes=fs.readFileSync(path.join(study,'checkpoint.private.json')),checkpoint=JSON.parse(bytes),
  observations=JSON.parse(fs.readFileSync(obsFile,'utf8')),context=JSON.parse(fs.readFileSync(contextFile,'utf8')),calibration=JSON.parse(fs.readFileSync(calibrationFile,'utf8')),
  current={...I.collect(['work/train-neural-context-bank-ab.cjs']),observations:I.sha(fs.readFileSync(obsFile)),context:I.sha(fs.readFileSync(contextFile)),calibration:I.sha(fs.readFileSync(calibrationFile))};
assert.equal(report.passed,true);assert.deepEqual(current,report.sourceHashes);assert.deepEqual(current,checkpoint.sourceHashes);
assert.deepEqual(checkpoint.genome,observations.genome);assert.deepEqual(checkpoint.heads,observations.heads);
const sim=P.setup(),zero={context,weights:[0,0],retention:.9};
function run(spec,headingOffsetRad=0,revision=checkpoint.revision){let controls=0;const prefix=crypto.createHash('sha256'),base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}},
  result=fullRollout(B.wrap(base,sim.graph,[...checkpoint.heads,spec]),sim.track,sim.graph,checkpoint.genome,{rewardRevision:revision,onControl(car,tick){
    if(headingOffsetRad===0&&controls<calibration.prefixCount){const old=observations.observations[controls];assert.equal(tick,old.tick);
      assert.deepEqual(car.slowOutputs,old.commands);assert.deepEqual(Array.from(car.brain.policyFeatures),old.features);
      prefix.update(JSON.stringify([tick,car.x,car.y,car.heading,car.vehicle,car.slowOutputs])+'\n');
      prefix.update(new Uint8Array(car.brain.activity.buffer,car.brain.activity.byteOffset,car.brain.activity.byteLength));}
    controls++;
  }});return {outcome:outcome(F,result),prefixTraceSha256:prefix.digest('hex'),controls,
    physical:{distanceM:result.car.distance/(sim.track.pixelsPerMeter||1),seconds:result.car.lifetime,x:result.car.x,y:result.car.y,
      heading:result.car.heading,onRoad:F.onRoad(sim.track,result.car.x,result.car.y),collision:F.collided(sim.track,result.car)}};}
const baseline=run(zero);assert.deepEqual(baseline.outcome,report.baseline);const proofs=[];
for(const arm of checkpoint.arms){const expected=report.arms.find(a=>a.name===arm.name);assert.deepEqual(arm.bestSafe,expected.bestSafe);
  for(let i=0;i<2;i++){const proof=run(arm.bestSafe.spec);assert.deepEqual(proof.outcome,arm.bestSafe.outcome);assert.equal(proof.prefixTraceSha256,baseline.prefixTraceSha256);proofs.push({arm:arm.name,...proof});}}
const first=report.events[0].arms;assert.equal(first[0].cases.length,first[1].cases.length);
for(let i=0;i<first[0].cases.length;i++){assert.deepEqual(first[0].cases[i].spec,first[1].cases[i].spec);assert.deepEqual(first[0].cases[i].outcome,first[1].cases[i].outcome);}
const best=checkpoint.arms.slice().sort((a,b)=>F.compareLearningAgents(a.bestSafe.outcome,b.bestSafe.outcome))[0],perturbations=[],legacyNewPolicy=run(best.bestSafe.spec,0,'progress-3');
for(const headingOffsetRad of [-.005,-.0025,.0025,.005])perturbations.push({headingOffsetRad,before:run(zero,headingOffsetRad).outcome,after:run(best.bestSafe.spec,headingOffsetRad).outcome});
const saveHash=I.sha(fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save'));assert.equal(saveHash,report.originalSaveSha256);
const result={format:'private-neural-context-bank-independent-proof-v1',passed:true,created:new Date().toISOString(),
  learningSucceeded:best.bestSafe.outcome.safe&&best.bestSafe.outcome.laps>=2,baseline,proofs,bestArm:best.name,best:best.bestSafe,perturbations,legacyNewPolicy,
  protectedIdenticalControls:calibration.prefixCount,firstUpdatePairIdenticalCases:first[0].cases.length,
  sourceHashes:current,verifierHashes:I.collect(['work/verify-neural-context-bank-ab.cjs']),checkpointSha256:I.sha(bytes),
  trainingReportSha256:I.sha(fs.readFileSync(path.join(study,'report.json'))),originalSaveSha256:saveHash,
  boundary:'New-process from-line native replay; same physical/neural/action prefix through the calibrated retained context, not optimizer continuation or all-track convergence. Four offsets are limited robustness checks. Private decoder and objective revision remain distinct from app saves.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2),{flag:'wx'});fs.writeFileSync(path.join(out,'checkpoint-snapshot.private.json'),bytes,{flag:'wx'});
console.log('BANK_PROOF '+JSON.stringify({passed:true,learningSucceeded:result.learningSucceeded,bestArm:best.name,best:best.bestSafe.outcome,perturbations,
  protectedIdenticalControls:calibration.prefixCount,firstUpdatePairIdenticalCases:first[0].cases.length,legacyNewPolicy:legacyNewPolicy.outcome,
  report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
