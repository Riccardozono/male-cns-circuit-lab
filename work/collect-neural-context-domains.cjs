'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),
  P=require('./physical-rollout-pool.cjs'),B=require('./neural-context-bank.cjs'),X=require('./neural-exploration-ar1.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  proofFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-proof-20261024-01/report.json'),proof=JSON.parse(fs.readFileSync(proofFile,'utf8')),
  checkpointFile=path.join(path.dirname(proofFile),'checkpoint-snapshot.private.json'),checkpointBytes=fs.readFileSync(checkpointFile),c=JSON.parse(checkpointBytes),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-domains-20261024-01');
if(fs.existsSync(out))throw Error('Preserve domain observations');assert.equal(proof.passed,true);assert.equal(I.sha(checkpointBytes),proof.checkpointSha256);
const sim=P.setup(),best=c.arms.find(a=>a.name===proof.bestArm).bestSafe.spec,trainingOffsets=[0,-.0025,.0025],heldOutOffsets=[-.005,.005],records=[],training=[];
function run(headingOffsetRad,spec,collect){let first=null,count=0,maxGate=0,maxMemory=0,controls=0;const rows=[],base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}},
  r=fullRollout(B.wrap(base,sim.graph,[...c.heads,spec]),sim.track,sim.graph,c.genome,{rewardRevision:c.revision,onControl(car,tick){
    const gate=car.brain.contextBankGates[1],memory=car.brain.contextBankMemories[1];maxGate=Math.max(maxGate,gate);maxMemory=Math.max(maxMemory,memory);
    if(gate>0){count++;if(first===null)first={control:controls,tick,progressM:car.bestProgress};}
    if(collect)rows.push({control:controls,tick,features:Array.from(car.brain.policyFeatures),commands:car.slowOutputs.slice(),progressM:car.bestProgress,speedMps:car.vehicle.speedMps,
      oldSecondGate:gate,oldSecondResponse:X.scale(car.brain.policyFeatures,best.context).response});controls++;
  }});
  return {outcome:outcome(F,r),stats:{controls,positiveGateControls:count,firstPositiveGate:first,maxGate,maxMemory},rows};}
for(const offset of [...trainingOffsets,...heldOutOffsets]){
  const isTraining=trainingOffsets.includes(offset),parent=run(offset,{...best,weights:[0,0]},isTraining),learned=run(offset,best,false),
    expected=offset===0?proof.best.outcome:proof.perturbations.find(p=>p.headingOffsetRad===offset).after;
  assert.deepEqual(learned.outcome,expected);if(isTraining)training.push({headingOffsetRad:offset,baseline:parent.outcome,observations:parent.rows});
  records.push({headingOffsetRad:offset,split:isTraining?'training':'held-out-evaluation-only',parent:{outcome:parent.outcome,stats:parent.stats},learned:{outcome:learned.outcome,stats:learned.stats}});
  console.log('DOMAIN_CASE '+JSON.stringify(records.at(-1)));
}
const data={format:'private-neural-domain-observations-v1',passed:true,created:new Date().toISOString(),genome:c.genome,heads:c.heads,previousSecondHead:best,revision:c.revision,
  trainingOffsets,heldOutOffsets,training,sourceHashes:I.collect(['work/collect-neural-context-domains.cjs']),parentCheckpointSha256:I.sha(checkpointBytes),
  boundary:'Only training offsets include neural rows. Held-out offsets have diagnostic summaries only and must not enter calibration or training. All rows are actual neuronal activity; commands are identity diagnostics, never desired action labels.'},
  report={format:'private-neural-context-domain-diagnostic-v1',passed:true,created:data.created,records,trainingOffsets,heldOutOffsets,
    parentProofSha256:I.sha(fs.readFileSync(proofFile)),parentCheckpointSha256:I.sha(checkpointBytes),sourceHashes:data.sourceHashes,
    boundary:'Full native from-line replays exactly reproduce recorded outcomes. An absent gate is an observed decoder condition, not proof that a single wider gate solves learning.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'training-observations.private.json'),JSON.stringify(data,null,2),{flag:'wx'});
report.trainingObservationsSha256=I.sha(fs.readFileSync(path.join(out,'training-observations.private.json')));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log('DOMAIN_RESULT '+JSON.stringify({passed:true,trainingOffsets,heldOutOffsets,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
