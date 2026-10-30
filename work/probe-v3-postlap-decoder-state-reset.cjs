'use strict';
// Isolated diagnostic: reset only the experimental decoder context at lap 1.
// Keep the real connectome activity, car, sensors, weights, rewards and physics.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');
const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const output=path.join(root,'.impeccable/review/learning-ml/statehead-postlap-decoder-reset-20261023-01');
const MAX_CONTROLS=22000,sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function summary(state,controls,length){const car=state.car;return {complete:state.complete===true,progressM:state.bestProgress,
  laps:car.laps,lapTimes:car.lapTimes.slice(),fitness:car.fitness,reason:car.alive?'censored at diagnostic control limit':car.reason,
  controls,totalSimulationSeconds:state.totalSimulationSeconds,alongM:state.bestProgress-Math.max(0,car.laps||0)*length,
  speedMps:car.vehicle?.speedMps??0,outputs:car.outputs.slice()};}
function same(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(output))throw Error('Refusing to overwrite an existing diagnostic report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(loaded.sha256!==telemetry.modelSha256||selected.actionTraceSha256!==telemetry.selectedActionTraceSha256||
    telemetry.observedActionTraceSha256!==selected.actionTraceSha256||!Array.isArray(telemetry.segments?.lap1)||telemetry.segments.lap1.length<10)
    throw Error('Exact protected V3/Monza model and replay-verified lap telemetry required');
  const expected=structuredClone(selected.expected),samples=new Map(telemetry.segments.lap1.map(row=>[row.control,row]));
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);let env=null,lastLap=0,resets=0,resetAtControl=null;
  const trace=crypto.createHash('sha256'),checks=[];let state=null,controls=0,firstLapControl=null,lastLog=performance.now();
  try{
    env=Live.create(loaded.modelFile,{id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
      onReset:()=>{brain.reset();head.reset();},
      actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
      motorOverride:(_model,_raw,prior,car)=>{
        if(car.laps>lastLap){
          lastLap=car.laps;resets++;resetAtControl=controls+1;brain.reset();head.reset();
          // Do not inject a motor correction on the boundary decision.
          return prior.slice();
        }
        return head.compose(brain.compose(prior),loaded.data.weights);
      }});
    while(controls<MAX_CONTROLS&&!state?.complete){
      state=env.step();controls++;
      const car=env.currentCar();trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,car.outputs])+'\n');
      if(firstLapControl===null&&car.laps>=1)firstLapControl=controls;
      const reference=samples.get(controls);
      if(reference){const ok=state.bestProgress===reference.progress&&car.outputs.every((v,i)=>v===reference.outputs[i])&&
        (car.vehicle?.speedMps??0)===reference.speedMps&&same(head.features(),reference.features);
        checks.push({control:controls,ok});if(!ok)throw Error(`Protected lap-1 telemetry mismatch at control ${controls}`);}
      if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('POSTLAP_DECODER_RESET_PROGRESS '+JSON.stringify({controls,
        progressM:state.bestProgress,laps:car.laps,alongM:state.bestProgress-Math.max(0,car.laps||0)*telemetry.trackLength,
        speedMps:car.vehicle?.speedMps??0,resets}));}
    }
    const result=summary(state,controls,telemetry.trackLength),gpu=Model.stats();
    const report={format:'male-cns-v3-postlap-decoder-reset-v1',appVersion:'5.6.0',passed:
        checks.length===telemetry.segments.lap1.length&&checks.every(r=>r.ok)&&firstLapControl!==null&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:result.laps>=2,model:{sha256:loaded.sha256,file:selected.file,protectedTraceSha256:selected.actionTraceSha256},
      baselineReference:{...expected,actionTraceSha256:selected.actionTraceSha256},
      treatment:{name:'reset parent decoder and projected readout context at first lap boundary; retain connectome activity',...result,
        resetCount:resets,resetAtControl,firstLapControl,traceSha256:trace.digest('hex')},
      validation:{protectedLap1SampleCount:checks.length,protectedLap1SamplesMatched:checks.every(r=>r.ok),
        firstLapTimeMatchesReference:result.lapTimes.length>0&&result.lapTimes[0]===expected.lapTimes?.[0],
        referenceTelemetry:telemetryFile},gpu,
      method:'One exact exported V3/Monza replay. At the first post-lap decision, reset only the experimental parent decoder memory and projected state-head gate; preserve the MaleCNS connectome brain activity and all car state. The first boundary action uses the uncorrected parent output. No route, sensor, reward, physics, weight, save, app source or package changes.',
      boundary:'Single verified V3/Monza model and seed. Diagnostic decoder-state treatment, not a trained model or proof of general learning.'};
    if(!report.passed)throw Error('Incomplete reference checks or CUDA fallback; result is not accepted');
    fs.mkdirSync(output,{recursive:false});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('POSTLAP_DECODER_RESET_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
      treatment:report.treatment,validation:report.validation,gpu,report:path.join(output,'report.json')}));
  }finally{env?.close?.();Model.closeCuda();}
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
