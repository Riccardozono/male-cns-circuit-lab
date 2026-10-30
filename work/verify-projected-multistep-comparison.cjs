'use strict';
// Reconcile a completed real n-step experiment without modifying any runtime.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),source=path.join(base,'projected-residual-3803-sac-bounded'),out=path.join(base,'projected-residual-3803-sac-multistep'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const previous=read(path.join(source,'report.json')),current=read(path.join(out,'report.json')),checks=[];
function check(name,f){f();checks.push({name,passed:true});}
check('Reference and multistep run share actual initial32tensors, numeric actor, environment and maximum data budget',()=>{
  assert.equal(previous.passed,true);assert.equal(current.passed,true);assert.equal(current.phase,'finished');assert.deepEqual(current.identity.environment,previous.identity.environment);
  for(const k of ['steps','workers','eval_every'])assert.equal(current.identity.configuration[k],previous.identity.configuration[k]);
  assert.equal(current.identity.initialPolicyComparison.exactPolicyState,true);assert.equal(current.identity.initialPolicyComparison.tensors,32);assert.equal(current.identity.referenceReportSha256,sha(fs.readFileSync(path.join(source,'report.json'))));
  assert.equal(sha(fs.readFileSync(path.join(out,'initial-actor.json'))),sha(fs.readFileSync(path.join(source,'initial-actor.json'))));assert.equal(current.initialFull.actionTraceSha256,previous.initialFull.actionTraceSha256);
  assert.ok(current.actualSteps<=previous.actualSteps);if(current.actualSteps<previous.actualSteps)assert.equal(current.best.result.laps,2,'Early stop is valid only for actually verified two laps');
  for(const [f,h]of Object.entries(current.identity.sourceHashes))assert.equal(sha(fs.readFileSync(path.join(root,f))),h,f);
});
check('The installed code actually uses16step replay, finite real targets and the expected per-transition discount',()=>{
  for(const record of Object.values(current.identity.installedSources))assert.equal(sha(fs.readFileSync(record.path)),record.sha256);
  assert.equal(current.rewardBackup.steps,16);assert.equal(current.rewardBackup.buffer,'NStepReplayBuffer');assert.equal(current.rewardBackup.gamma,.999);assert.equal(current.rewardBackup.bootstrapDiscount,.999**16);
  const s=current.actualTargetSample;assert.equal(s.actualSampleSize,256);assert.ok(s.discountMinimum>=.999**16-1e-6&&s.discountMinimum<=.999**16+1e-6);assert.ok(s.discountMaximum<=.999+1e-6);assert.ok(Number.isFinite(s.rewardMinimum)&&Number.isFinite(s.rewardMaximum));assert.ok(s.terminatedTargets>=0&&s.terminatedTargets<=256);
});
check('Every periodic evaluation is uncensored from the line; fresh exported native final proofs agree',()=>{
  assert.ok(current.evaluations.length>=1&&current.evaluations.length<=previous.evaluations.length);
  current.evaluations.forEach((row,i)=>{assert.equal(row.steps,previous.evaluations[i].steps);assert.equal(row.rewardBackup.steps,16);assert.equal(row.rewardBackup.buffer,'NStepReplayBuffer');assert.equal(row.nativeFull.validationMode,'full');assert.equal(row.nativeFull.censored,false);assert.equal(row.nativeFull.complete,true);assert.equal(row.nativeFull.gasBrakeOverlapSteps,0);});
  assert.equal(current.nativeVerifications.length,2);for(const e of current.nativeVerifications){assert.equal(e.passed,true);assert.equal(e.overlap,0);assert.equal(e.actionTraceSha256,current.best.actionTraceSha256);}
});
const result={passed:true,checks,reportSha256:sha(fs.readFileSync(path.join(out,'report.json'))),referenceReportSha256:sha(fs.readFileSync(path.join(source,'report.json'))),selectedImproved:current.improved,
  referenceBest:previous.best.result,currentBest:current.best.result,referenceFinal:previous.final.result,currentFinal:current.final.result,actualSteps:current.actualSteps,gradientUpdates:current.gradientUpdates,practiceEpisodes:current.practiceEpisodes,rewardBackup:current.rewardBackup,actualTargetSample:current.actualTargetSample,
  boundary:'Controlled single warm-start V3/Monza/seed comparison of16step versus1step reward backup only. Same instantaneous rewards and physical termination, not bigger artificial rewards or invented examples. Does not prove convergence on other models/tracks/seeds, or install this model into an open app. Reused initial proofs remain explicitly recorded in preflight.json.'};
fs.writeFileSync(path.join(out,'comparison-verification.json'),JSON.stringify(result,null,2));console.log('MULTISTEP_COMPARISON_VERIFIED '+JSON.stringify(result));
