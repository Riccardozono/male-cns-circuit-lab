'use strict';
// Isolated A/B: clear recurrent neural state only after the verified first lap.
// The physical car, lap/reward state and track position are never reset.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const Model=require('./neural-statehead-cuda-model.cjs'),Cuda=require('./neural-statehead-cuda-runtime.cjs');
const Parent=require('./neural-frontier-chain.cjs'),Head=require('./neural-statehead.cjs'),Safety=require('./neural-statehead-cuda-safety.cjs');
const root=path.resolve(__dirname,'..'),reportFile=path.join(root,'.impeccable/review/neural-sacl/statehead-cma-risk-adjusted-continue-20261022-01/report.json'),
  verificationFile=path.join(root,'.impeccable/review/neural-sacl/statehead-cma-risk-adjusted-continue-20261022-01/replay-verify/verification.json'),
  saveFile='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',
  output=path.join(root,'.impeccable/review/neural-sacl/statehead-lap-memory-reset-ab-20261022-01'),MAX_CONTROLS=20000,
  sha=value=>crypto.createHash('sha256').update(value).digest('hex');

function loadLapResetAdapter(){
  const file=path.join(__dirname,'neural-command-live-cuda.cjs'),source=fs.readFileSync(file,'utf8');
  const before="reset();return {reset,step,state,currentCar:()=>car,graph,track,data,model,runtime,topology,modelSha256:modelSha256||Head.sha(fs.readFileSync(modelFile,'utf8'))};";
  const after="reset();function resetNeuralState(){car.brain=runtime.makeBrain(graph);history=[];baseline=[0,0,0];authority=0;if(onReset)onReset();observe();return state();}return {reset,step,state,resetNeuralState,currentCar:()=>car,graph,track,data,model,runtime,topology,modelSha256:modelSha256||Head.sha(fs.readFileSync(modelFile,'utf8'))};";
  if(source.split(before).length!==2)throw Error('Refusing an unrecognized live-adapter source');
  const patched=source.replace(before,after),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(patched,file);
  return {Live:m.exports,sourceSha256:sha(source),patchedSha256:sha(patched)};
}

function wrapStateCapture(){
  const originalController=Parent.controller,originalCreate=Head.create;let capture=null;
  Parent.controller=function(...args){const value=originalController(...args);if(capture)capture.controller=value;return value;};
  Head.create=function(...args){const value=originalCreate(...args);if(capture)capture.head=value;return value;};
  return {begin(){capture={};return capture;},end(){const value=capture;capture=null;return value;},restore(){Parent.controller=originalController;Head.create=originalCreate;}};
}

function makeEnv(Live,loaded,weights,id,sharedTopology,capture){
  const gain=loaded.data.provenance?.motorCorrectionGain??1,effectiveGenes=weights.map(value=>value*gain),
    parent=loaded.core.parent,brain=Parent.controller(parent),head=Head.create(loaded.data),model=parent.anchor.parent.parent.parent.model;
  capture.controller=brain;capture.head=head;
  const env=Live.create(loaded.modelFile,{sharedTopology,modelOverride:model,modelSha256:loaded.sha256,id,
    onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const old=brain.observe(raw);head.observe(raw);return old;},
    motorOverride:(_model,_raw,prior,car)=>{const safety=loaded.data.provenance?.physicsSafety===Safety.revision?Safety.scale(car):1;return head.compose(brain.compose(prior),safety===1?effectiveGenes:effectiveGenes.map(value=>value*safety));}});
  return {env,brain,head};
}

function runCase(Live,loaded,weights,id,mode,sharedTopology){
  const capture={},made=makeEnv(Live,loaded,weights,id,sharedTopology,capture),env=made.env,trace=crypto.createHash('sha256'),firstLapTrace=crypto.createHash('sha256'),resetEvents=[];
  let state=env.state(),controls=0,priorLaps=0,firstLapControls=0;
  while(env.currentCar().alive&&controls<MAX_CONTROLS){
    const lapsBefore=env.currentCar().laps;state=env.step();controls++;
    const row=JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n';trace.update(row);
    if(lapsBefore===0){firstLapTrace.update(row);firstLapControls++;}
    if(state.laps>priorLaps){
      resetEvents.push({control:controls,laps:state.laps,progress:state.bestProgress});
      if(mode==='statehead-only'){made.brain.reset();made.head.reset();}
      else if(mode==='all-neural-state')env.resetNeuralState();
      priorLaps=state.laps;
    }
  }
  state=env.state();
  const result={mode,id,complete:state.complete,censored:!state.complete&&controls>=MAX_CONTROLS,controls,progress:state.bestProgress,
    laps:state.laps,lapTimes:state.lapTimes,fitness:state.fitness,baseFitness:state.car.baseFitness,reason:state.reason,
    simulationSeconds:state.totalSimulationSeconds,terminalSpeedMps:state.car.vehicle?.speedMps??null,terminalOutputs:state.car.outputs.slice(),
    resetEvents,actionTraceSha256:trace.digest('hex'),firstLapTraceSha256:firstLapTrace.digest('hex'),firstLapControls};
  env.close?.();return result;
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(await fsp.stat(output).then(()=>true,()=>false))throw Error('Refusing to overwrite an existing report');
  const sourceReportText=await fsp.readFile(reportFile,'utf8'),sourceReport=JSON.parse(sourceReportText),verificationText=await fsp.readFile(verificationFile,'utf8'),verification=JSON.parse(verificationText),
    saveSha=await fsp.readFile(saveFile).then(sha,()=>null),selected=Model.defaultChoice(),modelSha=sha(await fsp.readFile(selected.file)),weights=sourceReport.protectedChampion.weights,
    verified=verification.replays.find(r=>r.exactMatch&&r.id===0),candidate=sourceReport.generations.find(g=>g.history.generation===9)?.results.find(r=>JSON.stringify(r.weights)===JSON.stringify(weights));
  if(!sourceReport.complete||!verification.passed||!verified||!candidate||!selected||modelSha!==sourceReport.settings.modelSha256||selected.modelSha256!==modelSha||
     JSON.stringify(weights)!==JSON.stringify(candidate.weights))throw Error('The exact protected report candidate and replay proof are required');
  const {Live,sourceSha256,patchedSha256}=loadLapResetAdapter(),refs=wrapStateCapture(),loaded=Model.load(selected.file),rows=[];let topology=null;
  try{
    for(const mode of ['baseline','statehead-only','all-neural-state']){
      const capture=refs.begin(),made=makeEnv(Live,loaded,weights,0,topology,capture);refs.end();if(!topology)topology=made.env.topology;
      const env=made.env,trace=crypto.createHash('sha256'),first=crypto.createHash('sha256'),resetEvents=[];let state=env.state(),controls=0,lastLaps=0,firstControls=0;
      while(env.currentCar().alive&&controls<MAX_CONTROLS){
        const lapsBefore=env.currentCar().laps;state=env.step();controls++;
        const line=JSON.stringify([state.bestProgress,state.totalSimulationSeconds,state.car.outputs])+'\n';trace.update(line);
        if(lapsBefore===0){first.update(line);firstControls++;}
        if(state.laps>lastLaps){
          resetEvents.push({control:controls,laps:state.laps,progress:state.bestProgress});
          if(mode==='statehead-only'){made.brain.reset();made.head.reset();}
          else if(mode==='all-neural-state')env.resetNeuralState();
          lastLaps=state.laps;
        }
      }
      state=env.state();
      rows.push({mode,id:0,complete:state.complete,censored:!state.complete&&controls>=MAX_CONTROLS,controls,progress:state.bestProgress,laps:state.laps,
        lapTimes:state.lapTimes,fitness:state.fitness,baseFitness:state.car.baseFitness,reason:state.reason,simulationSeconds:state.totalSimulationSeconds,
        terminalSpeedMps:state.car.vehicle?.speedMps??null,terminalOutputs:state.car.outputs.slice(),resetEvents,actionTraceSha256:trace.digest('hex'),
        firstLapTraceSha256:first.digest('hex'),firstLapControls:firstControls});
      console.log('LAP_MEMORY_RESET_CASE '+JSON.stringify({mode,controls,progress:state.bestProgress,laps:state.laps,reason:state.reason,resetEvents}));
      env.close?.();
    }
  }finally{refs.restore();}
  const gpu=Cuda.stats(),baseline=rows.find(r=>r.mode==='baseline'),baselineExact=baseline.progress===verified.progress&&baseline.fitness===verified.fitness&&baseline.laps===verified.laps&&baseline.reason===verified.reason&&baseline.controls===verified.controls&&baseline.actionTraceSha256===verified.actionTraceSha256,
    firstLapMatches=rows.every(r=>r.firstLapTraceSha256===baseline.firstLapTraceSha256&&r.firstLapControls===baseline.firstLapControls),modelUnchanged=sha(await fsp.readFile(selected.file))===modelSha,
    saveUnchanged=saveSha!==null&&sha(await fsp.readFile(saveFile))===saveSha;
  const report={format:'male-cns-statehead-lap-neural-reset-ab-v1',appVersion:'5.6.0',passed:baselineExact&&firstLapMatches&&gpu.cpuFallbacks===0&&modelUnchanged&&saveUnchanged,
    learningSucceeded:rows.some(r=>r.laps>=2),settings:{model:'verified V3 state-head / Monza',modelSha256:modelSha,sourceReport:path.relative(root,reportFile),sourceReportSha256:sha(sourceReportText),
      sourceVerification:path.relative(root,verificationFile),sourceVerificationSha256:sha(verificationText),agentId:0,appliedWeightsSha256:sha(JSON.stringify(weights)),maxControls:MAX_CONTROLS,
      interventions:'At the first observed lap boundary only: none; reset external state-head/controller state; or reset every neural state including MaleCNS recurrence. Car pose, velocity, vehicle thermal state, lap clocks, rewards, track and weights remain untouched.'},
    results:rows,checks:{baselineExact,firstLapMatches,gpuWorkers:Cuda.identity().cuda?.workers??null,gpuCalls:gpu.gpuCalls??gpu.actualGpuCalls??null,cpuFallbacks:gpu.cpuFallbacks,modelUnchanged,saveUnchanged},
    sourceHashes:{runner:sha(await fsp.readFile(__filename)),liveAdapter:sourceSha256,patchedLiveAdapter:patchedSha256},
    boundary:'This is an in-memory diagnostic only. A reset variant is not a trained model or a production change. It must reproduce a second lap cleanly and then undergo multi-seed and population validation before integration.'};
  await fsp.mkdir(output,{recursive:false});await fsp.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('LAP_MEMORY_RESET_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,results:rows.map(r=>({mode:r.mode,complete:r.complete,progress:r.progress,laps:r.laps,reason:r.reason,resetEvents:r.resetEvents,actionTraceSha256:r.actionTraceSha256})),checks:report.checks,report:path.join(output,'report.json')}));
  Cuda.closeCuda();if(!report.passed)process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error);Cuda.closeCuda();process.exitCode=1;});
