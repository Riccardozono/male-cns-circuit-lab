'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),
  P=require('./physical-rollout-pool.cjs'),B=require('./neural-context-bank.cjs'),X=require('./neural-exploration-ar1.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  dataFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-domains-20261024-01/training-observations.private.json'),data=JSON.parse(fs.readFileSync(dataFile,'utf8')),
  configFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-calibration-20261024-01/config.private.json'),context=JSON.parse(fs.readFileSync(configFile,'utf8')),
  calibrationFile=path.join(path.dirname(configFile),'report.json'),calibration=JSON.parse(fs.readFileSync(calibrationFile,'utf8')),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-preflight-20261024-01');
if(fs.existsSync(out))throw Error('Preserve domain preflight');assert.equal(data.passed,true);assert.equal(calibration.passed,true);
assert.equal(I.sha(fs.readFileSync(dataFile)),calibration.trainingObservationsSha256);assert.deepEqual(context,calibration.context);
const sim=P.setup(),cases=[];
function run(domain,weights){let controls=0,protectedControls=0,maxGate=0,positive=0,error=0;const reference=calibration.profiles.find(p=>p.headingOffsetRad===domain.headingOffsetRad),
  base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=domain.headingOffsetRad;return car;}},
  r=fullRollout(B.wrap(base,sim.graph,[...data.heads,{context,weights,retention:.9}]),sim.track,sim.graph,data.genome,{rewardRevision:data.revision,onControl(car,tick){
    const gate=car.brain.contextBankGates[1];maxGate=Math.max(maxGate,gate);positive+=gate>0;
    if(weights.every(v=>v===0)){
      const row=domain.observations[controls];assert.equal(tick,row.tick);assert.deepEqual(car.slowOutputs,row.commands);assert.deepEqual(Array.from(car.brain.policyFeatures),row.features);
      error=Math.max(error,Math.abs(X.scale(car.brain.policyFeatures,context).response-reference.profile[controls].response));
    }
    if(controls<reference.protectedControls){assert.equal(gate,0);assert.deepEqual(car.slowOutputs,domain.observations[controls].commands);protectedControls++;}
    controls++;
  }});
  assert.ok(error<1e-10);return {result:outcome(F,r),controls,protectedControls,positiveGateControls:positive,maxGate,maximumPythonJsResponseError:error};
}
for(const domain of data.training){const zero=run(domain,[0,0]),warm=run(domain,data.previousSecondHead.weights);assert.deepEqual(zero.result,domain.baseline);
  cases.push({headingOffsetRad:domain.headingOffsetRad,zero,warm});console.log('DOMAIN_PREFLIGHT_CASE '+JSON.stringify(cases.at(-1)));}
const report={format:'private-neural-domain-preflight-v1',passed:true,created:new Date().toISOString(),cases,context,trainingOffsets:data.trainingOffsets,heldOutOffsets:data.heldOutOffsets,
  trainingDataSha256:I.sha(fs.readFileSync(dataFile)),calibrationSha256:I.sha(fs.readFileSync(calibrationFile)),sourceHashes:I.collect(['work/preflight-neural-domain-context.cjs']),
  boundary:'Real from-line zero-head identity on all three training starts, Python/JS contrast agreement, protected native command prefixes. Warm weights are an exploratory transfer, not proof of generalization. Held-out trajectories were not read.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log('DOMAIN_PREFLIGHT_RESULT '+JSON.stringify({passed:true,cases,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
