'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('./recurrent-v3-reward-env.cjs'),I=require('./neural-research-source-identity.cjs'),
  root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/v3-recurrent-exploration-scale-20261024-01');
if(fs.existsSync(out))throw Error('Preserve previous exploration audit');
const env=E.create(),meta=env.metadata(),sourceHashes=I.collect(['work/audit-recurrent-v3-exploration.cjs']),
  baseline=env.evaluate(meta.genome.policyWeights),seeds=[20261024,20365753],scales=[[.003,.016],[.0015,.008]],cases=[],start=Date.now();
if(baseline.bestProgress!==meta.expected.bestProgress||baseline.fitness!==meta.expected.fitness||baseline.ticks!==meta.expected.ticks)throw Error('Parent differs');
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'metadata.private.json'),JSON.stringify(meta),{flag:'wx'});
for(const std of scales)for(const seed of seeds)for(const sign of [1,-1]){
  const r=env.episode({std,seed,sign,safetyCost:2000,chunkSize:32}),file=`episode-${cases.length+1}.private.json`;
  fs.writeFileSync(path.join(out,file),JSON.stringify(r),{flag:'wx'});
  cases.push({file,sha256:I.sha(fs.readFileSync(path.join(out,file))),std,seed,sign,result:r.result,controls:r.controls,
    trainingReward:r.trainingReward,extraSafetyCost:r.extraSafetyCost,actionTraceSha256:r.actionTraceSha256});
  console.log('RECURRENT_NOISE '+JSON.stringify(cases.at(-1)));
}
const sourceStable=JSON.stringify(I.collect(['work/audit-recurrent-v3-exploration.cjs']))===JSON.stringify(sourceHashes),
  savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',saveUnchanged=I.sha(fs.readFileSync(savePath))==='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
  groups=scales.map(std=>{const rows=cases.filter(c=>JSON.stringify(c.std)===JSON.stringify(std)),values=rows.map(c=>c.result.bestProgress).sort((a,b)=>a-b);
    return {std,episodes:rows.length,safe:rows.filter(c=>c.result.safe).length,minProgress:values[0],medianProgress:(values[1]+values[2])/2,maxProgress:values.at(-1),laps:rows.map(c=>c.result.laps)};}),
  report={format:'v3-recurrent-exploration-scale-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:sourceStable&&saveUnchanged,
    learningSucceeded:false,baseline,parentSha256:meta.parentSha256,cases,groups,
    method:'Same deterministic learned parent, normal from-line physical episodes; paired seeds/signs and two smaller fixed Gaussian logit standard deviations. No learned weight update, position/route input or inherited progress. New trajectories are stored separately for inspectable possible later learning.',
    integrity:{sourceHashes,sourceStable,saveUnchanged},wallSeconds:(Date.now()-start)/1000};
if(!report.passed)throw Error('Exploration audit integrity failed');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
console.log('RECURRENT_NOISE_RESULT '+JSON.stringify({passed:true,groups,baseline,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
