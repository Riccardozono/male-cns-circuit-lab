'use strict';
// Analytic diagnostic on real recorded neuronal inputs, not a driving policy.
const fs=require('node:fs'),path=require('node:path'),Head=require('./neural-json-head.cjs'),Model=require('./neural-grown-model.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),file=path.join(base,'retained-native-model/model.malecns-neural-grown.json'),loaded=Model.load(file),rows=JSON.parse(fs.readFileSync(path.join(base,'progressive-3652-first/stage-01/parent-actual-trace.json'),'utf8')),atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
let peak=0;const bounds=rows.map((r,i)=>{
  const obs=r.observation,actor=Head.actor(loaded.parent.model.head,obs),amplitude=Math.min(1,Math.hypot(obs[512]*2,obs[513]*2)*5);peak=Math.max(peak,amplitude);
  const fixed=atanh(obs[515])+2*amplitude*actor[1],upper=Math.tanh(fixed+2*peak),lower=Math.tanh(fixed-2*peak);
  return {control:i,progress:r.progress,seconds:r.seconds,actualGas:r.outputs[1],actualBrake:r.outputs[2],oldActorLong:actor[1],currentAuthority:amplitude,peakAuthority:peak,fixedLogit:fixed,minLongitudinal:lower,maxLongitudinal:upper,cannotReleaseBrakeEvenWithMaxResidual:upper<0};
});
const finish=rows.at(-1).seconds,last=bounds.filter(r=>r.seconds>=finish-10),blocked=last.filter(r=>r.cannotReleaseBrakeEvenWithMaxResidual),mean=(r,k)=>r.reduce((s,v)=>s+v[k],0)/r.length;
const report={modelSha256:loaded.sha256,actualTraceSha256:Head.sha(fs.readFileSync(path.join(base,'progressive-3652-first/stage-01/parent-actual-trace.json'),'utf8')),sourceSha256:Head.sha(fs.readFileSync(__filename,'utf8')),controls:rows.length,blockedControls:bounds.filter(r=>r.cannotReleaseBrakeEvenWithMaxResidual).length,
  lastTenSeconds:{controls:last.length,brakeUnreleasableControls:blocked.length,meanActualGas:mean(last,'actualGas'),meanActualBrake:mean(last,'actualBrake'),meanMaximumReachableCommand:mean(last,'maxLongitudinal'),example:last.at(-1)},
  boundary:'Analytic attainable longitudinal interval at actual frozen observed states: baseline logit +2*currentAuthority*oldActorLong +/-2*peakAuthority. This tests the residual decoder range, not brake physics or counterfactual trajectories. Does not assign an action or use a teacher. Changing learned weights earlier can change future observed states.'};
const out=path.join(base,'longitudinal-authority-audit');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
