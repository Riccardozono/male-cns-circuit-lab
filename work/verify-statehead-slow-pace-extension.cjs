'use strict';
// One isolated replay of the verified model with the private slow-pace
// continuation rule. It writes only a diagnostic report, never a save.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const SlowPace=require('./neural-statehead-slow-pace-extension.cjs');
const Simulation=require('../.impeccable/experimental-penalty5/outputs/simulation.js');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/statehead-slow-pace-extension-20261020-02');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_CONTROLS=30000;
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Preserve existing slow-pace diagnostic report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),rules=SlowPace.install(Simulation);
  const env=Model.createFromLoaded(loaded,{id:0}),trace=crypto.createHash('sha256');
  const firstLap={hash:crypto.createHash('sha256'),controls:0};
  let state=null,controls=0,firstSlowAt=null;
  while(controls<MAX_CONTROLS&&!env.state().complete){
    state=env.step();controls++;
    const row=JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n';
    trace.update(row);
    if(state.laps===0){firstLap.hash.update(row);firstLap.controls++;}
    if(firstSlowAt===null&&state.car.stateHeadSlowProgressResumes>0)
      firstSlowAt={control:controls,simulationSeconds:state.totalSimulationSeconds,progress:state.bestProgress,laps:state.laps};
  }
  const car=env.currentCar(),result={progress:state?.bestProgress,laps:state?.laps,lapTimes:state?.lapTimes,
    fitness:state?.fitness,reason:state?.reason,simulationSeconds:state?.totalSimulationSeconds,
    complete:state?.complete,censored:!state?.complete,controls,firstSlowAt,
    slowProgressResumes:car.stateHeadSlowProgressResumes||0,slowProgressPenalty:car.rewardBreakdown.penalties.slowProgress,
    noLapPenalty:car.rewardBreakdown.penalties.noLap,rewardBreakdown:car.rewardBreakdown,
    terminalSpeedMps:car.vehicle?.speedMps??null,terminalOutputs:car.outputs.slice(),
    actionTraceSha256:trace.digest('hex'),
    partialFirstLapTraceSha256:firstLap.hash.digest('hex'),firstLapControls:firstLap.controls};
  const report={format:'male-cns-statehead-slow-pace-extension-v1',appVersion:'5.6.0',
    completed:result.complete,twoLapGoalMet:result.complete&&result.laps>=2,passed:result.complete&&result.laps>=2,
    modelSha256:loaded.sha256,selectedExpected:structuredClone(selected.expected),slowPaceRules:rules,result,
    boundary:'Single deterministic sample only. A completed two-lap result is not evidence of population learning or generalization.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_SLOW_PACE_EXTENSION_RESULT '+JSON.stringify({passed:report.passed,completed:report.completed,controls,laps:result.laps,
    progress:result.progress,reason:result.reason,slowProgressResumes:result.slowProgressResumes,
    slowProgressPenalty:result.slowProgressPenalty,firstSlowAt,resultFile:path.join(out,'report.json')}));
  if(!result.complete)process.exitCode=2;
}
try{main();}catch(error){console.error(error.stack||error);process.exitCode=1;}finally{Model.closeCuda();}
