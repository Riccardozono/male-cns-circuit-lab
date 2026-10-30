'use strict';
// Read-only matched replay of the supplied V3/Monza save. The treatment is an
// in-memory copy with the explicitly approved history reset and new reward
// revision; the original save is never written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(process.env.MALECNS_V3_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-brake-lock-migration-ab-20261020-01'));
const Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs'),originalDenseStep=Dense.step;
Dense.step=(...args)=>Cuda.pass(...args);
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),
  Rewards=require(path.join(root,'outputs/rewards.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function summarizeCar(car,ppm){return {id:car.id,progressM:car.bestProgress/ppm,fitness:car.fitness,laps:car.laps,reason:car.reason,
  revision:car.rewardRevision,stallPenalty:car.rewardBreakdown.penalties.stall,brakeLockSeconds:car.rewardState.brakeLockSeconds,
  throttle:car.outputs?.[1]??0,brake:car.outputs?.[2]??0};}
function summarizeHistory(row,ppm,cars){return {generation:row.generation,bestProgressM:row.bestProgress/ppm,meanProgressM:row.meanProgress/ppm,
  bestFitness:row.best,maxLaps:row.maxLaps,noLapCount:row.noLapCount,slowerLapCount:row.slowerLapCount,
  rewardRevision:row.rewardRevision,stallPenaltyBest:row.rewardBreakdown.penalties.stall,
  brakeLockEpisodes:cars.filter(car=>car.brakeLockSeconds>0).length,episodesWithStallPenalty:cars.filter(car=>car.stallPenalty>1400).length,
  cars};}
async function run(label,payload,revision,generations){
  const compact=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
    data=Legacy.tagV3(compact),circuits=require(path.join(root,'outputs/data/circuits.json')),
    sim=new F.Simulation(data,{modelId:'v3',population:payload.workers[0].state.population,circuitId:'monza',circuits});
  const state=structuredClone(payload.workers[0].state);state.history=[];state.rewardRevision=revision;
  Progress.restore(sim,state);sim.running=true;
  const sourceHashes=Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js']
    .map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
  const history=[],finishedCars=[];let finalCars=null,lastProgress=performance.now();
  sim.onTrialTick=s=>{
    if(performance.now()-lastProgress>20000){lastProgress=performance.now();console.log('SAVED_REWARD_AB_PROGRESS '+JSON.stringify({variant:label,generation:s.generation,
      alive:s.cars.filter(car=>car.alive).length,bestProgressM:Math.max(...s.cars.map(car=>car.bestProgress))/(s.track.pixelsPerMeter||1),
      maxLaps:Math.max(...s.cars.map(car=>car.laps))}));}
    if(s.cars.every(car=>!car.alive))finalCars=s.cars.map(car=>summarizeCar(car,s.track.pixelsPerMeter||1));
  };
  for(let index=0;index<generations;index++){
    const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks++<60000)sim.tick();
    if(sim.generation===generation)throw Error(`${label}: natural-generation guard reached; no forced update`);
    if(!finalCars)throw Error(`${label}: final physical outcomes were not captured`);
    const row=summarizeHistory(sim.history.at(-1),sim.track.pixelsPerMeter||1,finalCars);
    row.ticks=ticks;row.frontierOffspring=sim.lastFrontierOffspringCount??0;row.practiceEvaluations=sim.practiceEvaluations??0;
    history.push(row);finishedCars.push(finalCars);finalCars=null;
    console.log('SAVED_REWARD_AB_GENERATION '+JSON.stringify({variant:label,...row,cars:undefined}));
  }
  return {label,appVersion:'5.6.0',model:'V3',circuit:'Monza',savedGeneration:state.generation,population:state.population,
    mutation:state.mutation,seed:state.seed,rewardRevision:revision,historyReset:true,sourceHashes,history,finishedCars};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(!fs.existsSync(savePath))throw Error('The supplied save is missing; no fallback save is selected');
  if(fs.existsSync(out))throw Error('Refusing to overwrite a previous saved-model A/B report');
  const original=fs.readFileSync(savePath),saveSha=sha(original),file=await Progress.decode(original.toString('utf8'),'5.6.0'),
    data=Legacy.tagV3(require(path.join(root,'outputs/data/connectome.json'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    descriptor=new F.Simulation(data,{modelId:'v3',population:file.payload.workers[0].state.population,circuitId:'monza',circuits});
  Progress.validatePayload(file.payload,{graph:descriptor.graph,circuits:descriptor.circuits});
  const state=file.payload.workers[0].state;
  if(file.payload.modelId!=='v3'||file.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.rewardRevision!==Rewards.LEGACY_REVISION)
    throw Error('The supplied V3/Monza gen64 progress-3 save did not match the expected verified identity');
  const generations=3,baseline=await run('unchanged-progress-3',file.payload,Rewards.LEGACY_REVISION,generations),
    treatment=await run('isolated-progress-4-brake-lock',file.payload,Rewards.REVISION,generations);
  const firstA=baseline.finishedCars[0].map(({id,progressM,laps,reason})=>({id,progressM,laps,reason})),
    firstB=treatment.finishedCars[0].map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}));
  const firstPhysicalGenerationMatched=JSON.stringify(firstA)===JSON.stringify(firstB),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const gpu=Cuda.stats();
  if(!firstPhysicalGenerationMatched)throw Error('The matched physical first-generation check failed');
  if(!saveUnchanged)throw Error('Original save checksum changed during read-only A/B');
  if(gpu.gpuCalls===0||gpu.cpuFallbacks!==0)throw Error('CUDA execution failed or used CPU fallback');
  const report={format:'male-cns-saved-v3-brake-lock-reward-migration-ab-v1',appVersion:file.appVersion,passed:saveUnchanged&&firstPhysicalGenerationMatched,
    learningSucceeded:treatment.history.some(row=>row.maxLaps>=2),settings:{model:'v3',circuit:'monza',seed:state.seed,savedGeneration:state.generation,
      population:state.population,mutation:state.mutation,naturalGenerations:generations,baseRewardRevision:Rewards.LEGACY_REVISION,
      treatmentRewardRevision:Rewards.REVISION},save:{sha256:saveSha,unchanged:saveUnchanged,format:file.format},
    firstPhysicalGenerationMatched,baseline,treatment,comparison:{bestProgressDeltaByGeneration:treatment.history.map((row,index)=>row.bestProgressM-baseline.history[index].bestProgressM),
      lapDeltaByGeneration:treatment.history.map((row,index)=>row.maxLaps-baseline.history[index].maxLaps),
      treatmentNotPromoted:true},
    gpu,boundary:'Three natural generations from the exact decoded saved worker, using the verified CUDA dense pass on the RTX 4060 with no CPU fallback. The original file is never modified. Both branches use disposable in-memory copies and the history-only reset; the treatment alone receives the current reward revision. This is an isolated reward-revision experiment, not proof of convergence or a two-lap model. No app build, user save, version, tag or release is changed.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('SAVED_REWARD_AB_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,
    firstPhysicalGenerationMatched,baseline:baseline.history.map(row=>({generation:row.generation,bestProgressM:row.bestProgressM,maxLaps:row.maxLaps,brakeLockEpisodes:row.brakeLockEpisodes,stallPenaltyBest:row.stallPenaltyBest})),
    treatment:treatment.history.map(row=>({generation:row.generation,bestProgressM:row.bestProgressM,maxLaps:row.maxLaps,brakeLockEpisodes:row.brakeLockEpisodes,stallPenaltyBest:row.stallPenaltyBest})),gpu,
    output:path.join(out,'report.json')}));
  Dense.step=originalDenseStep;Cuda.close();
}
main().catch(error=>{Dense.step=originalDenseStep;Cuda.close();console.error(error.stack||error);process.exitCode=1;});
