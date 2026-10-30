'use strict';
// Isolated 2-generation GPU trial. It writes only a diagnostic JSON report,
// never a shareable save or the user's regular training profile.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const {Coordinator}=require('./neural-statehead-brake-lock-coordinator.cjs');
const out=path.resolve(__dirname,'../.impeccable/review/learning-ml/statehead-brake-lock-3gen-20261020-04');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_GENERATIONS=3,POPULATION=16,MUTATION=.05,SPEED=30,TIMEOUT_MS=20*60*1000;
function summarizeGeneration(generation,results,startedAt){
  const progress=results.map(r=>r.progress),fitness=results.map(r=>r.fitness),laps=results.map(r=>r.laps);
  const reasons={};for(const r of results)reasons[r.reason]=(reasons[r.reason]||0)+1;
  const bestLapTime=results.flatMap(r=>r.lapTimes).reduce((a,b)=>Math.min(a,b),Infinity);
  return {generation,population:results.length,meanFitness:fitness.reduce((a,b)=>a+b,0)/fitness.length,
    bestFitness:Math.max(...fitness),meanProgress:progress.reduce((a,b)=>a+b,0)/progress.length,
    bestProgress:Math.max(...progress),totalCompletedLaps:laps.reduce((a,b)=>a+b,0),
    agentsWithLap:laps.filter(v=>v>0).length,agentsWithTwoLaps:laps.filter(v=>v>=2).length,
    bestLapTime:Number.isFinite(bestLapTime)?bestLapTime:null,
    brakeLockPenaltyTotal:results.reduce((a,r)=>a+(r.brakeLockPenalty||0),0),
    brakeLockAgents:results.filter(r=>(r.brakeLockPenalty||0)>0).length,
    reasons,results:results.map(r=>({id:r.id,fitness:r.fitness,progress:r.progress,laps:r.laps,
      lapTimes:r.lapTimes,reason:r.reason,simulationSeconds:r.totalSimulationSeconds,
      brakeLockPenalty:r.brakeLockPenalty||0,brakeLockSeconds:r.brakeLockSeconds||0,
      brakeLockIntervals:r.brakeLockIntervals||0,actionTraceSha256:r.actionTraceSha256})),
    wallSeconds:(Date.now()-startedAt)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing 2-generation report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(fs.readFileSync(selected.file));
  if(modelSha!==selected.modelSha256)throw Error('Verified parent model checksum changed');
  const coordinator=new Coordinator({modelFile:selected.file,population:POPULATION,mutation:MUTATION,speedMultiplier:SPEED,workers:4});
  const generations=[],startedAt=Date.now();let generationWallStart=startedAt,lastProgressAt=0,fatal=null;
  let resolveCompletion,rejectCompletion;
  const completed=new Promise((resolve,reject)=>{resolveCompletion=resolve;rejectCompletion=reject;});
  const timer=setTimeout(()=>resolveCompletion({timedOut:true}),TIMEOUT_MS);
  coordinator.on('error',error=>{fatal=error;rejectCompletion(error);});
  coordinator.on('snapshot',snapshot=>{
    const now=Date.now();
    if(now-lastProgressAt>=20000){lastProgressAt=now;const cars=snapshot.cars||[];
      console.log('STATEHEAD_BRAKE_LOCK_PROGRESS '+JSON.stringify({generation:snapshot.generation,phase:snapshot.experiment?.phase,
        running:snapshot.running,agents:cars.length,active:cars.filter(c=>c.alive).length,
        maxProgress:cars.length?Math.max(...cars.map(c=>c.bestProgress||0)):0,
        elapsed:cars.length?Math.max(...cars.map(c=>c.lifetime||0)):0,gpu:coordinator.workers.map(w=>w.cuda?.gpuCalls||0)}));}
    if(snapshot.generation>MAX_GENERATIONS&&snapshot.experiment?.phase==='paused'&&snapshot.history.length>=MAX_GENERATIONS)
      resolveCompletion({timedOut:false});
  });
  const originalFinish=coordinator.finish.bind(coordinator);
  coordinator.finish=async()=>{
    const generation=coordinator.generation,results=coordinator.workers.flatMap(w=>w.done||[]);
    let summary=null;
    if(results.length===POPULATION){
      summary=summarizeGeneration(generation,results,generationWallStart);
      const anchor=results.find(r=>JSON.stringify(r.weights)===JSON.stringify(loaded.data.weights));
      if(anchor){summary.verifiedParentReplay={progress:anchor.progress,laps:anchor.laps,fitness:anchor.fitness,
        reason:anchor.reason,actionTraceSha256:anchor.actionTraceSha256,
        expectedActionTraceSha256:selected.actionTraceSha256,
        actionTraceMatches:anchor.actionTraceSha256===selected.actionTraceSha256,
        expectedBrakeLockAdjustedFitness:coordinator.baselineFitness,
        scoreMatches:Math.abs(anchor.fitness-coordinator.baselineFitness)<1e-6};}
      generations.push(summary);
    }
    if(generation>=MAX_GENERATIONS)coordinator.running=false;
    const value=await originalFinish();
    if(summary&&coordinator.archive.champion){summary.archiveChampionAfterFinish={
      fitness:coordinator.archive.champion.fitness,baseFitness:coordinator.archive.champion.baseFitness,
      progress:coordinator.archive.champion.progress,laps:coordinator.archive.champion.laps,
      weightsSha256:sha(JSON.stringify(coordinator.archive.champion.weights))};}
    generationWallStart=Date.now();return value;
  };
  let completion,launchError=null;
  try{
    await coordinator.start();await coordinator.setSpeed(SPEED);await coordinator.pause(true);generationWallStart=Date.now();
    completion=await completed;
  }catch(error){launchError=error;}
  finally{
    clearTimeout(timer);
    if(completion?.timedOut&&!coordinator.closed)await coordinator.pause(false).catch(()=>{});
    await coordinator.close().catch(()=>{});Model.closeCuda();
  }
  const report={format:'male-cns-statehead-brake-lock-three-generation-trial-v1',appVersion:'5.6.0',
    completed:!launchError&&!completion?.timedOut&&generations.length===MAX_GENERATIONS,
    censored:Boolean(completion?.timedOut),error:launchError?.stack||fatal?.stack||null,
    config:{modelId:'v3',circuitId:'monza',population:POPULATION,mutation:MUTATION,speedMultiplier:SPEED,
      workers:4,generationsRequested:MAX_GENERATIONS,modelSha256:modelSha,rewardRevision:coordinator.rewardRevision,
      baselineBrakeLockPenalty:coordinator.baselinePenalty,baselineFitnessAfterRescore:coordinator.baselineFitness,
      randomSeed:151216},generations,wallSeconds:(Date.now()-startedAt)/1000,
    boundary:'Three generations on one model seed can test whether a score-improved parent propagates; it does not establish robust improvement across seeds, circuits, or the original V3 model family.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_BRAKE_LOCK_THREE_GENERATION_RESULT '+JSON.stringify({completed:report.completed,censored:report.censored,
    wallSeconds:report.wallSeconds,generations:generations.map(g=>({generation:g.generation,bestProgress:g.bestProgress,
      meanProgress:g.meanProgress,agentsWithLap:g.agentsWithLap,agentsWithTwoLaps:g.agentsWithTwoLaps,
      bestFitness:g.bestFitness,brakeLockPenaltyTotal:g.brakeLockPenaltyTotal,verifiedParentReplay:g.verifiedParentReplay,
      archiveChampionAfterFinish:g.archiveChampionAfterFinish})),
    output:path.join(out,'report.json')}));
  if(!report.completed)process.exitCode=2;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
