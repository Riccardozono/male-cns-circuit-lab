'use strict';
// Exact clean-model single-agent replay. Read-only, from line, real MaleCNS
// controls, sensors, state-head and physics; never feeds diagnostics to training.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/statehead-verified-postlap-replay-20261020');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing replay report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(selected.file);
  if(modelSha!==selected.modelSha256)throw Error('Selected verified model checksum changed');
  const env=Model.createFromLoaded(loaded,{id:0}),rows=[];let lastBucket=-1,state=null,controls=0,priorLaps=0;
  while(controls<12000){
    state=env.step();controls++;const car=state.car,meters=state.bestProgress/(car.pixelsPerMeter||1),bucket=Math.floor(meters/25);
    if(bucket!==lastBucket&&meters>=6400){
      lastBucket=bucket;const head=env.stateHeadSnapshot();
      rows.push({progressM:meters,timeS:state.totalSimulationSeconds,laps:state.laps,speedKmh:car.vehicle.speedMps*3.6,
        x:car.x,y:car.y,heading:car.heading,outputs:car.outputs.slice(),gate:head.gate,headFeatures:head.features,
        sensorVector:car.sensorVector.slice(),longitudinalAcceleration:car.longitudinalAcceleration,lateralG:car.lateralG,
        reason:state.reason||null});
    }
    if(state.laps!==priorLaps){priorLaps=state.laps;const car=state.car,head=env.stateHeadSnapshot();rows.push({event:'lap-change',progressM:state.bestProgress/(car.pixelsPerMeter||1),timeS:state.totalSimulationSeconds,laps:state.laps,speedKmh:car.vehicle.speedMps*3.6,outputs:car.outputs.slice(),gate:head.gate,reason:state.reason||null});}
    if(state.complete)break;
  }
  const fields=['bestProgress','fitness','laps','reason','totalSimulationSeconds'];
  const observed={bestProgress:state?.bestProgress,fitness:state?.fitness,laps:state?.laps,reason:state?.reason,totalSimulationSeconds:state?.totalSimulationSeconds,complete:state?.complete,lapTimes:state?.lapTimes};
  const expected=selected.expected,expectedMatches=state?.complete===true&&fields.every(k=>observed[k]===expected[k])&&JSON.stringify(observed.lapTimes)===JSON.stringify(expected.lapTimes);
  if(!expectedMatches)throw Error('Actual replay did not exactly match the protected complete baseline');
  const report={format:'male-cns-verified-statehead-postlap-replay-v1',appVersion:'5.6.0',passed:true,model:{family:selected.family,sha256:modelSha,file:selected.file,proofFile:selected.proofFile,nodeVersion:process.versions.node},method:'One actual deterministic from-line replay through the validated native CUDA runtime. Samples are telemetry only; they are not actions, rewards, targets or training observations.',expected,observed,expectedMatches,controlSteps:controls,trace:rows,sourceUnchanged:sha(selected.file)===modelSha,boundary:'Confirms the selected clean model’s exact one-lap parent result and records observed controls after the finish line. A single seed/replay does not prove two laps or generalization.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_POSTLAP_REPLAY '+JSON.stringify({passed:report.passed,expectedMatches,modelSha256:modelSha,observed,trace:rows.map(r=>({progressM:+r.progressM?.toFixed(2),timeS:+r.timeS?.toFixed(2),laps:r.laps,speedKmh:+r.speedKmh?.toFixed(2),outputs:r.outputs?.map(v=>+v.toFixed(3)),gate:+r.gate?.toFixed(4),reason:r.reason,event:r.event})),output:path.join(out,'report.json')}));
}
try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}finally{Model.closeCuda();}
