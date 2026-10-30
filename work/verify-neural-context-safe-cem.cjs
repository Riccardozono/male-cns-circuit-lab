'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../outputs/simulation.js'),
  P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  prior=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-cem-20261024-01/checkpoint.private.json'),
  study=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-safe-cem-20261024-01'),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-safe-verification-20261024-01');
if(fs.existsSync(out))throw Error('Preserve safe CEM proof');
const r=JSON.parse(fs.readFileSync(path.join(study,'report.json'),'utf8')),bytes=fs.readFileSync(path.join(study,'checkpoint.private.json')),
  c=JSON.parse(bytes),p=JSON.parse(fs.readFileSync(prior,'utf8')),
  hashes={...I.collect(['work/train-neural-context-safe-cem.cjs']),parentCheckpoint:I.sha(fs.readFileSync(prior))},sim=P.setup();
assert.equal(r.passed,true);assert.deepEqual(hashes,r.sourceHashes);assert.deepEqual(hashes,c.sourceHashes);assert.deepEqual(c.best,r.best);assert.deepEqual(c.genome,p.genome);
function run(spec,headingOffsetRad=0){const base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}};
  return outcome(F,fullRollout(spec?M.wrap(base,sim.graph,spec):base,sim.track,sim.graph,c.genome,{rewardRevision:'progress-3'}));}
const baseline=run(null),initial=run(p.bestSafe.spec),proofs=[run(c.best.spec),run(c.best.spec)];
assert.deepEqual(baseline,r.baseline);assert.deepEqual(initial,r.initial);proofs.forEach(proof=>assert.deepEqual(proof,r.best.outcome));
const perturbations=[];for(const headingOffsetRad of [-.005,-.0025,.0025,.005])perturbations.push({headingOffsetRad,before:run(p.bestSafe.spec,headingOffsetRad),after:run(c.best.spec,headingOffsetRad)});
const saveHash=I.sha(fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save'));
assert.equal(saveHash,'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');assert.equal(saveHash,r.originalSaveSha256);
const report={format:'private-context-safe-cem-fresh-process-proof-v1',passed:true,created:new Date().toISOString(),
  learningSucceeded:c.best.outcome.safe&&c.best.outcome.laps>=2,baseline,initial,proofs,perturbations,sourceHashes:hashes,
  verifierHashes:I.collect(['work/verify-neural-context-safe-cem.cjs']),originalSaveSha256:saveHash,
  trainingReportSha256:I.sha(fs.readFileSync(path.join(study,'report.json'))),checkpointSha256:I.sha(bytes),
  boundary:'New process verifies native outcomes, not full optimizer continuation. Four heading perturbations are a limited robustness check, not all-track/model or cold-start convergence. Private nonlinear readout remains incompatible with standard app saves.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
fs.writeFileSync(path.join(out,'checkpoint-snapshot.private.json'),bytes,{flag:'wx'});fs.copyFileSync(__filename,path.join(out,'verifier-at-run.cjs'));
console.log('SAFE_CONTEXT_PROOF '+JSON.stringify({passed:true,learningSucceeded:report.learningSucceeded,baseline,initial,best:proofs[0],
  perturbations,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
