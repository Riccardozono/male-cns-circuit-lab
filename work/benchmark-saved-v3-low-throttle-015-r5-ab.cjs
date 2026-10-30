'use strict';
// In-memory diagnostic: current R5 vs R5 plus a sustained low-throttle stall
// cost at gas <= 0.15. No production source or user save is modified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.resolve(root,'.impeccable/review/learning-ml/saved-v3-low-throttle-015-r5-ab-cuda-20261022-01');
const THROTTLE_LIMIT=.15;
const Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs'),originalDenseStep=Dense.step;
Dense.step=(...args)=>Cuda.pass(...args);
let penaltyEnabled=false;
const rewardPath=require.resolve(path.join(root,'outputs/rewards.js')),BaseRewards=require(rewardPath);
const ExperimentalRewards=Object.freeze({...BaseRewards,step(track,car,context){
  const s=car.rewardState,dt=Number(context?.dt)||0,ppm=track.pixelsPerMeter||1,
    distance=Math.hypot(car.x-Number(s?.x),car.y-Number(s?.y)),
    speed=Math.abs(car.vehicle?.speedMps??car.speed??0),throttle=Number(car.outputs?.[1])||0,brake=Number(car.outputs?.[2])||0,
    eligible=penaltyEnabled&&car.rewardRevision===BaseRewards.REVISION&&!!s&&s.highWater>20*ppm&&
      context?.onRoad===true&&!context?.collision&&speed<BaseRewards.RULES.brakeLockSpeedFloorMps&&
      throttle<=THROTTLE_LIMIT&&brake<=.05&&dt>0&&distance/dt<=BaseRewards.RULES.brakeLockMotionMps,
    oldSeconds=Number(s?.lowThrottleSeconds)||0;
  const result=BaseRewards.step(track,car,context);
  if(!s)return result;
  s.lowThrottleSeconds=eligible?oldSeconds+dt:0;
  if(eligible&&s.lowThrottleSeconds>BaseRewards.RULES.brakeLockGraceSeconds){
    const charged=Math.max(0,s.lowThrottleSeconds-BaseRewards.RULES.brakeLockGraceSeconds)-Math.max(0,oldSeconds-BaseRewards.RULES.brakeLockGraceSeconds),
      amount=BaseRewards.RULES.brakeLockPenaltyPerSecond*charged;
    if(amount>0&&car.rewardBreakdown?.penalties){
      car.rewardBreakdown.penalties.stall+=amount;car.penalty+=amount;car.lastPenalty=amount;
      car.lowThrottlePenalty=(car.lowThrottlePenalty||0)+amount;car.fitness=car.reward-car.penalty;car.baseFitness-=amount;
    }
  }
  return result;
}});
require.cache[rewardPath].exports=ExperimentalRewards;
const F=require(path.join(root,'outputs/simulation.js')),Progress=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function summarizeCar(car,ppm){return {id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason,fitness:car.fitness,
  stallPenalty:car.rewardBreakdown.penalties.stall,lowThrottlePenalty:car.lowThrottlePenalty||0,
  lowThrottleSeconds:car.rewardState.lowThrottleSeconds||0,gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0};}
function summarizeHistory(row,ppm,cars){return {generation:row.generation,bestProgressM:row.bestProgress/ppm,meanProgressM:row.meanProgress/ppm,
  maxLaps:row.maxLaps,noLapCount:row.noLapCount,slowerLapCount:row.slowerLapCount,rewardRevision:row.rewardRevision,
  lowThrottleEpisodes:cars.filter(car=>car.lowThrottlePenalty>0).length,
  lowThrottlePenaltyTotal:cars.reduce((sum,car)=>sum+car.lowThrottlePenalty,0),cars};}
async function run(label,payload,generations,applyPenalty){
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),
    circuits=require(path.join(root,'outputs/data/circuits.json')),
    sim=new F.Simulation(data,{modelId:'v3',population:payload.workers[0].state.population,circuitId:'monza',circuits}),
    state=structuredClone(payload.workers[0].state);
  state.history=[];state.rewardRevision=ExperimentalRewards.REVISION;Progress.restore(sim,state);
  sim.rewardRevision=ExperimentalRewards.REVISION;for(const car of sim.cars)car.rewardRevision=ExperimentalRewards.REVISION;
  penaltyEnabled=applyPenalty;sim.running=true;
  const history=[],finishedCars=[];let finalCars=null,lastProgress=performance.now();
  sim.onTrialTick=s=>{
    if(performance.now()-lastProgress>20000){lastProgress=performance.now();console.log('LOW_THROTTLE_015_PROGRESS '+JSON.stringify({variant:label,
      generation:s.generation,alive:s.cars.filter(car=>car.alive).length,bestProgressM:Math.max(...s.cars.map(car=>car.bestProgress))/(s.track.pixelsPerMeter||1),
      maxLaps:Math.max(...s.cars.map(car=>car.laps))}));}
    if(s.cars.every(car=>!car.alive))finalCars=s.cars.map(car=>summarizeCar(car,s.track.pixelsPerMeter||1));
  };
  try{
    for(let index=0;index<generations;index++){
      const generation=sim.generation;let ticks=0;
      while(sim.generation===generation&&ticks++<60000)sim.tick();
      if(sim.generation===generation)throw Error(`${label}: natural-generation guard reached; no forced evolve`);
      if(!finalCars||finalCars.length!==state.population)throw Error(`${label}: generation outcomes missing`);
      const row=summarizeHistory(sim.history.at(-1),sim.track.pixelsPerMeter||1,finalCars);
      row.ticks=ticks;row.frontierOffspring=sim.lastFrontierOffspringCount??0;row.practiceEvaluations=sim.practiceEvaluations??0;
      history.push(row);finishedCars.push(finalCars);finalCars=null;
      console.log('LOW_THROTTLE_015_GENERATION '+JSON.stringify({variant:label,...row,cars:undefined}));
    }
  }finally{sim.running=false;penaltyEnabled=false;}
  const sourceHashes=Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js']
    .map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
  return {label,appVersion:'5.6.0',model:'V3',circuit:'Monza',savedGeneration:state.generation,
    population:state.population,seed:state.seed,rewardRevision:ExperimentalRewards.REVISION,historyReset:true,
    experimentalPenaltyEnabled:applyPenalty,sourceHashes,history,finishedCars};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(!fs.existsSync(savePath))throw Error('Supplied save missing; no fallback save selected');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing report');
  const original=fs.readFileSync(savePath),saveSha=sha(original),file=await Progress.decode(original.toString('utf8'),'5.6.0'),
    data=Legacy.tagV3(require(path.join(root,'outputs/data/connectome.json'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    descriptor=new F.Simulation(data,{modelId:'v3',population:file.payload.workers[0].state.population,circuitId:'monza',circuits}),
    state=file.payload.workers[0].state;
  Progress.validatePayload(file.payload,{graph:descriptor.graph,circuits:descriptor.circuits});
  if(file.payload.modelId!=='v3'||file.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.rewardRevision!==BaseRewards.LEGACY_REVISION)
    throw Error('Exact V3/Monza gen64 progress-3 save required');
  const generations=3,baseline=await run('current-r5',file.payload,generations,false),
    treatment=await run('current-r5-plus-low-throttle-stall-cost',file.payload,generations,true);
  const physical=arm=>arm.finishedCars.map(row=>row.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))),
    firstPhysicalGenerationMatched=JSON.stringify(physical(baseline)[0])===JSON.stringify(physical(treatment)[0]),
    saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,gpu=Cuda.stats();
  if(!firstPhysicalGenerationMatched||!saveUnchanged||gpu.gpuCalls===0||gpu.cpuFallbacks!==0)
    throw Error('Physical pairing, original-save integrity, or CUDA verification failed');
  const report={format:'male-cns-v3-low-throttle-015-reward-ab-v1',passed:true,
    learningSucceeded:treatment.history.some(row=>row.maxLaps>=2),oneLapSucceeded:treatment.history.some(row=>row.maxLaps>=1),
    settings:{generations,sameSeed:state.seed,population:state.population,startGeneration:state.generation,baseRevision:ExperimentalRewards.REVISION,
      experimentalPenaltyPerSecond:BaseRewards.RULES.brakeLockPenaltyPerSecond,experimentalGraceSeconds:BaseRewards.RULES.brakeLockGraceSeconds,
      throttleLimit:THROTTLE_LIMIT,eligibility:'after 20 m safe high-water; on road; no collision; speed <0.6 m/s; gas <=0.15; brake <=0.05; displacement <=0.5 m/s'},
    save:{sha256:saveSha,unchanged:saveUnchanged},firstPhysicalGenerationMatched,baseline,treatment,gpu,
    comparison:{bestProgressDeltaByGeneration:treatment.history.map((row,index)=>row.bestProgressM-baseline.history[index].bestProgressM),
      lapDeltaByGeneration:treatment.history.map((row,index)=>row.maxLaps-baseline.history[index].maxLaps),
      physicalOutcomesEqualByGeneration:physical(baseline).map((rows,index)=>JSON.stringify(rows)===JSON.stringify(physical(treatment)[index]))},
    boundary:'Three natural generations from matched in-memory copies of the exact supplied V3 save. Both branches use current R5; treatment only adds a sustained low-throttle/no-brake near-stall cost with a 0.15 gas threshold. Verified CUDA dense pass with no CPU fallback. Diagnostic hypothesis only; no production source, application, save, version, tag, or release is modified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('LOW_THROTTLE_015_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,oneLapSucceeded:report.oneLapSucceeded,
    baseline:baseline.history.map(row=>({generation:row.generation,bestProgressM:row.bestProgressM,maxLaps:row.maxLaps})),
    treatment:treatment.history.map(row=>({generation:row.generation,bestProgressM:row.bestProgressM,maxLaps:row.maxLaps,
      lowThrottleEpisodes:row.lowThrottleEpisodes,lowThrottlePenaltyTotal:row.lowThrottlePenaltyTotal})),
    physicalOutcomesEqualByGeneration:report.comparison.physicalOutcomesEqualByGeneration,gpu,report:path.join(out,'report.json')}));
  Dense.step=originalDenseStep;Cuda.close();
}
main().catch(error=>{Dense.step=originalDenseStep;Cuda.close();console.error(error.stack||error);process.exitCode=1;});
process.once('beforeExit',()=>{Dense.step=originalDenseStep;const stats=Cuda.stats();console.log('LOW_THROTTLE_015_CUDA '+JSON.stringify(stats));Cuda.close();});
