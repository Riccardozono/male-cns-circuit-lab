'use strict';
// Isolated V3/Monza diagnostic. At the first lap boundary only, clear the
// recurrent neural/controller state while preserving the car, track, weights,
// physics, sensors and reward. The pre-boundary trace is checked against the
// protected telemetry; the experiment is never promoted or written to a save.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Parent=require('./neural-frontier-chain.cjs');
const State=require('./neural-statehead.cjs');
const Live=require('./neural-command-live-cuda.cjs');

const root=path.resolve(__dirname,'..');
const telemetryFile=path.join(root,'.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/report.json');
const output=path.join(root,'.impeccable/review/learning-ml/statehead-postlap-neural-reset-20261023-01');
const MAX_CONTROLS=22000;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');

function equalArray(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>value===b[index]);}
function summary(state,controls,trackLength){
  const car=state.car;
  return {complete:state.complete===true,progressM:state.bestProgress,laps:car.laps,lapTimes:car.lapTimes.slice(),
    fitness:car.fitness,reason:car.alive?'censored at diagnostic control limit':car.reason,
    controls,totalSimulationSeconds:state.totalSimulationSeconds,alongM:state.bestProgress-Math.max(0,car.laps||0)*trackLength,
    speedMps:car.vehicle?.speedMps??0,outputs:car.outputs.slice()};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(output))throw Error('Refusing to overwrite an existing diagnostic report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file);
  const telemetry=JSON.parse(fs.readFileSync(telemetryFile,'utf8'));
  if(loaded.sha256!==telemetry.modelSha256||selected.actionTraceSha256!==telemetry.selectedActionTraceSha256||
    telemetry.observedActionTraceSha256!==selected.actionTraceSha256||!Array.isArray(telemetry.segments?.lap1)||telemetry.segments.lap1.length<10)
    throw Error('Exact protected V3/Monza model and replay-verified lap telemetry required');

  const reference=JSON.parse(JSON.stringify(selected.expected));
  const samples=new Map(telemetry.segments.lap1.map(row=>[row.control,row]));
  const brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);
  let env=null,lastLap=0,resets=0,resetAtControl=null,firstLapTrace=null,firstLapControl=null;
  const trace=crypto.createHash('sha256'),checks=[];
  let state=null,controls=0,lastLog=performance.now();
  try{
    env=Live.create(loaded.modelFile,{id:0,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
      onReset:()=>{brain.reset();head.reset();},
      actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
      motorOverride:(_model,_raw,prior,car)=>{
        if(car.laps>lastLap){
          // The lap-completing control has already occurred. Reset the only
          // diagnostic treatment at the next control decision, never mid-step.
          lastLap=car.laps;resets++;resetAtControl=controls+1;
          brain.reset();head.reset();car.brain=env.runtime.makeBrain(env.graph);
          return prior.slice();
        }
        return head.compose(brain.compose(prior),loaded.data.weights);
      }});
    while(controls<MAX_CONTROLS&&!state?.complete){
      state=env.step();controls++;
      const car=env.currentCar(),line=JSON.stringify([state.bestProgress,state.totalSimulationSeconds,car.outputs])+'\n';
      trace.update(line);
      if(firstLapControl===null&&car.laps>=1){firstLapControl=controls;firstLapTrace=trace.copy().digest('hex');}
      const expected=samples.get(controls);
      if(expected){
        const features=head.features();
        const ok=state.bestProgress===expected.progress&&car.outputs.every((value,i)=>value===expected.outputs[i])&&
          (car.vehicle?.speedMps??0)===expected.speedMps&&equalArray(features,expected.features);
        checks.push({control:controls,ok});
        if(!ok)throw Error(`Protected pre-reset telemetry mismatch at control ${controls}`);
      }
      if(performance.now()-lastLog>20000){
        lastLog=performance.now();
        console.log('POSTLAP_RESET_PROGRESS '+JSON.stringify({controls,progressM:state.bestProgress,laps:car.laps,
          alongM:state.bestProgress-Math.max(0,car.laps||0)*telemetry.trackLength,speedMps:car.vehicle?.speedMps??0,resets}));
      }
    }
    const final=summary(state,controls,telemetry.trackLength),gpu=Model.stats();
    const report={format:'male-cns-v3-postlap-neural-state-reset-v1',appVersion:'5.6.0',passed:
        checks.length===telemetry.segments.lap1.length&&checks.every(row=>row.ok)&&firstLapControl!==null&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0,
      learningSucceeded:final.laps>=2,model:{sha256:loaded.sha256,file:selected.file,protectedTraceSha256:selected.actionTraceSha256},
      baselineReference:{...reference,actionTraceSha256:selected.actionTraceSha256},
      treatment:{name:'reset internal neural and decoder state once at the first lap boundary',...final,
        resetCount:resets,resetAtControl,firstLapControl,preResetTraceSha256:firstLapTrace,finalTraceSha256:trace.digest('hex')},
      validation:{protectedLap1SampleCount:checks.length,protectedLap1SamplesMatched:checks.every(row=>row.ok),
        firstLapTimeMatchesReference:final.lapTimes.length>0&&final.lapTimes[0]===reference.lapTimes?.[0],
        expectedPreResetControlCount:telemetry.controls,referenceTelemetry:telemetryFile},
      gpu,method:'One exact exported V3/Monza checkpoint replay. At the next decision after lap 1, recurrent connectome activity, decoder context and the four-sample neural observation history are not all equally reset: this probe resets the connectome brain, parent decoder and projected head, while preserving car state and the live observation history. No route, sensor, reward, physics, weights, steering, throttle, brake, save, app source or package is modified. Pre-reset samples must match protected lap telemetry.',
      boundary:'Single verified V3/Monza model and seed. A diagnostic state-reset treatment, not a learned model, not a release change and not proof of general convergence.'};
    if(!report.passed)throw Error('Incomplete validation or CUDA fallback; diagnostic result is not accepted');
    fs.mkdirSync(output,{recursive:false});
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
    console.log('POSTLAP_RESET_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
      baselineReference:report.baselineReference,treatment:report.treatment,validation:report.validation,gpu:report.gpu,
      report:path.join(output,'report.json')}));
  }finally{env?.close?.();Model.closeCuda();}
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
