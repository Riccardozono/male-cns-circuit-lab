'use strict';
// Diagnostic-only causal probe: after lap 1, release only the brake below 5 m/s.
// Neural steering/throttle, physical car state, track, and weights remain real.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const Model=require('./neural-statehead-cuda-model.cjs'),Cuda=require('./neural-statehead-cuda-runtime.cjs');
const Parent=require('./neural-frontier-chain.cjs'),Head=require('./neural-statehead.cjs'),Safety=require('./neural-statehead-cuda-safety.cjs');
const root=path.resolve(__dirname,'..'),reportDir=path.join(root,'.impeccable/review/neural-sacl/statehead-postlap-brake-release-20261022-01'),
  sourceReport=path.join(root,'.impeccable/review/neural-sacl/statehead-cma-risk-adjusted-continue-20261022-01/report.json'),
  proofFile=path.join(root,'.impeccable/review/neural-sacl/statehead-cma-risk-adjusted-continue-20261022-01/replay-verify/verification.json'),
  resetReport=path.join(root,'.impeccable/review/neural-sacl/statehead-lap-memory-reset-ab-20261022-01/report.json'),
  saveFile='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',MAX_CONTROLS=12000,
  sha=value=>crypto.createHash('sha256').update(value).digest('hex');

function loadLapResetAdapter(){
  const file=path.join(__dirname,'neural-command-live-cuda.cjs'),source=fs.readFileSync(file,'utf8');
  const before="reset();return {reset,step,state,currentCar:()=>car,graph,track,data,model,runtime,topology,modelSha256:modelSha256||Head.sha(fs.readFileSync(modelFile,'utf8'))};";
  const after="reset();return {reset,step,state,currentCar:()=>car,graph,track,data,model,runtime,topology,modelSha256:modelSha256||Head.sha(fs.readFileSync(modelFile,'utf8'))};";
  if(source.split(before).length!==2)throw Error('Refusing an unrecognized live-adapter source');
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source.replace(before,after),file);return m.exports;
}
function makeEnv(Live,loaded,weights,id,sharedTopology,releaseBrake){
  const gain=loaded.data.provenance?.motorCorrectionGain??1,effectiveGenes=weights.map(v=>v*gain),parent=loaded.core.parent,
    brain=Parent.controller(parent),head=Head.create(loaded.data),model=parent.anchor.parent.parent.parent.model;
  const env=Live.create(loaded.modelFile,{sharedTopology,modelOverride:model,modelSha256:loaded.sha256,id,
    onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const prior=brain.observe(raw);head.observe(raw);return prior;},
    motorOverride:(_model,_raw,prior,car)=>{
      const safety=loaded.data.provenance?.physicsSafety===Safety.revision?Safety.scale(car):1;
      const commands=head.compose(brain.compose(prior),safety===1?effectiveGenes:effectiveGenes.map(v=>v*safety));
      if(releaseBrake&&car.laps>=1&&(car.vehicle?.speedMps??Infinity)<5&&commands[2]>0){commands[2]=0;releaseBrake.count++;releaseBrake.firstControl??=releaseBrake.currentControl;}
      return commands;
    }});
  return env;
}
function summarizeVehicle(car){
  const v=car.vehicle||{},result={};
  for(const key of ['speedMps','longitudinalG','lateralG','slipAngle','gear','engineRpm','wheelRpm','throttle','brake','driveForceN','brakeForceN'])if(Number.isFinite(v[key]))result[key]=v[key];
  return result;
}
function run(Live,loaded,weights,id,topology,intervene){
  const intervention={count:0,firstControl:null,currentControl:0},env=makeEnv(Live,loaded,weights,id,topology,intervene?intervention:null),trace=crypto.createHash('sha256'),first=crypto.createHash('sha256'),samples=[];
  let state=env.state(),controls=0,firstLapControls=0,previousLaps=0;
  while(env.currentCar().alive&&controls<MAX_CONTROLS){
    intervention.currentControl=controls+1;
    const wasFirstLap=env.currentCar().laps===0;state=env.step();controls++;
    const car=env.currentCar(),outputs=car.outputs.slice(),line=JSON.stringify([state.bestProgress,state.totalSimulationSeconds,outputs])+'\n';trace.update(line);
    if(wasFirstLap){first.update(line);firstLapControls++;}
    if(car.laps!==previousLaps){samples.push({event:'lap-boundary',control:controls,laps:car.laps,progress:state.bestProgress,position:[car.x,car.y],vehicle:summarizeVehicle(car),outputs});previousLaps=car.laps;}
    if(car.laps>=1&&(controls%25===0||!car.alive))samples.push({event:'postlap-sample',control:controls,laps:car.laps,progress:state.bestProgress,position:[car.x,car.y],vehicle:summarizeVehicle(car),outputs});
  }
  state=env.state();
  return {mode:intervene?'release-brake-below-5mps-after-lap1':'baseline',id,complete:state.complete,censored:!state.complete&&controls>=MAX_CONTROLS,
    controls,progress:state.bestProgress,laps:state.laps,lapTimes:state.lapTimes,fitness:state.fitness,baseFitness:state.car.baseFitness,reason:state.reason,
    simulationSeconds:state.totalSimulationSeconds,terminalSpeedMps:state.car.vehicle?.speedMps??null,terminalOutputs:state.car.outputs.slice(),
    interventionCount:intervention.count,firstInterventionControl:intervention.firstControl,firstLapControls,
    firstLapTraceSha256:first.digest('hex'),actionTraceSha256:trace.digest('hex'),samples};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(await fsp.stat(reportDir).then(()=>true,()=>false))throw Error('Refusing to overwrite an existing diagnostic report');
  const sourceText=await fsp.readFile(sourceReport,'utf8'),source=JSON.parse(sourceText),proofText=await fsp.readFile(proofFile,'utf8'),proof=JSON.parse(proofText),resetText=await fsp.readFile(resetReport,'utf8'),reset=JSON.parse(resetText),
    saveSha=await fsp.readFile(saveFile).then(sha,()=>null),selected=Model.defaultChoice(),modelSha=sha(await fsp.readFile(selected.file)),weights=source.protectedChampion.weights,
    baselineProof=proof.replays.find(r=>r.exactMatch&&r.id===0),expectedResetBaseline=reset.results.find(r=>r.mode==='baseline');
  if(!source.complete||!proof.passed||!reset.passed||!baselineProof||!expectedResetBaseline||!selected||modelSha!==source.settings.modelSha256||selected.modelSha256!==modelSha||
    JSON.stringify(weights)!==JSON.stringify(source.generations.find(g=>g.history.generation===9)?.results.find(r=>JSON.stringify(r.weights)===JSON.stringify(weights))?.weights))throw Error('Exact protected candidate and existing replay proofs are required');
  const Live=loadLapResetAdapter(),loaded=Model.load(selected.file),baseline=run(Live,loaded,weights,0,null,false),treatment=run(Live,loaded,weights,0,null,true),gpu=Cuda.stats(),
    baselineExact=baseline.progress===baselineProof.progress&&baseline.fitness===baselineProof.fitness&&baseline.laps===baselineProof.laps&&baseline.reason===baselineProof.reason&&baseline.controls===baselineProof.controls&&baseline.actionTraceSha256===baselineProof.actionTraceSha256,
    treatmentFirstLapMatches=treatment.firstLapTraceSha256===baseline.firstLapTraceSha256&&treatment.firstLapControls===baseline.firstLapControls,
    modelUnchanged=sha(await fsp.readFile(selected.file))===modelSha,saveUnchanged=saveSha!==null&&sha(await fsp.readFile(saveFile))===saveSha,
    report={format:'male-cns-statehead-postlap-brake-release-diagnostic-v1',appVersion:'5.6.0',passed:baselineExact&&treatmentFirstLapMatches&&treatment.interventionCount>0&&gpu.cpuFallbacks===0&&modelUnchanged&&saveUnchanged,
      learningSucceeded:treatment.laps>=2,settings:{model:'verified V3 state-head / Monza',modelSha256:modelSha,sourceReport:path.relative(root,sourceReport),sourceReportSha256:sha(sourceText),sourceProof:path.relative(root,proofFile),sourceProofSha256:sha(proofText),priorResetReport:path.relative(root,resetReport),priorResetReportSha256:sha(resetText),agentId:0,weightsSha256:sha(JSON.stringify(weights)),maxControls:MAX_CONTROLS,intervention:'After lap 1 only, suppress neural brake command when speed < 5 m/s; do not add throttle or alter steering, track position, vehicle physics, elapsed time, lap/reward state, or weights.'},
      results:[baseline,treatment],checks:{baselineExact,treatmentFirstLapMatches,gpuCalls:gpu.gpuCalls??gpu.actualGpuCalls??null,cpuFallbacks:gpu.cpuFallbacks,modelUnchanged,saveUnchanged},
      boundary:'Single-seed causal probe only. Brake release is an experimental actuator intervention, not a learned policy or production fix; terminal command samples alone do not prove stall cause.'};
  await fsp.mkdir(reportDir,{recursive:false});await fsp.writeFile(path.join(reportDir,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_BRAKE_RELEASE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,checks:report.checks,results:report.results.map(r=>({mode:r.mode,progress:r.progress,laps:r.laps,reason:r.reason,controls:r.controls,terminalSpeedMps:r.terminalSpeedMps,terminalOutputs:r.terminalOutputs,interventionCount:r.interventionCount,firstInterventionControl:r.firstInterventionControl,actionTraceSha256:r.actionTraceSha256})),report:path.join(reportDir,'report.json')}));
  Cuda.closeCuda();if(!report.passed)process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error);Cuda.closeCuda();process.exitCode=1;});
