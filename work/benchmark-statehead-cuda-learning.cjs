'use strict';
// Isolated, headless learning run for the V3 state-head CUDA DEV copy.
// Does not access Electron profiles, user saves, packaged binaries, or releases.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const {Coordinator}=require('./neural-statehead-cuda-coordinator.cjs');

function option(name,fallback){const value=process.argv.find(arg=>arg.startsWith(`--${name}=`));return value?value.slice(name.length+3):fallback;}
async function main(){
const resumeFile=option('resume-report','');
const resumeText=resumeFile?await fs.readFile(path.resolve(resumeFile),'utf8'):null;
const resume=resumeText?JSON.parse(resumeText):null;
const generations=Number(option('generations','4'));
const population=Number(option('population',String(resume?.settings.population??16)));
const mutation=Number(option('mutation',String(resume?.settings.mutation??0.16)));
const speed=Number(option('speed','30'));
const seed=Number(option('seed','151216'));
const wallMinutes=Number(option('wall-minutes','20'));
const out=path.resolve(option('output',''));
if(process.versions.node!=='24.19.0')throw Error('Use the pinned Node 24.19.0 runtime');
if(!Number.isInteger(generations)||generations<1||generations>50)throw Error('generations must be 1–50');
if(!Number.isInteger(population)||population<4||population>100)throw Error('population must be 4–100');
if(!Number.isFinite(mutation)||mutation<0||mutation>.35)throw Error('mutation must be 0–0.35');
if(!Number.isFinite(speed)||speed<.5||speed>30)throw Error('speed must be 0.5–30');
if(!Number.isInteger(seed)||seed<0||seed>0x7fffffff)throw Error('seed must be a non-negative 31-bit integer');
if(!Number.isInteger(wallMinutes)||wallMinutes<5||wallMinutes>180)throw Error('wall-minutes must be 5–180');
if(!out||await fs.stat(out).then(()=>true,()=>false))throw Error('Use a new output directory; existing evidence is never overwritten');

const selected=Model.defaultChoice();
let restored=null;
if(resume){
  if(resume.complete!==true||resume.settings.modelSha256!==selected.modelSha256||!Number.isInteger(resume.settings.population)||resume.settings.population<4||resume.settings.population>100||!Number.isFinite(resume.settings.mutation)||resume.settings.mutation<0||resume.settings.mutation>.35||!Array.isArray(resume.generations)||!resume.generations.length)throw Error('Resume report must be complete and match the verified model');
  if(resume.generations.some(g=>!Array.isArray(g.results)||g.results.length<4||g.results.length>100||g.results.some(r=>!Array.isArray(r.weights)||r.weights.length!==18)))throw Error('Resume report lacks exact complete generation weights');
  const {Archive}=require('./neural-statehead-cuda-archive.cjs');
  const rules=require('../.impeccable/experimental-penalty5/outputs/rewards.js').RULES;
  const envelope=JSON.parse(await fs.readFile(selected.file,'utf8'));
  const modelData=JSON.parse(envelope.payloadJson);
  const archive=new Archive({dimensions:18,population,maxProgress:11586.000000259404});
  archive.offer({weights:modelData.weights.slice(),fitness:selected.expected.fitness,baseFitness:selected.expected.fitness,progress:selected.expected.bestProgress,laps:selected.expected.laps,lapTimes:selected.expected.lapTimes.slice(),reason:selected.expected.reason,censored:false,overlap:0});
  for(const generation of resume.generations){
    for(const r of generation.results)archive.offer({weights:r.weights,fitness:r.fitness,baseFitness:r.baseFitness,progress:r.progress,laps:r.laps,lapTimes:r.lapTimes.slice(),reason:r.reason,censored:false,overlap:0});
    archive.rebase(generation.history.bestLapTime,rules);
  }
  const last=resume.generations.at(-1),completedEpisodes=resume.generations.reduce((n,g)=>n+g.results.length,0),random=require('../outputs/simulation.js').rng(seed);
  const entries=archive.ask(random,{strength:mutation/.16}).map((r,id)=>({id,weights:r.weights.slice()}));
  restored={population,mutation,speedMultiplier:speed,randomState:random.getState(),generation:last.history.generation+1,history:resume.generations.map(g=>structuredClone(g.history)),completedEpisodes,updates:resume.generations.length,previousLapTime:last.history.bestLapTime,archive:archive.snapshot(),entries};
  if(archive.evaluations!==completedEpisodes+1||archive.cells.size!==resume.final.archiveCells||archive.champion.progress!==last.championProgress||archive.champion.laps!==last.championLaps||archive.champion.fitness!==last.championFitness)throw Error('Reconstructed archive does not match the measured report');
}
const coordinator=new Coordinator({modelFile:selected.file,population,mutation,speedMultiplier:speed,workers:4,restored});
if(!resume)coordinator.random=require('../outputs/simulation.js').rng(seed);
const records=[];
const historyOffset=resume?.generations.length||0;
let resolving=false,startedAt=Date.now(),interval,timer;
let resolveWallGuard;
const summary=()=>{
  const s=coordinator.snapshot(),cars=s.cars||[],workers=coordinator.workers||[];
  return {phase:s.experiment.phase,generation:s.generation,updates:s.learningStats.updates,episodes:s.learningStats.episodes,population:s.population,maxProgress:cars.length?Math.max(...cars.map(car=>car.bestProgress)):0,maxLaps:cars.length?Math.max(...cars.map(car=>car.laps)):0,elapsedSimulatedSeconds:cars.length?Math.max(...cars.map(car=>car.lifetime)):0,archiveCells:s.experiment.archiveCells,gpu:{workers:workers.length,actualGpuCalls:workers.reduce((sum,worker)=>sum+(worker.cuda?.gpuCalls||0),0),cpuFallbacks:workers.reduce((sum,worker)=>sum+(worker.cuda?.cpuFallbacks||0),0),backend:workers.find(worker=>worker.cuda?.backend)?.cuda.backend||null}};
};
function generationRecord(){
  const history=coordinator.history.at(-1),results=coordinator.lastCompletedResults;
  if(!history||!results||results.length!==population)throw Error('A complete natural population result is required');
  const ordered=results.slice().sort((a,b)=>b.progress-a.progress);
  return {history:structuredClone(history),championProgress:coordinator.archive.champion.progress,championLaps:coordinator.archive.champion.laps,championFitness:coordinator.archive.champion.fitness,progressMedian:ordered[Math.floor(ordered.length/2)].progress,progressP90:ordered[Math.ceil(ordered.length*.9)-1].progress,results:results.map(({id,fitness,baseFitness,progress,laps,reason,lapTimes,totalSimulationSeconds,controls,actionTraceSha256,weights})=>({id,fitness,baseFitness,progress,laps,reason,lapTimes,totalSimulationSeconds,controls,actionTraceSha256,weights:weights.slice()}))};
}
async function close(){clearInterval(interval);clearTimeout(timer);await coordinator.close();Model.closeCuda();}
async function writeReport(reason){
  await fs.mkdir(out,{recursive:false});
  const report={format:'statehead-cuda-learning-benchmark-v1',passed:records.length>0,complete:reason==='completed',reason,settings:{appVersion:'5.6.0',model:'V3 state-head / Monza',modelFile:selected.file,modelSha256:selected.modelSha256,proofFile:selected.proofFile,generationsRequested:generations,generationsCompletedThisRun:records.length,population,mutation,speedMultiplier:speed,seed,workers:4,nodeVersion:process.versions.node,wallMinutes,resumedFrom:resumeFile||null,resumeReportSha256:resumeText?crypto.createHash('sha256').update(resumeText).digest('hex'):null,resumedFromSettings:resume?{population:resume.settings.population,mutation:resume.settings.mutation}:null},baseline:{progress:selected.expected.bestProgress,laps:selected.expected.laps,fitness:selected.expected.fitness,lapTimes:selected.expected.lapTimes,reason:selected.expected.reason},generations:[...(resume?.generations||[]),...records],final:summary(),elapsedWallSeconds:(Date.now()-startedAt)/1000,interpretation:'Natural generation outcomes from actual neural sensors, MaleCNS activity, physics and learned coefficients. The inherited clean champion remains protected. Per-candidate weights are included for exact follow-up; resumed runs reconstruct and validate the complete archive, then use a fresh explicit mutation seed. Generation population and mutation may change between resumed runs; each generation retains its exact candidates and weights. This remains a single-seed search, not proof of generalization. No route policy, synthetic labels, user save, or released file is used.'};
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('STATEHEAD_LEARNING_REPORT '+JSON.stringify({complete:report.complete,reason,completedGenerations:records.length,baseline:report.baseline,generations:records.map(r=>({generation:r.history.generation,bestProgress:r.history.bestProgress,meanProgress:r.history.meanProgress,maxLaps:r.history.maxLaps,championProgress:r.championProgress,championLaps:r.championLaps})),gpu:report.final.gpu,output:path.join(out,'report.json')}));
  return report;
}
const done=new Promise((resolve,reject)=>{
  coordinator.on('error',error=>{if(resolving)return;resolving=true;reject(error);});
  coordinator.on('snapshot',snapshot=>{
    if(resolving||!snapshot.history?.length||snapshot.history.length<=historyOffset+records.length)return;
    try{const record=generationRecord();records.push(record);console.log('STATEHEAD_GENERATION '+JSON.stringify({generation:record.history.generation,bestProgress:record.history.bestProgress,meanProgress:record.history.meanProgress,maxLaps:record.history.maxLaps,championProgress:record.championProgress,championLaps:record.championLaps,archiveCells:snapshot.experiment.archiveCells}));}
    catch(error){resolving=true;reject(error);return;}
    if(records.length>=generations){resolving=true;resolve('completed');return;}
  });
});
interval=setInterval(()=>console.log('STATEHEAD_PROGRESS '+JSON.stringify(summary())),10000);
const wallGuard=new Promise(resolve=>{resolveWallGuard=resolve;});
timer=setTimeout(()=>{if(!resolving){resolving=true;console.log('STATEHEAD_WALL_GUARD '+JSON.stringify(summary()));resolveWallGuard('wall-guard-censored');}},wallMinutes*60*1000);
let exitCode=0;
try{
  console.log('STATEHEAD_START '+JSON.stringify({model:selected.modelSha256,settings:{generations,population,mutation,speed,seed,workers:4,wallMinutes},baseline:selected.expected,proof:selected.proofFile}));
  await coordinator.start();
  await coordinator.pause(true);
  const reason=await Promise.race([done,wallGuard]);
  if(reason==='wall-guard-censored')await coordinator.pause(false);
  if(reason==='completed')await writeReport(reason);
  else{exitCode=2;await writeReport('wall-guard-censored');}
}catch(error){exitCode=1;console.error(error.stack||String(error));try{await writeReport('error');}catch(writeError){console.error(writeError.stack||String(writeError));}}
finally{await close();}
process.exitCode=exitCode;
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
