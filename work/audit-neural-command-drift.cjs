'use strict';
// Read-only counterfactual arithmetic on ACTUAL recorded neuronal states.
// These predictions are not driving examples, target actions or new rollouts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),R=require('./neural-projected-residual.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const tag=process.argv[2]||'neuronal-command-3809-asymmetric-td3',step=Number(process.argv[3]||4000);
if(!/^[a-z0-9-]+$/.test(tag)||!Number.isInteger(step)||step<1000||step>100000||process.versions.node!=='24.19.0')throw Error('Bounded recorded experiment and pinned runtime required');
const out=path.join(base,tag),initialFile=path.join(out,'initial-actor.json'),currentFile=path.join(out,`actor-${String(step).padStart(7,'0')}.json`),datasetFile=path.join(base,'neuronal-command-3809-asymmetric-data/report.json'),dataset=JSON.parse(fs.readFileSync(datasetFile,'utf8'));
const actors=[initialFile,currentFile].map(file=>JSON.parse(fs.readFileSync(file,'utf8')));actors.forEach(R.validateActor);
const stats=[[],[]],early=[[],[]];let observations=0;
for(const row of dataset.records){
  if(!row.rollout.dataComplete||sha(row.rollout.dataFile)!==row.dataSha256)throw Error('Exact complete actual data required');
  const bytes=fs.readFileSync(row.rollout.dataFile),data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
  if(data.length!==row.rollout.rows*1118)throw Error('Binary row accounting differs');
  for(let i=0;i<row.rollout.rows;i++){
    const neural=Array.from(data.subarray(i*1118,i*1118+521)),before=R.forward(actors[0],neural),after=R.forward(actors[1],neural);
    for(let axis=0;axis<2;axis++){const difference=after[axis]-before[axis];stats[axis].push(difference);if(i<20)early[axis].push(difference);}
    observations++;
  }
}
function describe(values){const a=values.map(Math.abs).sort((x,y)=>x-y),n=a.length;return {n,mean:values.reduce((s,v)=>s+v,0)/n,rms:Math.sqrt(values.reduce((s,v)=>s+v*v,0)/n),absMedian:a[Math.floor(n*.5)],absP95:a[Math.floor(n*.95)],absMax:a[n-1]};}
const report={passed:true,steps:step,actualRecordedObservations:observations,initialActorSha256:sha(initialFile),currentActorSha256:sha(currentFile),datasetReportSha256:sha(datasetFile),all:{steeringResidual:describe(stats[0]),longitudinalResidual:describe(stats[1])},first20ControlsOfEachEpisode:{steeringResidual:describe(early[0]),longitudinalResidual:describe(early[1])},
  sourceSha256:sha(__filename),boundary:'Scalar native numeric actor predictions on the same actual recorded neuronal states. Differences are not ideal actions, executed new trajectories, evidence of a universal sensitivity defect or proof of the cause of training failure. No controller, replay or open app is changed.'};
const file=path.join(out,`drift-${step}.json`);fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
