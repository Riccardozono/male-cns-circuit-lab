'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('./recurrent-v3-reward-env.cjs'),I=require('./neural-research-source-identity.cjs'),
  root=path.resolve(__dirname,'..'),late=process.argv.includes('--late'),source=path.join(root,'.impeccable/review/learning-ml',late?'v3-neural-exploration-late-calibration-20261024-01':'v3-neural-exploration-calibration-20261024-01'),
  config=JSON.parse(fs.readFileSync(path.join(source,'config.private.json'),'utf8')),
  out=path.join(root,'.impeccable/review/learning-ml',late?'v3-neural-ar1-late-exploration-20261024-01':'v3-neural-ar1-exploration-20261024-01');
if(fs.existsSync(out))throw Error('Preserve previous AR1 audit');
const env=E.create(),meta=env.metadata(),sourceHashes=I.collect(['work/audit-neural-ar1-exploration.cjs']),baseline=env.evaluate(meta.genome.policyWeights),cases=[];
if(baseline.bestProgress!==meta.expected.bestProgress||baseline.fitness!==meta.expected.fitness)throw Error('Parent differs');
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'metadata.private.json'),JSON.stringify(meta),{flag:'wx'});
const profiles=late?[['late',config.ceiling]]:[['moderate',config.ceiling],['wide',[.12,.3]]],seeds=late?[20261024,20365753,20470482,20575211]:[20261024,20365753];
for(const [mode,ceiling]of profiles)for(const seed of seeds)for(const sign of [1,-1]){
  const exploration={...config,ceiling},record=env.episode({seed,sign,exploration,safetyCost:2000}),rows=record.chunks.flatMap(c=>c.rows),file=`episode-${cases.length+1}.private.json`;
  fs.writeFileSync(path.join(out,file),JSON.stringify(record),{flag:'wx'});
  cases.push({mode,seed,sign,file,sha256:I.sha(fs.readFileSync(path.join(out,file))),result:record.result,controls:record.controls,
    gateActiveControls:rows.filter(r=>r.noiseGate>.1).length,maxGate:Math.max(...rows.map(r=>r.noiseGate)),
    positiveThrottleControls:rows.filter(r=>r.commands[1]>0).length,trainingReward:record.trainingReward,actionTraceSha256:record.actionTraceSha256});
  console.log('NEURAL_AR1_CASE '+JSON.stringify(cases.at(-1)));
}
const advantages=cases.flatMap(c=>JSON.parse(fs.readFileSync(path.join(out,c.file),'utf8')).chunks.flatMap(c=>c.rows.map(()=>1))),
  initialScore=env.rescore(meta.genome.policyWeights,advantages),
  report={format:'neural-ar1-exploration-audit-v1',passed:initialScore.meanGaussianKL===0&&JSON.stringify(sourceHashes)===JSON.stringify(I.collect(['work/audit-neural-ar1-exploration.cjs'])),
    learningSucceeded:false,created:new Date().toISOString(),parentSha256:meta.parentSha256,baseline,cases,initialScore,
    groups:profiles.map(([mode])=>{const r=cases.filter(c=>c.mode===mode);return {mode,safe:r.filter(c=>c.result.safe).length,maxProgress:Math.max(...r.map(c=>c.result.bestProgress)),maxSafeProgress:Math.max(0,...r.filter(c=>c.result.safe).map(c=>c.result.bestProgress)),laps:r.map(c=>c.result.laps)};}),
    integrity:{sourceHashes,calibrationReportSha256:I.sha(fs.readFileSync(path.join(source,'report.json')))},
    boundary:'Actual complete stochastic from-line episodes. Variance depends only on real neuronal activity; AR1 conditional means depend on sampled latent-action history. Innovations are centred Gaussian, not a forced throttle/steering correction. These episodes do not constitute learned deterministic policies or normal app generations.'};
if(!report.passed)throw Error('AR1 sampling/likelihood identity failed');fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));console.log('NEURAL_AR1_RESULT '+JSON.stringify({passed:true,groups:report.groups,initialScore,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
