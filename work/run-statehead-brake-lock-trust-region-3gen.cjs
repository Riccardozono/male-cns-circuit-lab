'use strict';
// Isolated three-generation CUDA test of conservative, antithetic terminal-context mutations.
// Keeps the verified physics, parent brain, rewards and population size unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const {Coordinator}=require('./neural-statehead-brake-lock-coordinator.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/statehead-brake-lock-trust-region-3gen-20261020-01');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const MAX_GENERATIONS=3,POPULATION=16,MUTATION=.16,SPEED=30,TIMEOUT_MS=20*60*1000,SCALES=[.02,.04,.08,.12];
function counts(values){const out={};for(const value of values)out[value]=(out[value]||0)+1;return out;}
function trustRegionAsk(archive,random,options,baseAsk){
  const original=baseAsk(random,options),context=archive.champion?.rewardDirectedContext;
  if(!context)return original;
  const champion=original.find(p=>p.kind==='protected-champion');
  const explorers=original.filter(p=>p.kind==='block-antithetic-mutation');
  if(!champion||context.features?.length!==9||archive.population<12)throw Error('A protected champion and real observed neural context are required');
  const targeted=[];
  for(const scale of SCALES)for(const sign of [1,-1]){
    const weights=archive.champion.weights.map((value,index)=>index%2===0?value:
      Math.max(-8,Math.min(8,value+sign*scale*context.features[Math.floor(index/2)])));
    const shift=weights.reduce((sum,value,index)=>index%2===1?sum+context.features[Math.floor(index/2)]*(value-archive.champion.weights[index]):sum,0);
    targeted.push({weights,kind:'reward-directed-trust-region',direction:sign>0?'less-brake/more-drive':'more-brake/less-drive',sigma:scale,
      contextFeatures:context.features.slice(),predictedLongitudinalShift:shift,parentWeights:archive.champion.weights.slice(),parentProgress:archive.champion.progress});
  }
  return [champion,...targeted,...explorers.slice(0,archive.population-1-targeted.length)];
}
function summarize(generation,results,startedAt,proposalKinds,contextAtStart){
  const scores=results.map(r=>r.fitness),progress=results.map(r=>r.progress),laps=results.map(r=>r.laps),directedIds=proposalKinds.map((kind,id)=>kind==='reward-directed-trust-region'?id:null).filter(Number.isInteger);
  const times=results.flatMap(r=>r.lapTimes||[]);
  return {generation,population:results.length,meanFitness:scores.reduce((a,b)=>a+b,0)/scores.length,bestFitness:Math.max(...scores),
    meanProgress:progress.reduce((a,b)=>a+b,0)/progress.length,bestProgress:Math.max(...progress),agentsWithLap:laps.filter(v=>v>0).length,
    agentsWithTwoLaps:laps.filter(v=>v>=2).length,bestLapTime:times.length?Math.min(...times):null,
    proposalKinds:counts(proposalKinds),contextAvailableAtStart:Boolean(contextAtStart),directedResults:results.filter(r=>directedIds.includes(r.id)).map(r=>({id:r.id,fitness:r.fitness,progress:r.progress,laps:r.laps,reason:r.reason,terminalSlow:r.terminalSlow,brakeLockPenalty:r.brakeLockPenalty||0})),
    results:results.map(r=>({id:r.id,fitness:r.fitness,baseFitness:r.baseFitness,progress:r.progress,laps:r.laps,lapTimes:r.lapTimes,reason:r.reason,
      terminalSlow:Boolean(r.terminalSlow),brakeLockPenalty:r.brakeLockPenalty||0,actionTraceSha256:r.actionTraceSha256})),wallSeconds:(Date.now()-startedAt)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing trust-region report');
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(fs.readFileSync(selected.file));
  if(modelSha!==selected.modelSha256)throw Error('Protected parent model checksum changed');
  const coordinator=new Coordinator({modelFile:selected.file,population:POPULATION,mutation:MUTATION,speedMultiplier:SPEED,workers:4});
  const baseAsk=coordinator.archive.ask.bind(coordinator.archive);
  coordinator.archive.ask=function(random,options){const proposals=trustRegionAsk(this,random,options,baseAsk);this.__lastProposalKinds=proposals.map(p=>p.kind||'ordinary');return proposals;};
  const generations=[],startedAt=Date.now();let generationStart=startedAt,lastLog=0,fatal=null,resolveDone,rejectDone;
  const completion=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
  const timer=setTimeout(()=>resolveDone({timedOut:true}),TIMEOUT_MS);
  coordinator.on('error',error=>{fatal=error;rejectDone(error);});
  coordinator.on('snapshot',snapshot=>{const now=Date.now();if(now-lastLog>=20000){lastLog=now;const cars=snapshot.cars||[];console.log('STATEHEAD_TRUST_REGION_PROGRESS '+JSON.stringify({generation:snapshot.generation,phase:snapshot.experiment?.phase,active:cars.filter(c=>c.alive).length,
    maxProgress:cars.length?Math.max(...cars.map(c=>c.bestProgress||0)):0,elapsed:cars.length?Math.max(...cars.map(c=>c.lifetime||0)):0,gpu:coordinator.workers.map(w=>w.cuda?.gpuCalls||0)}));}});
  const originalFinish=coordinator.finish.bind(coordinator);
  coordinator.finish=async()=>{
    const generation=coordinator.generation,results=coordinator.workers.flatMap(w=>w.done||[]),kinds=coordinator.archive.__lastProposalKinds?.slice()||[],contextAtStart=Boolean(coordinator.archive.champion?.rewardDirectedContext);
    let row=null;
    if(results.length===POPULATION){row=summarize(generation,results,generationStart,kinds,contextAtStart);const parentResult=results.find(r=>JSON.stringify(r.weights)===JSON.stringify(loaded.data.weights));
      if(parentResult)row.verifiedParentReplay={progress:parentResult.progress,laps:parentResult.laps,fitness:parentResult.fitness,reason:parentResult.reason,actionTraceSha256:parentResult.actionTraceSha256,expectedActionTraceSha256:selected.actionTraceSha256,actionTraceMatches:parentResult.actionTraceSha256===selected.actionTraceSha256};
      generations.push(row);}
    if(generation>=MAX_GENERATIONS)coordinator.running=false;
    const next=await originalFinish();
    if(row&&coordinator.archive.champion)row.championAfterFinish={fitness:coordinator.archive.champion.fitness,baseFitness:coordinator.archive.champion.baseFitness,progress:coordinator.archive.champion.progress,laps:coordinator.archive.champion.laps,reason:coordinator.archive.champion.reason,weightsSha256:sha(JSON.stringify(coordinator.archive.champion.weights))};
    generationStart=Date.now();if(generation>=MAX_GENERATIONS&&coordinator.phase==='paused')resolveDone({completedGenerations:generations.length});return next;
  };
  let completionResult,error=null;
  try{await coordinator.start();await coordinator.setSpeed(SPEED);await coordinator.pause(true);generationStart=Date.now();completionResult=await completion;}
  catch(e){error=e;}
  finally{clearTimeout(timer);if(completionResult?.timedOut&&!coordinator.closed)await coordinator.pause(false).catch(()=>{});await coordinator.close().catch(()=>{});Model.closeCuda();}
  const report={format:'male-cns-statehead-brake-lock-trust-region-three-generation-v1',appVersion:'5.6.0',completed:!error&&!completionResult?.timedOut&&generations.length===MAX_GENERATIONS,
    censored:Boolean(completionResult?.timedOut),error:error?.stack||fatal?.stack||null,config:{modelId:'v3',circuitId:'monza',population:POPULATION,mutation:MUTATION,speedMultiplier:SPEED,workers:4,
      generationsRequested:MAX_GENERATIONS,modelSha256:modelSha,rewardRevision:coordinator.rewardRevision,randomSeed:151216,contextScales:SCALES,
      proposal:'8 antithetic, progressively larger/smaller longitudinal mutations along the observed terminal neural context; 7 ordinary explorers; champion always protected'},generations,
    wallSeconds:(Date.now()-startedAt)/1000,boundary:'Research-only comparison of a smaller antithetic trust region against the prior four one-sided large mutations. It changes no app save, published build, physics, or neural inputs; three generations on one seed do not establish convergence.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STATEHEAD_TRUST_REGION_RESULT '+JSON.stringify({completed:report.completed,censored:report.censored,wallSeconds:report.wallSeconds,
    generations:generations.map(g=>({generation:g.generation,bestProgress:g.bestProgress,meanProgress:g.meanProgress,agentsWithLap:g.agentsWithLap,agentsWithTwoLaps:g.agentsWithTwoLaps,
      proposalKinds:g.proposalKinds,directedResults:g.directedResults,championAfterFinish:g.championAfterFinish})),report:path.join(out,'report.json')}));
  if(!report.completed)process.exitCode=2;
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
module.exports={trustRegionAsk,SCALES};
