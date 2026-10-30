'use strict';
// Resumable, research-only early-gate training on the real Monza simulator.
// It cannot write app saves, change the released app, or certify a decoder.
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const Save=require('./neural-statehead-cuda-save.cjs');
const {Coordinator}=require('./neural-statehead-cuda-coordinator.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function option(name,fallback){const value=process.argv.find(arg=>arg.startsWith(`--${name}=`));return value?value.slice(name.length+3):fallback;}
function fail(message){throw Error(message);}
async function main(){
  const requestedGenerations=Number(option('generations','2'));
  const speed=Number(option('speed','30'));
  const seed=Number(option('seed','151216'));
  const out=path.resolve(option('output',''));
  const researchModel=path.resolve(option('model','.impeccable/review/neural-sacl/statehead-cuda-early-gate-low-gain-20261019-01/statehead-early-gate-low-gain-research-only.malecns-statehead.json'));
  const resumeFile=option('resume','');
  if(process.versions.node!=='24.19.0')fail('Use the pinned Node 24.19.0 runtime');
  if(!Number.isInteger(requestedGenerations)||requestedGenerations<1||requestedGenerations>20)fail('generations must be 1–20');
  if(!Number.isFinite(speed)||speed<.5||speed>30)fail('speed must be 0.5–30');
  if(!Number.isInteger(seed)||seed<0||seed>0x7fffffff)fail('seed must be a non-negative 31-bit integer');
  if(!out)fail('Specify a dedicated output directory');
  const selected=Model.defaultChoice(),research=Model.loadResearch(researchModel),modelText=await fs.readFile(researchModel,'utf8'),modelSha=sha(modelText),engineIdentity=Save.identity();
  if(research.data.status!=='research-unverified'||research.data.weights.some(value=>value!==0)||research.data.migratedWeights.length!==18||research.data.provenance.parentCleanModelSha256!==selected.modelSha256)fail('Research loader did not preserve the verified parent and isolate migrated genes');
  try{Model.load(researchModel);fail('Normal app loader unexpectedly accepted the research-only decoder');}catch(error){if(String(error.message).includes('unexpectedly accepted'))throw error;}
  let resume=null,records=[],population=16,mutation=.016,initialRecords=0;
  if(resumeFile){
    if(!(await fs.stat(out).then(()=>true,()=>false))||await fs.stat(path.join(out,'report.json')).then(()=>true,()=>false))fail('Resume requires the existing unfinished research output directory');
    const envelope=JSON.parse(await fs.readFile(path.resolve(resumeFile),'utf8'));
    if(envelope.format!=='male-cns-statehead-early-gate-research-checkpoint'||envelope.schema!==1||typeof envelope.payloadJson!=='string'||sha(envelope.payloadJson)!==envelope.sha256)fail('Research checkpoint format or checksum is invalid');
    const payload=JSON.parse(envelope.payloadJson);
    if(payload.appVersion!=='5.6.0'||payload.protocol!=='statehead-early-gate-research-only-v1'||payload.modelSha256!==modelSha||payload.parentCleanModelSha256!==selected.modelSha256||payload.engineIdentity!==engineIdentity||payload.numericRuntime!=='24.19.0'||!Array.isArray(payload.records)||payload.records.length!==payload.state.updates)fail('Checkpoint does not match this exact research model, verified parent, or runtime');
    const validated=Save.validateState(payload.state,18);
    if(validated.population!==payload.settings.population||validated.mutation!==payload.settings.mutation||validated.speedMultiplier!==payload.settings.speedMultiplier||payload.settings.workers!==4)fail('Checkpoint settings are inconsistent');
    resume=validated;records=payload.records;population=payload.settings.population;mutation=payload.settings.mutation;initialRecords=records.length;
  }else{
    if(await fs.stat(out).then(()=>true,()=>false))fail('Use a new output directory; existing evidence is never overwritten');
    await fs.mkdir(out,{recursive:false});
  }
  if(population!==16)fail('This controlled experiment is fixed at the requested initial population of 16');
  const coordinator=new Coordinator({modelFile:researchModel,population,mutation,speedMultiplier:speed,workers:4,restored:resume,research:true});
  const researchZeroCorrection=research.data.verifiedFullResult;
  if(coordinator.archive.champion.progress!==researchZeroCorrection.bestProgress||coordinator.archive.champion.laps!==researchZeroCorrection.laps||coordinator.archive.champion.weights.some(value=>value!==0))fail('Protected champion is not the physically verified zero-correction parent for this research decoder');
  if(!resume)coordinator.random=require('../outputs/simulation.js').rng(seed);
  let resolving=false,startedAt=Date.now(),interval,timer,processing=false;
  const recordsAtStart=records.length;
  const summary=()=>{const snapshot=coordinator.snapshot(),cars=snapshot.cars||[],workers=coordinator.workers||[];return {phase:snapshot.experiment.phase,generation:snapshot.generation,updates:snapshot.learningStats.updates,episodes:snapshot.learningStats.episodes,population:snapshot.population,maxProgress:cars.length?Math.max(...cars.map(car=>car.bestProgress)):0,maxLaps:cars.length?Math.max(...cars.map(car=>car.laps)):0,elapsedSimulatedSeconds:cars.length?Math.max(...cars.map(car=>car.lifetime)):0,archiveCells:snapshot.experiment.archiveCells,gpu:{workers:workers.length,actualGpuCalls:workers.reduce((sum,worker)=>sum+(worker.cuda?.gpuCalls||0),0),cpuFallbacks:workers.reduce((sum,worker)=>sum+(worker.cuda?.cpuFallbacks||0),0),backend:workers.find(worker=>worker.cuda?.backend)?.cuda.backend||null}};};
  const checkpointPath=generation=>path.join(out,`checkpoint-ready-gen${String(generation).padStart(4,'0')}.json`);
  async function writeCheckpoint(){
    const state=await coordinator.exportState(),payload={appVersion:'5.6.0',protocol:'statehead-early-gate-research-only-v1',numericRuntime:process.versions.node,modelSha256:modelSha,parentCleanModelSha256:selected.modelSha256,engineIdentity,seed,settings:{population,mutation:coordinator.mutation,speedMultiplier:coordinator.speedMultiplier,workers:4},records,state};
    const payloadJson=JSON.stringify(payload),envelope=JSON.stringify({format:'male-cns-statehead-early-gate-research-checkpoint',schema:1,payloadJson,sha256:sha(payloadJson)});
    if(Buffer.byteLength(envelope)>32*1024*1024)fail('Research-only checkpoint exceeds the 32 MiB safety limit');
    const final=checkpointPath(state.generation),temp=`${final}.${crypto.randomUUID()}.tmp`;
    try{await fs.writeFile(temp,envelope,{encoding:'utf8',flag:'wx'});await fs.rename(temp,final);}catch(error){await fs.rm(temp,{force:true}).catch(()=>{});throw error;}
    return {file:final,sha256:sha(envelope),generation:state.generation,updates:state.updates};
  }
  function generationRecord(){
    const history=coordinator.history.at(-1),results=coordinator.lastCompletedResults;
    if(!history||!results||results.length!==population)fail('A complete natural population result is required');
    const ordered=results.slice().sort((a,b)=>b.progress-a.progress);
    return {history:structuredClone(history),championProgress:coordinator.archive.champion.progress,championLaps:coordinator.archive.champion.laps,championFitness:coordinator.archive.champion.fitness,progressMedian:ordered[Math.floor(ordered.length/2)].progress,progressP90:ordered[Math.ceil(ordered.length*.9)-1].progress,results:results.map(({id,weights,fitness,baseFitness,progress,laps,reason,lapTimes,totalSimulationSeconds,controls,actionTraceSha256})=>({id,weights,fitness,baseFitness,progress,laps,reason,lapTimes,totalSimulationSeconds,controls,actionTraceSha256}))};
  }
  async function close(){clearInterval(interval);clearTimeout(timer);await coordinator.close();Model.closeCuda();}
  async function writeReport(reason){
    const report={format:'statehead-cuda-early-gate-research-benchmark-v1',passed:reason==='completed'&&records.length-initialRecords===requestedGenerations,complete:reason==='completed',reason,settings:{appVersion:'5.6.0',model:'V3 state-head research / Monza',gateRevision:research.data.provenance.earlyGateRevision,modelFile:researchModel,modelSha256:modelSha,parentModelSha256:selected.modelSha256,motorCorrectionGain:research.data.provenance.motorCorrectionGain,protectedFraction:research.data.provenance.protectedFraction,population,mutation,speedMultiplier:speed,seed,workers:4,nodeVersion:process.versions.node,engineIdentity,generationsRequested:requestedGenerations,generationsCompletedThisRun:records.length-initialRecords},baseline:{bestVerifiedV3:structuredClone(selected.expected),researchZeroCorrection:structuredClone(researchZeroCorrection)},generations:records,final:summary(),elapsedWallSeconds:(Date.now()-startedAt)/1000,interpretation:'Real GPU-backed simulator episodes using live MaleCNS activity, vehicle sensors and Monza physics. Research-only decoder: exact zero-correction parent is protected as archive champion; migrated legacy weights appear only as one first-generation candidate. The learned motor correction gain is scaled to 0.2 following measured early-trajectory collapses. Gate timing/protected prefix are explicit model settings. The best physically verified V3 is reported separately and remains the external threshold; no candidate counts as an improvement until it beats that reference in a paired physical evaluation. Completion of this benchmark does not certify improved driving or a compatible app save.'};
    const file=path.join(out,'report.json');await fs.writeFile(file,JSON.stringify(report,null,2),{flag:'wx'});console.log('STATEHEAD_EARLY_GATE_REPORT '+JSON.stringify({passed:report.passed,complete:report.complete,reason,completedGenerations:report.settings.generationsCompletedThisRun,baseline:report.baseline,generations:records.map(r=>({generation:r.history.generation,bestProgress:r.history.bestProgress,meanProgress:r.history.meanProgress,maxLaps:r.history.maxLaps,championProgress:r.championProgress,championLaps:r.championLaps})),gpu:report.final.gpu,output:file}));
    return report;
  }
  const done=new Promise((resolve,reject)=>{
    coordinator.on('error',error=>{if(resolving)return;resolving=true;reject(error);});
    coordinator.on('snapshot',snapshot=>{
      if(resolving||processing||!snapshot.history?.length||records.length>=snapshot.history.length)return;
      if(snapshot.experiment.phase!=='paused'||snapshot.running)return;
      processing=true;
      (async()=>{try{
        const record=generationRecord();records.push(record);const checkpoint=await writeCheckpoint();
        console.log('STATEHEAD_EARLY_GATE_GENERATION '+JSON.stringify({generation:record.history.generation,bestProgress:record.history.bestProgress,meanProgress:record.history.meanProgress,maxLaps:record.history.maxLaps,championProgress:record.championProgress,championLaps:record.championLaps,archiveCells:snapshot.experiment.archiveCells,checkpoint}));
        if(records.length-recordsAtStart>=requestedGenerations){resolving=true;resolve('completed');}
        else setImmediate(()=>coordinator.pause(true).catch(error=>{if(!resolving){resolving=true;reject(error);}}));
      }catch(error){resolving=true;reject(error);}finally{processing=false;}})();
    });
  });
  interval=setInterval(()=>console.log('STATEHEAD_EARLY_GATE_PROGRESS '+JSON.stringify(summary())),10000);
  const wallGuard=new Promise(resolve=>{timer=setTimeout(()=>{if(!resolving){resolving=true;console.log('STATEHEAD_EARLY_GATE_WALL_GUARD '+JSON.stringify(summary()));resolve('wall-guard-censored');}},20*60*1000);});
  let exitCode=0;
  try{
    console.log('STATEHEAD_EARLY_GATE_START '+JSON.stringify({model:modelSha,parent:selected.modelSha256,settings:{generations:requestedGenerations,population,mutation,speed,seed,workers:4},resume:Boolean(resume),bestVerifiedV3:selected.expected,researchZeroCorrection}));
    await coordinator.start();
    if(!resume){
      const entries=coordinator.entries,migrated=research.data.migratedWeights;
      if(entries[0].weights.some(value=>value!==0)||JSON.stringify(entries[1].weights)!==JSON.stringify(migrated)||coordinator.archive.champion.weights.some(value=>value!==0))fail('Initial population does not contain a zero-weight protected parent plus exactly the explicit migrated candidate');
      const checkpoint=await writeCheckpoint();console.log('STATEHEAD_EARLY_GATE_INITIAL_CHECKPOINT '+JSON.stringify(checkpoint));
    }
    await coordinator.pause(true);
    const reason=await Promise.race([done,wallGuard]);
    if(reason==='wall-guard-censored')await coordinator.pause(false);
    if(reason==='completed')await writeReport(reason);else{exitCode=2;await writeReport(reason);}
  }catch(error){exitCode=1;console.error(error.stack||String(error));try{await writeReport('error');}catch(writeError){console.error(writeError.stack||String(writeError));}}
  finally{await close();}
  process.exitCode=exitCode;
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
