'use strict';
// Isolated actuator-lag probe after lap 1; never changes the saved model/app.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs'),Cuda=require('./neural-statehead-cuda-runtime.cjs'),
  Parent=require('./neural-frontier-chain.cjs'),Head=require('./neural-statehead.cjs'),Live=require('./neural-command-live-cuda.cjs'),Safety=require('./neural-statehead-cuda-safety.cjs');
const root=path.resolve(__dirname,'..'),sha=v=>crypto.createHash('sha256').update(v).digest('hex'),
  sourceReport=path.join(root,'.impeccable/review/neural-sacl/statehead-cma-risk-adjusted-continue-20261022-01/report.json'),
  proofFile=path.join(root,'.impeccable/review/neural-sacl/statehead-cma-risk-adjusted-continue-20261022-01/replay-verify/verification.json'),
  memoryFile=path.join(root,'.impeccable/review/neural-sacl/statehead-lap-memory-reset-ab-20261022-01/report.json'),
  brakeFile=path.join(root,'.impeccable/review/neural-sacl/statehead-postlap-brake-release-20261022-01/report.json'),
  out=path.join(root,'.impeccable/review/neural-sacl/statehead-postlap-actuator-smoothing-ab-20261022-01'),
  saveFile='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',MAX_CONTROLS=16000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function exclusive(commands){
  const steering=clamp(commands[0],-1,1);let throttle=clamp(commands[1],0,1),brake=clamp(commands[2],0,1);
  if(brake>=throttle){brake-=throttle;throttle=0;}else{throttle-=brake;brake=0;}
  return [steering,throttle,brake];
}
function makeRun(loaded,weights,id,topology,tau){
  const geneGain=loaded.data.provenance?.motorCorrectionGain??1,genes=weights.map(v=>v*geneGain),parent=loaded.core.parent,
    brain=Parent.controller(parent),head=Head.create(loaded.data),model=parent.anchor.parent.parent.parent.model,lag={tau,steps:0,previous:null};
  const env=Live.create(loaded.modelFile,{sharedTopology:topology,modelOverride:model,modelSha256:loaded.sha256,id,
    onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_m,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_m,_raw,prior,car)=>{
      const safety=loaded.data.provenance?.physicsSafety===Safety.revision?Safety.scale(car):1,
        current=head.compose(brain.compose(prior),safety===1?genes:genes.map(v=>v*safety));
      if(tau===0||car.laps===0)return current;
      if(!lag.previous)lag.previous=car.outputs.slice();
      const alpha=1-Math.exp(-.1/tau),smoothed=current.map((v,i)=>lag.previous[i]+alpha*(v-lag.previous[i])),actual=exclusive(smoothed);
      lag.previous=actual.slice();lag.steps++;return actual;
    }});
  return {env,lag};
}
function run(loaded,weights,id,topology,tau){
  const {env,lag}=makeRun(loaded,weights,id,topology,tau),trace=crypto.createHash('sha256'),first=crypto.createHash('sha256'),samples=[];
  let state=env.state(),controls=0,firstLapControls=0,firstLapTrace=null;
  while(env.currentCar().alive&&controls<MAX_CONTROLS){
    const wasFirst=env.currentCar().laps===0;state=env.step();controls++;
    const car=env.currentCar(),row=JSON.stringify([state.bestProgress,state.totalSimulationSeconds,car.outputs])+'\n';trace.update(row);
    if(wasFirst){first.update(row);firstLapControls++;}
    if(car.laps===1&&(controls%25===0||!car.alive))samples.push({control:controls,progress:state.bestProgress,speedMps:car.vehicle?.speedMps??null,
      steer:car.outputs[0],throttle:car.outputs[1],brake:car.outputs[2],gear:car.vehicle?.gear??null,position:[car.x,car.y],reason:car.reason||null});
  }
  state=env.state();firstLapTrace=first.digest('hex');
  const result={mode:tau===0?'baseline':'postlap-actuator-lag',tauSeconds:tau,id,complete:state.complete,censored:!state.complete&&controls>=MAX_CONTROLS,
    controls,progress:state.bestProgress,laps:state.laps,lapTimes:state.lapTimes,fitness:state.fitness,baseFitness:state.car.baseFitness,reason:state.reason,
    simulationSeconds:state.totalSimulationSeconds,terminalSpeedMps:state.car.vehicle?.speedMps??null,terminalOutputs:state.car.outputs.slice(),
    firstLapControls,firstLapTraceSha256:firstLapTrace,actionTraceSha256:trace.digest('hex'),smoothingSteps:lag.steps,samples};
  return {result,topology:env.topology};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(await fs.stat(out).then(()=>true,()=>false))throw Error('Refusing to overwrite an existing report');
  const sourceText=await fs.readFile(sourceReport,'utf8'),source=JSON.parse(sourceText),proofText=await fs.readFile(proofFile,'utf8'),proof=JSON.parse(proofText),
    memoryText=await fs.readFile(memoryFile,'utf8'),memory=JSON.parse(memoryText),brakeText=await fs.readFile(brakeFile,'utf8'),brake=JSON.parse(brakeText),
    saveSha=await fs.readFile(saveFile).then(sha,()=>null),selected=Model.defaultChoice(),modelSha=sha(await fs.readFile(selected.file)),weights=source.protectedChampion.weights,
    replay=proof.replays.find(r=>r.exactMatch&&r.id===0),firstLap=memory.results.find(r=>r.mode==='baseline');
  if(!source.complete||!proof.passed||!memory.passed||!brake.passed||!replay||!firstLap||!selected||modelSha!==source.settings.modelSha256||selected.modelSha256!==modelSha)throw Error('Verified parent and prior diagnostic proofs are required');
  const loaded=Model.load(selected.file);let topology=null;const results=[];
  for(const tau of [0,.15,.3]){const completed=run(loaded,weights,0,topology,tau),row=completed.result;results.push(row);if(!topology)topology=completed.topology;
    console.log('STATEHEAD_ACTUATOR_CASE '+JSON.stringify({tau,controls:row.controls,progress:row.progress,laps:row.laps,reason:row.reason,smoothingSteps:row.smoothingSteps}));}
  const gpu=Cuda.stats(),baseline=results[0],baselineExact=baseline.progress===replay.progress&&baseline.fitness===replay.fitness&&baseline.laps===replay.laps&&baseline.reason===replay.reason&&baseline.controls===replay.controls&&baseline.actionTraceSha256===replay.actionTraceSha256,
    firstLapMatches=results.every(r=>r.firstLapTraceSha256===firstLap.firstLapTraceSha256&&r.firstLapControls===firstLap.firstLapControls),modelUnchanged=sha(await fs.readFile(selected.file))===modelSha,
    saveUnchanged=saveSha!==null&&sha(await fs.readFile(saveFile))===saveSha,report={format:'male-cns-statehead-postlap-actuator-lag-ab-v1',appVersion:'5.6.0',passed:baselineExact&&firstLapMatches&&gpu.cpuFallbacks===0&&modelUnchanged&&saveUnchanged,
      learningSucceeded:results.some(r=>r.laps>=2),settings:{model:'verified V3 state-head / Monza',modelSha256:modelSha,agentId:0,weightsSha256:sha(JSON.stringify(weights)),maxControls:MAX_CONTROLS,
        intervention:'Only after first lap, apply a first-order actuator lag to steering/throttle/brake with tau 0.15 or 0.30 s; enforce the existing mutually exclusive throttle/brake actuator. No added throttle, route guidance, car reset, reward changes, or weight changes.',
        sourceReport:{path:path.relative(root,sourceReport),sha256:sha(sourceText)},baselineProof:{path:path.relative(root,proofFile),sha256:sha(proofText)},memoryResetReport:{path:path.relative(root,memoryFile),sha256:sha(memoryText)},brakeReleaseReport:{path:path.relative(root,brakeFile),sha256:sha(brakeText)}},
      results,checks:{baselineExact,firstLapMatches,gpuCalls:gpu.gpuCalls??gpu.actualGpuCalls??null,cpuFallbacks:gpu.cpuFallbacks,modelUnchanged,saveUnchanged},
      boundary:'This is a single-candidate, single-seed actuator-model counterfactual, not a learned improvement or production physics change. If a lag wins, it still requires multi-seed training and validation before integration.'};
  await fs.mkdir(out,{recursive:false});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_ACTUATOR_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,checks:report.checks,results:results.map(r=>({tauSeconds:r.tauSeconds,progress:r.progress,laps:r.laps,reason:r.reason,controls:r.controls,smoothingSteps:r.smoothingSteps,actionTraceSha256:r.actionTraceSha256})),report:path.join(out,'report.json')}));
  Cuda.closeCuda();if(!report.passed)process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error);Cuda.closeCuda();process.exitCode=1;});
