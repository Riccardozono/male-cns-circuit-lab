'use strict';
// Paired cold-start test: same V3/Monza seeds and population, but 20 Hz motor
// decisions with half as many connectome iterations per decision (same 40 Hz
// neural integration budget as the 10 Hz baseline).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/learning-ml/v3-coldstart-reaction-rate-20261021-01');
const F=require(path.join(root,'outputs/simulation.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),POPULATION=8,GENERATIONS=12,SEEDS=[7717,1847];
const circuits=require(path.join(root,'outputs/data/circuits.json')),compact=require(path.join(root,'outputs/data/connectome.json'));
function sourceHashes(){return Object.fromEntries(['simulation.js','neural-learning.js','dense-neural.js','rewards.js','vehicle-992.js'].map(f=>[f,sha(fs.readFileSync(path.join(root,'outputs',f)))]));}
function runArm(seed,interval,iterations){
  const data=Legacy.tagV3(compact),sim=new F.Simulation(data,{modelId:'v3',population:POPULATION,mutation:.16,seed,circuits,circuitId:'monza'}),
    originalSpawn=sim.spawn,originalDenseStep=Dense.step,history=[];let currentTerminal=null;
  sim.onTrialTick=s=>{if(s.cars.every(car=>!car.alive))currentTerminal=s.cars.map(car=>({id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,
    reason:car.reason,safe:F.isSafeLearningOutcome(car),fitness:car.fitness}));};
  if(interval!==6){
    Dense.step=(graph,brain,_iterations,edgesEnabled,gains)=>originalDenseStep(graph,brain,iterations,edgesEnabled,gains);
    sim.spawn=function(genomes,rebase){const result=originalSpawn.call(this,genomes,rebase);this.neuralInterval=interval;return result;};
    sim.neuralInterval=interval;
  }
  const initialHashes=sim.cars.map(car=>sha(JSON.stringify(car.genome.policyWeights))),started=performance.now();
  try{
    for(let index=0;index<GENERATIONS;index++){
      const generation=sim.generation;let ticks=0;currentTerminal=null;
      while(sim.generation===generation&&ticks<60000){sim.tick();ticks++;}
      if(sim.generation===generation||!currentTerminal||currentTerminal.length!==POPULATION)throw Error(`seed ${seed} interval ${interval}: generation did not terminate naturally`);
      const safe=currentTerminal.filter(car=>car.safe),row={generation,bestProgressM:Math.max(...currentTerminal.map(car=>car.progressM)),
        bestSafeProgressM:safe.length?Math.max(...safe.map(car=>car.progressM)):null,maxLaps:Math.max(...currentTerminal.map(car=>car.laps)),
        maxSafeLaps:safe.length?Math.max(...safe.map(car=>car.laps)):0,meanProgressM:currentTerminal.reduce((sum,car)=>sum+car.progressM,0)/POPULATION,
        safeCount:safe.length,terminalReasonCounts:currentTerminal.reduce((counts,car)=>(counts[car.reason]=(counts[car.reason]||0)+1,counts),{}),ticks,
        optimizerUpdates:sim.optimizer.updates,meanExploration:sim.optimizer.metrics().meanExploration};
      history.push(row);console.log('V3_COLDSTART_RATE_GENERATION '+JSON.stringify({seed,intervalHz:60/interval,iterationsPerDecision:interval===6?4:iterations,...row}));
    }
  }finally{Dense.step=originalDenseStep;}
  const lastFive=history.slice(-5).map(row=>row.bestSafeProgressM??row.bestProgressM).sort((a,b)=>a-b),median=lastFive[Math.floor(lastFive.length/2)];
  return {seed,controlRateHz:60/interval,iterationsPerDecision:interval===6?4:iterations,initialPopulationGenomesUnique:new Set(initialHashes).size,
    history,medianBestSafeProgressLast5M:median,maxLaps:Math.max(...history.map(row=>row.maxLaps)),maxSafeLaps:Math.max(...history.map(row=>row.maxSafeLaps)),
    wallSeconds:(performance.now()-started)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite a previous cold-start cadence comparison');
  const hashesBefore=sourceHashes(),baseline=[],treatment=[];
  for(const seed of SEEDS){baseline.push(runArm(seed,6,4));treatment.push(runArm(seed,3,2));}
  const hashesAfter=sourceHashes(),sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter),comparisons=SEEDS.map((seed,index)=>({seed,
    baselineMedianM:baseline[index].medianBestSafeProgressLast5M,treatmentMedianM:treatment[index].medianBestSafeProgressLast5M,
    deltaM:treatment[index].medianBestSafeProgressLast5M-baseline[index].medianBestSafeProgressLast5M,
    baselineMaxLaps:baseline[index].maxLaps,treatmentMaxLaps:treatment[index].maxLaps}));
  const report={format:'male-cns-v3-coldstart-reaction-rate-ab-v1',appVersion:'5.6.0',passed:sourcesUnchanged,
    learningSucceeded:treatment.some(run=>run.maxSafeLaps>=1),settings:{model:'V3',circuit:'Monza',seeds:SEEDS,population:POPULATION,naturalGenerations:GENERATIONS,mutation:.16,
      baseline:{controlRateHz:10,physicsHz:60,connectomeIterationsPerDecision:4,iterationsPerSimulationSecond:40},
      treatment:{controlRateHz:20,physicsHz:60,connectomeIterationsPerDecision:2,iterationsPerSimulationSecond:40},coldStart:true,imports:false},
    sourceHashes:hashesBefore,sourcesUnchanged,baseline,treatment,comparisons,
    method:'Paired fresh-initialized V3 runs with identical source, seed, population, mutation, track, physics and 40 connectome iterations per simulated second. Treatment halves iterations per decision while doubling action/sensor refresh frequency. Full populations finish naturally for 12 generations; no saved weights, route cue, action override or altered reward.',
    boundary:'A small two-seed CPU study only. A favorable result still needs independent seeds, longer training, full-lap verification and later other models/circuits before any production change. No app source, save, version, release, portable or installer is changed.'};
  if(!sourcesUnchanged)throw Error('A source file changed while the paired study was running');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_COLDSTART_RATE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,comparisons,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
