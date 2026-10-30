'use strict';
// Evidence audit only; does not launch training, mutate a model or change an app.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),source=path.join(base,'projected-residual-3803-sac-bounded'),out=path.join(base,'projected-residual-3803-sac-trust'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const old=read(path.join(source,'report.json')),current=read(path.join(out,'report.json')),preflight=read(path.join(out,'preflight.json')),history=read(path.join(out,'trust-history.json')),checks=[];
function check(name,f){f();checks.push({name,passed:true});}
check('Both completed runs share the same environment, initial numeric actor,32initial tensors and fixed budget',()=>{
  assert.equal(old.passed,true);assert.equal(current.passed,true);assert.equal(old.phase,'finished');assert.equal(current.phase,'finished');assert.deepEqual(current.identity.environment,old.identity.environment);
  for(const f of ['steps','workers','eval_every'])assert.equal(current.identity.configuration[f],old.identity.configuration[f]);
  assert.equal(current.actualSteps,old.actualSteps);assert.equal(current.gradientUpdates,old.gradientUpdates);assert.equal(current.identity.referenceReportSha256,sha(fs.readFileSync(path.join(source,'report.json'))));
  assert.equal(current.identity.initialPolicyComparison.exactPolicyState,true);assert.equal(current.identity.initialPolicyComparison.tensors,32);assert.equal(current.identity.initialPolicyComparison.referenceCheckpointSha256,sha(fs.readFileSync(path.join(source,'initial-own-residual.zip'))));
  assert.equal(sha(fs.readFileSync(path.join(source,'initial-actor.json'))),sha(fs.readFileSync(path.join(out,'initial-actor.json'))));
  assert.equal(current.initialFull.actionTraceSha256,old.initialFull.actionTraceSha256);
  for(const [f,h]of Object.entries(current.identity.sourceHashes))assert.equal(sha(fs.readFileSync(path.join(root,f))),h,f);
});
check('Reused zero-residual native proofs are explicitly identified; fresh final model proofs remain separate',()=>{
  assert.equal(preflight.verificationReuse.sourcePreflightSha256,sha(fs.readFileSync(path.join(source,'preflight.json'))));assert.equal(preflight.verificationReuse.identicalEnvironment,true);
  assert.deepEqual(preflight.nativeVerifications,read(path.join(source,'preflight.json')).nativeVerifications);assert.equal(current.nativeVerifications.length,2);
  for(const e of current.nativeVerifications){assert.equal(e.passed,true);assert.equal(e.overlap,0);assert.equal(e.actionTraceSha256,current.best.actionTraceSha256);}
});
check('Each real gradient update records a bounded measured trust step; summaries match every recorded update',()=>{
  assert.equal(history.length,current.gradientUpdates);assert.equal(history.length,current.trust.updates);assert.equal(current.trust.budget,.001);let full=0,backtracked=0,rejected=0;
  history.forEach((r,i)=>{assert.equal(r.update,i+1);assert.ok(r.actualReplaySamples>=1&&r.actualReplaySamples<=128);assert.ok(Number.isFinite(r.acceptedMeanKl)&&r.acceptedMeanKl>=0&&r.acceptedMeanKl<=.001);assert.ok(Number.isInteger(r.backtracks)&&r.backtracks>=0&&r.backtracks<=12);assert.ok(Number.isFinite(r.fraction)&&r.fraction>=0&&r.fraction<=1);if(r.fraction===1)full++;else if(r.fraction>0)backtracked++;else rejected++;assert.equal(r.rejected,r.fraction===0);});
  assert.equal(current.trust.fullUpdates,full);assert.equal(current.trust.backtrackedUpdates,backtracked);assert.equal(current.trust.rejectedUpdates,rejected);assert.ok(backtracked>0,'The proposed experimental constraint must actually have been active');
});
check('All five periodic candidate evaluations were real from-line uncensored native episodes with exclusive pedals',()=>{
  assert.equal(current.evaluations.length,old.evaluations.length);current.evaluations.forEach((row,i)=>{assert.equal(row.steps,old.evaluations[i].steps);assert.equal(row.nativeFull.validationMode,'full');assert.equal(row.nativeFull.censored,false);assert.equal(row.nativeFull.complete,true);assert.equal(row.nativeFull.gasBrakeOverlapSteps,0);assert.ok(row.trust.updates>0);});
});
const result={passed:true,checks,currentReportSha256:sha(fs.readFileSync(path.join(out,'report.json'))),referenceReportSha256:sha(fs.readFileSync(path.join(source,'report.json'))),trustHistorySha256:sha(fs.readFileSync(path.join(out,'trust-history.json'))),
  selectedImproved:current.improved,referenceBest:old.best.result,currentBest:current.best.result,referenceFinal:old.final.result,currentFinal:current.final.result,trust:current.trust,
  boundary:'Controlled single warm-start V3/Monza/seed comparison. Measured trust constraint is active; it is not a global safety guarantee, proof of causal superiority across seeds, all-model convergence or completed laps unless actual recorded metrics show them. No change to either active app or distributed5.6.0.'};
fs.writeFileSync(path.join(out,'comparison-verification.json'),JSON.stringify(result,null,2));console.log('TRUST_COMPARISON_VERIFIED '+JSON.stringify(result));
