'use strict';
// Complete physical counterfactuals of gradient steps, never target actions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),
  P=require('./physical-rollout-pool.cjs'),O=require('./neural-domain-objective.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  study=path.join(root,'.impeccable/review/learning-ml/v3-global-policy-cuda4-20261024-01'),metaFile=path.join(study,'metadata.private.json'),updateFile=path.join(study,'update-01.json'),
  meta=JSON.parse(fs.readFileSync(metaFile,'utf8')),update=JSON.parse(fs.readFileSync(updateFile,'utf8')),
  out=path.join(root,'.impeccable/review/learning-ml/v3-global-policy-screen-replay-20261024-01');
if(fs.existsSync(out))throw Error('Preserve screen diagnostic');assert.equal(meta.globalPolicy,true);assert.equal(update.update,1);
const sim=P.setup(),before=I.collect(['work/probe-global-policy-screen.cjs']),proposals=[];
for(const step of [.1,.3]){const c=update.candidates.find(c=>c.step===step);assert.ok(c&&!c.aggregate);
  proposals.push({id:`positive:${step}`,weights:c.weights,screen:c.screen,recordedPhysicalOutcome:false});
  proposals.push({id:`negative:${step}`,weights:c.weights.map((v,i)=>Math.max(-8,Math.min(8,2*meta.genome.policyWeights[i]-v))),screen:null,recordedPhysicalOutcome:false});}
function run(weights,headingOffsetRad){const base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}},genome=F.cloneGenome(meta.genome);genome.policyWeights=weights.slice();
  return outcome(F,fullRollout(base,sim.track,sim.graph,genome,{rewardRevision:meta.rewardRevision}));}
const baseline=[0,-.0025,.0025].map(headingOffsetRad=>({headingOffsetRad,result:run(meta.genome.policyWeights,headingOffsetRad)})),baselineAggregate=O.aggregate(baseline.map(r=>r.result)),cases=[];
for(const proposal of proposals){const outcomes=[0,-.0025,.0025].map(headingOffsetRad=>({headingOffsetRad,result:run(proposal.weights,headingOffsetRad)})),aggregate=O.aggregate(outcomes.map(r=>r.result));
  cases.push({...proposal,outcomes,aggregate});console.log('GLOBAL_SCREEN_CASE '+JSON.stringify({id:proposal.id,aggregate,outcomes}));}
const best=cases.filter(c=>c.aggregate.allSafe).sort((a,b)=>O.compareSafe(a.aggregate,b.aggregate))[0]??null,
  report={format:'private-global-policy-screen-physical-diagnostic-v1',passed:true,learningSucceeded:Boolean(best&&best.aggregate.minimumLaps>=2),baseline,baselineAggregate,cases,bestSafe:best,
    sourceHashes:before,inputHashes:{metadata:I.sha(fs.readFileSync(metaFile)),update:I.sha(fs.readFileSync(updateFile))},
    boundary:'Four bounded gradient directions are replayed from the actual global parent. Positive steps were statistically rejected; negative steps are antithetic diagnostic proposals with no assigned KL. This is not a new training generation or a proof that a surrogate filter is wrong. No route, time or desired action controls; current training remains untouched.'};
assert.deepEqual(before,I.collect(['work/probe-global-policy-screen.cjs']));fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log('GLOBAL_SCREEN_RESULT '+JSON.stringify({passed:true,learningSucceeded:report.learningSucceeded,baselineAggregate,bestSafe:best?.aggregate??null,
  report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
