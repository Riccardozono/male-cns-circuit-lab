'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),
  M=require('./neural-context-motor.cjs'),I=require('./neural-research-source-identity.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  input=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-safe-cem-20261024-01/checkpoint.private.json'),bytes=fs.readFileSync(input),c=JSON.parse(bytes),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-retention-20261024-01');
if(fs.existsSync(out))throw Error('Preserve retention probe');
const sim=P.setup(),started=Date.now();
function run(spec,headingOffsetRad=0){const base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}};
  return outcome(F,fullRollout(M.wrap(base,sim.graph,spec),sim.track,sim.graph,c.genome,{rewardRevision:'progress-3'}));}
const cases=[.98,.9825,.985,.9875,.99].map(retention=>{const spec={...c.best.spec,retention};return {spec,outcome:run(spec)};});
assert.deepEqual(cases[0].outcome,c.best.outcome);
const best=cases.filter(x=>x.outcome.safe).sort((a,b)=>F.compareLearningAgents(a.outcome,b.outcome))[0],proofs=[run(best.spec),run(best.spec)];
proofs.forEach(r=>assert.deepEqual(r,best.outcome));const perturbations=[];
for(const headingOffsetRad of [-.005,-.0025,.0025,.005])perturbations.push({headingOffsetRad,before:run(c.best.spec,headingOffsetRad),after:run(best.spec,headingOffsetRad)});
const report={format:'private-context-retention-probe-v1',passed:true,created:new Date().toISOString(),baseline:c.best.outcome,cases,best,proofs,perturbations,
  learningSucceeded:best.outcome.safe&&best.outcome.laps>=2,singleStartImproved:best.outcome.bestProgress>c.best.outcome.bestProgress+1,
  checkpointSha256:I.sha(bytes),sourceHashes:I.collect(['work/probe-neural-context-retention.cjs']),wallSeconds:(Date.now()-started)/1000,
  boundary:'Only bounded neural-history retention varies; learned coefficients fixed. Full fresh physical episodes, no route/clock inputs, action labels, gifted progress or simulated-time cap. Hyperparameter probe, not additional generations or a normal app save.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log('RETENTION_RESULT '+JSON.stringify({passed:true,learningSucceeded:report.learningSucceeded,singleStartImproved:report.singleStartImproved,
  cases:cases.map(x=>({retention:x.spec.retention,outcome:x.outcome})),best:best.outcome,perturbations,
  report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
