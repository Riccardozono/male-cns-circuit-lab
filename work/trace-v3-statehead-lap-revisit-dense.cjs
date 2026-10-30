'use strict';
// Exact protected V3/Monza replay with dense telemetry only near the first
// variant on laps 1 and 2. No model, save, reward, route or physics is changed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const output=path.join(root,'.impeccable/review/learning-ml/statehead-dense-lap-revisit-20261023-01');
const MAX_CONTROLS=12000,sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function summarize(rows){
  if(!rows.length)return {controls:0};
  const mean=key=>rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
  const steer=rows.map(row=>Math.abs(row.outputs[0])),long=rows.map(row=>row.outputs[1]-row.outputs[2]);
  return {controls:rows.length,fromM:rows[0].alongM,toM:rows.at(-1).alongM,
    meanSpeedMps:mean('speedMps'),meanAbsSteer:steer.reduce((a,b)=>a+b,0)/steer.length,
    meanLongitudinalCommand:long.reduce((a,b)=>a+b,0)/long.length,
    throttleOnly:rows.filter(row=>row.outputs[1]>0&&row.outputs[2]===0).length,
    brakeOnly:rows.filter(row=>row.outputs[2]>0&&row.outputs[1]===0).length,
    zeroLongitudinal:rows.filter(row=>row.outputs[1]===0&&row.outputs[2]===0).length,
    steeringSignChanges:rows.slice(1).filter((row,i)=>Math.sign(row.outputs[0])!==Math.sign(rows[i].outputs[0])).length,
    longitudinalSignChanges:rows.slice(1).filter((row,i)=>Math.sign(row.outputs[1]-row.outputs[2])!==Math.sign(rows[i].outputs[1]-rows[i].outputs[2])).length,
    maxAbsSteer:Math.max(...steer),maxThrottle:Math.max(...rows.map(row=>row.outputs[1])),maxBrake:Math.max(...rows.map(row=>row.outputs[2]))};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(output))throw Error('Refusing to overwrite an existing trace report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),prior=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(loaded.sha256!==prior.modelSha256||selected.actionTraceSha256!==prior.selectedActionTraceSha256||
    prior.observedActionTraceSha256!==selected.actionTraceSha256)throw Error('The protected V3 model and previous exact replay no longer agree');
  const env=Model.createFromLoaded(loaded,{id:0}),trackLength=prior.trackLength,trace=crypto.createHash('sha256');
  const rowsByLap=new Map([[0,[]],[1,[]]]);let state=null,controls=0,firstLapControl=null,lastLog=performance.now();
  try{
    while(controls<MAX_CONTROLS&&!state?.complete){
      state=env.step();controls++;
      const car=env.currentCar(),line=JSON.stringify([state.bestProgress,state.totalSimulationSeconds,car.outputs])+'\n';trace.update(line);
      if(firstLapControl===null&&car.laps>=1)firstLapControl=controls;
      const alongM=state.bestProgress-Math.max(0,car.laps||0)*trackLength;
      if((car.laps===0||car.laps===1)&&alongM>=620&&alongM<=820){
        const features=env.stateHeadSnapshot();
        const vehicle=car.vehicle||{};
        rowsByLap.get(car.laps).push({control:controls,simSeconds:state.totalSimulationSeconds,lap:car.laps,alongM,
          x:car.x,y:car.y,heading:car.heading,speedMps:vehicle.speedMps??0,outputs:car.outputs.slice(),
          visualSensors:car.inputs.slice(),physicsSensors:car.physicsInputs.slice(),stateHeadFeatures:features.features,
          brakeC:vehicle.brakeC??null,tyreC:vehicle.tyreC??null,rpm:vehicle.rpm??null,gear:vehicle.gear??null,
          frontSlip:vehicle.frontSlip??null,rearSlip:vehicle.rearSlip??null,longitudinalG:car.longitudinalG??null,
          lateralG:car.lateralG??null,totalG:car.totalG??null,yawRate:car.yawRate??null,slipAngle:car.slipAngle??null});
      }
      if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('DENSE_LAP_TRACE_PROGRESS '+JSON.stringify({controls,
        progressM:state.bestProgress,laps:car.laps,alongM,speedMps:car.vehicle?.speedMps??0}));}
    }
    const actionTraceSha256=trace.digest('hex'),result={complete:state.complete===true,progressM:state.bestProgress,
      laps:env.currentCar().laps,lapTimes:env.currentCar().lapTimes.slice(),reason:env.currentCar().reason,
      totalSimulationSeconds:state.totalSimulationSeconds,controls};
    const checks={actionTraceMatches:selected.actionTraceSha256===actionTraceSha256,
      exactExpectedResult:result.complete===selected.expected.complete&&result.progressM===selected.expected.bestProgress&&
        result.laps===selected.expected.laps&&result.reason===selected.expected.reason&&
        result.totalSimulationSeconds===selected.expected.totalSimulationSeconds&&
        JSON.stringify(result.lapTimes)===JSON.stringify(selected.expected.lapTimes),
      firstLapTelemetryMatch:firstLapControl!==null&&result.lapTimes[0]===prior.result.lapTimes[0]};
    const gpu=Model.stats(),report={format:'male-cns-v3-statehead-dense-lap-revisit-v1',appVersion:'5.6.0',
      passed:Object.values(checks).every(Boolean)&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:result.laps>=2,model:{sha256:loaded.sha256,file:selected.file,
        protectedTraceSha256:selected.actionTraceSha256},result:{...result,actionTraceSha256},
      checks,firstLapControl,trackLengthM:trackLength,
      region:{fromM:620,toM:820,decisionRows:{lap1:rowsByLap.get(0).length,lap2:rowsByLap.get(1).length},
        summaries:{lap1:summarize(rowsByLap.get(0)),lap2:summarize(rowsByLap.get(1))},rows:{lap1:rowsByLap.get(0),lap2:rowsByLap.get(1)}},
      gpu,method:'Deterministic exact-CUDA replay of the protected state-head V3/Monza model. Record every decision in the 620–820 m segment of lap 1 and lap 2; all other controls are used only for the full action-trace check. No reset, action filtering, route, label, reward, physics, save or model change.',
      boundary:'Single model, seed and circuit. Dense telemetry can locate control changes; it does not establish causality or general learning.'};
    if(!report.passed)throw Error('Exact trace/result, lap telemetry or CUDA validation failed');
    fs.mkdirSync(output,{recursive:false});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('DENSE_LAP_TRACE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
      result:report.result,checks:report.checks,summaries:report.region.summaries,rows:report.region.decisionRows,gpu,
      report:path.join(output,'report.json')}));
  }finally{env.close?.();Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
