'use strict';
// Isolated 3-generation CUDA trial for reward-directed state-head mutations.
// Uses the verified V3/Monza seed, 16 agents and the fixed default RNG seed.
// Writes a diagnostic report only; it never changes a user save or release.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const {Coordinator}=require('./neural-statehead-brake-lock-coordinator.cjs');
const out=path.resolve(__dirname,'../.impeccable/review/learning-ml/statehead-reward-directed-3gen-20261020-01');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_GENERATIONS=3,POPULATION=16,MUTATION=.16,SPEED=30,TIMEOUT_MS=20*60*1000;
function counts(values){const out={};for(const value of values)out[value]=(out[value]||0)+1;return out;}
function summarizeGeneration(generation,results,startedAt,proposalKinds,contextAtStart){
  const progress=results.map(r=>r.progress),fitness=results.map(r=>r.fitness),laps=results.map(r=>r.laps);
  const reasons=counts(results.map(r=>r.reason)),directedIds=proposalKinds.map((kind,id)=>kind==='reward-directed-slow-context'?id:null).filter(Number.isInteger);
  const bestLapTime=results.flatMap(r=>r.lapTimes).reduce((a,b)=>Math.min(a,b),Infinity);
  return {generation,population:results.length,meanFitness:fitness.reduce((a,b)=>a+b,0)/fitness.length,
    bestFitness:Math.max(...fitness),meanProgress:progress.reduce((a,b)=>a+b,0)/progress.length,
    bestProgress:Math.max(...progress),totalCompletedLaps:laps.reduce((a,b)=>a+b,0),
    agentsWithLap:laps.filter(v=>v>0).length,agentsWithTwoLaps:laps.filter(v=>v>=2).length,
    bestLapTime:Number.isFinite(bestLapTime)?bestLapTime:null,contextAvailableAtStart:Boolean(contextAtStart),
    proposalKinds:counts(proposalKinds),rewardDirectedAgentIds:directedIds,
    terminalSlowAgents:results.filter(r=>r.terminalSlow===true).length,
    brakeLockPenaltyTotal:results.reduce((a,r)=>a+(r.brakeLockPenalty||0),0),
    directedResults:results.filter(r=>directedIds.includes(r.id)).map(r=>({id:r.id,fitness:r.fitness,progress:r.progress,laps:r.laps,reason:r.reason})),
    reasons,results:results.map(r=>({id:r.id,fitness:r.fitness,progress:r.progress,laps:r.laps,lapTimes:r.lapTimes,
      reason:r.reason,simulationSeconds:r.totalSimulationSeconds,brakeLockPenalty:r.brakeLockPenalty||0,
      brakeLockSeconds:r.brakeLockSeconds||0,terminalSlow:Boolean(r.terminalSlow),actionTraceSha256:r.actionTraceSha256})),
    wallSeconds:(Date.now()-startedAt)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing reward-directed report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(fs.readFileSync(selected.file));
  if(modelSha!==selected.modelSha256)throw Error('Verified parent model checksum changed');
  const coordinator=new Coordinator({modelFile:selected.file,population:POPULATION,mutation:MUTATION,speedMultiplier:SPEED,workers:4});
  const originalAsk=coordinator.archive.ask.bind(coordinator.archive);
  coordinator.archive.ask=(...args)=>{const proposals=originalAsk(...args);coordinator.proposalKinds=proposals.map(proposal=>proposal.kind||'ordinary');return proposals;};
  const generations=[],startedAt=Date.now();let generationWallStart=startedAt,lastProgressAt=0,fatal=null;
  let resolveCompletion,rejectCompletion;const completed=new Promise((resolve,reject)=>{resolveCompletion=resolve;rejectCompletion=reject;});
  const timer=setTimeout(()=>resolveCompletion({timedOut:true}),TIMEOUT_MS);
  coordinator.on('error',error=>{fatal=error;rejectCompletion(error);});
  coordinator.on('snapshot',snapshot=>{const now=Date.now();if(now-lastProgressAt>=20000){lastProgressAt=now;const cars=snapshot.cars||[];
    console.log('STATEHEAD_REWARD_DIRECTED_PROGRESS '+JSON.stringify({generation:snapshot.generation,phase:snapshot.experiment?.phase,
      running:snapshot.running,agents:cars.length,active:cars.filter(c=>c.alive).length,
      maxProgress:cars.length?Math.max(...cars.map(c=>c.bestProgress||0)):0,
      elapsed:cars.length?Math.max(...cars.map(c=>c.lifetime||0)):0,
      contextAvailable:Boolean(coordinator.archive.champion?.rewardDirectedContext),
      directedProposals:coordinator.proposalKinds?.filter(kind=>kind==='reward-directed-slow-context').length||0,
      gpu:coordinator.workers.map(w=>w.cuda?.gpuCalls||0)}));}});
  const originalFinish=coordinator.finish.bind(coordinator);
  coordinator.finish=async()=>{
    const generation=coordinator.generation,results=coordinator.workers.flatMap(w=>w.done||[]);
    const proposalKinds=coordinator.proposalKinds?.slice()||[],contextAtStart=Boolean(coordinator.archive.champion?.rewardDirectedContext);
    let summary=null;
    if(results.length===POPULATION){summary=summarizeGeneration(generation,results,generationWallStart,proposalKinds,contextAtStart);
      const anchor=results.find(r=>JSON.stringify(r.weights)===JSON.stringify(loaded.data.weights));
      if(anchor)summary.verifiedParentReplay={progress:anchor.progress,laps:anchor.laps,fitness:anchor.fitness,reason:anchor.reason,
        actionTraceSha256:anchor.actionTraceSha256,expectedActionTraceSha256:selected.actionTraceSha256,
        actionTraceMatches:anchor.actionTraceSha256===selected.actionTraceSha256,expectedBrakeLockAdjustedFitness:coordinator.baselineFitness,
        scoreMatches:Math.abs(anchor.fitness-coordinator.baselineFitness)<1e-6};
      generations.push(summary);}
    if(generation>=MAX_GENERATIONS)coordinator.running=false;
    const value=await originalFinish();
    if(summary&&coordinator.archive.champion){const context=coordinator.archive.champion.rewardDirectedContext;
      summary.archiveChampionAfterFinish={fitness:coordinator.archive.champion.fitness,baseFitness:coordinator.archive.champion.baseFitness,
        progress:coordinator.archive.champion.progress,laps:coordinator.archive.champion.laps,
        weightsSha256:sha(JSON.stringify(coordinator.archive.champion.weights)),rewardDirectedContext:context?{
          gate:context.gate,brakeLockPenalty:context.brakeLockPenalty,progress:context.progress,laps:context.laps,reason:context.reason}:null};}
    generationWallStart=Date.now();
    if(generation>=MAX_GENERATIONS&&coordinator.phase==='paused')resolveCompletion({completedGenerations:generations.length});
    return value;
  };
  let completion,launchError=null;
  try{await coordinator.start();await coordinator.setSpeed(SPEED);await coordinator.pause(true);generationWallStart=Date.now();completion=await completed;}
  catch(error){launchError=error;}
  finally{clearTimeout(timer);if(completion?.timedOut&&!coordinator.closed)await coordinator.pause(false).catch(()=>{});
    await coordinator.close().catch(()=>{});Model.closeCuda();}
  const report={format:'male-cns-statehead-reward-directed-three-generation-trial-v1',appVersion:'5.6.0',
    completed:!launchError&&!completion?.timedOut&&generations.length===MAX_GENERATIONS,censored:Boolean(completion?.timedOut),
    error:launchError?.stack||fatal?.stack||null,config:{modelId:'v3',circuitId:'monza',population:POPULATION,mutation:MUTATION,
      speedMultiplier:SPEED,workers:4,generationsRequested:MAX_GENERATIONS,modelSha256:modelSha,rewardRevision:coordinator.rewardRevision,
      baselineBrakeLockPenalty:coordinator.baselinePenalty,baselineFitnessAfterRescore:coordinator.baselineFitness,randomSeed:151216},
    generations,wallSeconds:(Date.now()-startedAt)/1000,
    boundary:'One verified V3/Monza seed and three generations test whether targeted variants are produced and evaluated; this is not proof of robust learning across random seeds, circuits, or models.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_REWARD_DIRECTED_THREE_GENERATION_RESULT '+JSON.stringify({completed:report.completed,censored:report.censored,
    wallSeconds:report.wallSeconds,generations:generations.map(g=>({generation:g.generation,bestProgress:g.bestProgress,
      meanProgress:g.meanProgress,agentsWithLap:g.agentsWithLap,agentsWithTwoLaps:g.agentsWithTwoLaps,bestFitness:g.bestFitness,
      contextAvailableAtStart:g.contextAvailableAtStart,proposalKinds:g.proposalKinds,directedResults:g.directedResults,
      archiveChampionAfterFinish:g.archiveChampionAfterFinish})),output:path.join(out,'report.json')}));
  if(!report.completed)process.exitCode=2;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
