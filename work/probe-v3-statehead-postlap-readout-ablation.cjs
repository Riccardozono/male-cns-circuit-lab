'use strict';
// Isolated post-lap ablation: preserve the MaleCNS brain and physical state,
// but switch off only the experimental state-head motor correction after lap 1.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const output=path.join(root,'.impeccable/review/learning-ml/statehead-postlap-readout-ablation-20261023-01');
const MAX_CONTROLS=12000,sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function summarize(rows){
  if(!rows.length)return {controls:0};
  const mean=key=>rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
  const steer=rows.map(row=>Math.abs(row.outputs[0])),long=rows.map(row=>row.outputs[1]-row.outputs[2]);
  return {controls:rows.length,fromM:rows[0].alongM,toM:rows.at(-1).alongM,meanSpeedMps:mean('speedMps'),
    meanAbsSteer:steer.reduce((a,b)=>a+b,0)/steer.length,meanLongitudinalCommand:long.reduce((a,b)=>a+b,0)/long.length,
    throttleOnly:rows.filter(r=>r.outputs[1]>0&&r.outputs[2]===0).length,brakeOnly:rows.filter(r=>r.outputs[2]>0&&r.outputs[1]===0).length,
    steeringSignChanges:rows.slice(1).filter((r,i)=>Math.sign(r.outputs[0])!==Math.sign(rows[i].outputs[0])).length,
    longitudinalSignChanges:rows.slice(1).filter((r,i)=>Math.sign(r.outputs[1]-r.outputs[2])!==Math.sign(rows[i].outputs[1]-rows[i].outputs[2])).length};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(output))throw Error('Refusing to overwrite an existing ablation report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(loaded.sha256!==telemetry.modelSha256||selected.actionTraceSha256!==telemetry.selectedActionTraceSha256||
    telemetry.observedActionTraceSha256!==selected.actionTraceSha256)throw Error('Protected model and exact-reference telemetry mismatch');
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data),trace=crypto.createHash('sha256');
  const samples=new Map(telemetry.segments.lap1.map(row=>[row.control,row])),rowsByLap=new Map([[0,[]],[1,[]]]),checks=[];
  let env=null,state=null,controls=0,firstLapControl=null,switchedAtControl=null,lastLog=performance.now();
  try{
    env=Live.create(loaded.modelFile,{id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
      onReset:()=>{brain.reset();head.reset();},
      actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
      motorOverride:(_model,_raw,prior,car)=>{
        const base=brain.compose(prior);
        if(car.laps>=1){if(switchedAtControl===null)switchedAtControl=controls+1;return base;}
        return head.compose(base,loaded.data.weights);
      }});
    while(controls<MAX_CONTROLS&&!state?.complete){
      state=env.step();controls++;
      const car=env.currentCar();trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,car.outputs])+'\n');
      if(firstLapControl===null&&car.laps>=1)firstLapControl=controls;
      const alongM=state.bestProgress-Math.max(0,car.laps||0)*telemetry.trackLength;
      const expected=samples.get(controls);
      if(expected){const ok=state.bestProgress===expected.progress&&car.outputs.every((v,i)=>v===expected.outputs[i])&&
        (car.vehicle?.speedMps??0)===expected.speedMps&&head.features()?.every((v,i)=>v===expected.features[i]);
        checks.push({control:controls,ok});if(!ok)throw Error(`First-lap protected sample mismatch at control ${controls}`);}
      if((car.laps===0||car.laps===1)&&alongM>=620&&alongM<=820){
        const features=head.features(),vehicle=car.vehicle||{};
        rowsByLap.get(car.laps).push({control:controls,simSeconds:state.totalSimulationSeconds,alongM,speedMps:vehicle.speedMps??0,
          outputs:car.outputs.slice(),visualSensors:car.inputs.slice(),physicsSensors:car.physicsInputs.slice(),stateHeadFeatures:features,
          rpm:vehicle.rpm??null,gear:vehicle.gear??null,longitudinalG:car.longitudinalG??null,lateralG:car.lateralG??null,
          totalG:car.totalG??null,yawRate:car.yawRate??null,slipAngle:car.slipAngle??null});
      }
      if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('POSTLAP_HEAD_ABLATION_PROGRESS '+JSON.stringify({controls,
        progressM:state.bestProgress,laps:car.laps,alongM,speedMps:car.vehicle?.speedMps??0,switchedAtControl}));}
    }
    const car=env.currentCar(),result={complete:state.complete===true,progressM:state.bestProgress,laps:car.laps,lapTimes:car.lapTimes.slice(),
      reason:car.alive?'censored at diagnostic control limit':car.reason,totalSimulationSeconds:state.totalSimulationSeconds,
      controls,alongM:state.bestProgress-Math.max(0,car.laps||0)*telemetry.trackLength,
      actionTraceSha256:trace.digest('hex')},gpu=Model.stats();
    const report={format:'male-cns-v3-statehead-postlap-readout-ablation-v1',appVersion:'5.6.0',
      passed:checks.length===telemetry.segments.lap1.length&&checks.every(row=>row.ok)&&firstLapControl!==null&&
        result.lapTimes[0]===telemetry.result.lapTimes[0]&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:result.laps>=2,model:{sha256:loaded.sha256,file:selected.file,
        protectedReferenceTraceSha256:selected.actionTraceSha256},reference:structuredClone(selected.expected),
      treatment:{name:'use parent MaleCNS decoder alone from the first post-lap control; preserve connectome and car state',
        switchedAtControl,firstLapControl,result},validation:{firstLapSampleCount:checks.length,firstLapSamplesMatched:checks.every(row=>row.ok),
        firstLapTimeMatchesReference:result.lapTimes[0]===telemetry.result.lapTimes[0],referenceTelemetry:telemetryFile},
      region:{fromM:620,toM:820,summaries:{lap1:summarize(rowsByLap.get(0)),lap2:summarize(rowsByLap.get(1))},
        rows:{lap1:rowsByLap.get(0),lap2:rowsByLap.get(1)}},gpu,
      method:'One deterministic exact-CUDA replay. Preserve the original full model through lap 1 and verify its sampled telemetry. Starting at the first decision after the finish line, disable only the research state-head motor residual and use the already active parent decoder; do not reset any neural activity, observation history, car state, physics, reward or sensors.',
      boundary:'Single model/seed/circuit; an ablation to localize the learned head contribution, not a trained or promotable model.'};
    if(!report.passed)throw Error('Validation mismatch or CUDA fallback; ablation result is rejected');
    fs.mkdirSync(output,{recursive:false});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('POSTLAP_HEAD_ABLATION_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
      treatment:{...result,switchedAtControl,firstLapControl},validation:report.validation,region:report.region.summaries,gpu,
      report:path.join(output,'report.json')}));
  }finally{env?.close?.();Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
