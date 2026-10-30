'use strict';
// Natural continuation of every population in the user's original V3/Monza save.
// CPU-only, read-only with respect to the save and production source files.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-all-workers-3gen-20261022-01');
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing all-worker benchmark');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0');
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||decoded.payload.workers.length!==5)
    throw Error('Expected the original five-worker V3/Monza save');
  const beforeSources=sourceHashes(),connectome=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const records=[];
  for(let workerIndex=0;workerIndex<decoded.payload.workers.length;workerIndex++){
    const state=structuredClone(decoded.payload.workers[workerIndex].state);
    if(state.population!==40||!Number.isInteger(state.generation)||!Number.isInteger(state.seed)||state.rewardRevision!=='progress-3')
      throw Error(`Unexpected saved worker ${workerIndex} identity or reward revision`);
    const sim=new F.Simulation(Legacy.tagV3(JSON.parse(JSON.stringify(connectome))),{
      modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed
    });
    if(workerIndex===0)P.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
    P.restore(sim,state);sim.running=true;
    const startingGeneration=sim.generation;
    const startingFrontierM=(Number(sim.safeLearningFrontier?.progress)||0)/(sim.track.pixelsPerMeter||1);
    const generationRows=[];
    console.log(`ALL_WORKERS_START ${JSON.stringify({worker:workerIndex,generation:startingGeneration,seed:state.seed,population:state.population,startingFrontierM})}`);
    for(let offset=0;offset<3;offset++){
      const targetGeneration=sim.generation+1,terminal=new Map();let ticks=0;
      sim.onTrialTick=s=>{
        if(s.cars.every(car=>!car.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{
          id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,
          bestLapTime:Number.isFinite(car.bestLapTime)?car.bestLapTime:null,fitness:car.fitness,
          reason:car.reason||'',safe:F.isSafeLearningOutcome(car),outputs:Array.isArray(car.outputs)?car.outputs.slice():[]
        });
      };
      while(sim.generation<targetGeneration&&ticks<60000){sim.tick();ticks++;}
      if(sim.generation!==targetGeneration||terminal.size!==state.population)
        throw Error(`Worker ${workerIndex} generation ${targetGeneration-1} failed to terminate all ${state.population} agents (ticks=${ticks}, terminal=${terminal.size})`);
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(row=>row.safe);
      const bestSafe=safe.slice().sort((a,b)=>b.laps-a.laps||b.progressM-a.progressM||b.fitness-a.fitness)[0]||null;
      const history=sim.history.at(-1);
      generationRows.push({generation:history.generation,ticks,safeAgentCount:safe.length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(row=>row.progressM)):null,
        maxSafeLaps:safe.length?Math.max(...safe.map(row=>row.laps)):0,
        bestSafeLapTime:safe.reduce((best,row)=>row.bestLapTime!==null?Math.min(best,row.bestLapTime):best,Infinity)===Infinity?null:
          safe.reduce((best,row)=>row.bestLapTime!==null?Math.min(best,row.bestLapTime):best,Infinity),
        bestSafe,meanProgressM:history.meanProgress/(sim.track.pixelsPerMeter||1),
        stagnation:history.stagnation,mutationAmount:history.mutationAmount,
        unsafeCount:outcomes.length-safe.length,crashCount:outcomes.filter(row=>row.reason==='urto').length,
        outcomes});
      const row=generationRows.at(-1);
      console.log(`ALL_WORKERS_GENERATION ${JSON.stringify({worker:workerIndex,generation:row.generation,bestSafeProgressM:row.bestSafeProgressM,maxSafeLaps:row.maxSafeLaps,safeAgentCount:row.safeAgentCount,unsafeCount:row.unsafeCount,crashCount:row.crashCount,stagnation:row.stagnation})}`);
    }
    records.push({worker:workerIndex,startGeneration:startingGeneration,seed:state.seed,population:state.population,
      rewardRevision:state.rewardRevision,startingFrontierM,generations:generationRows});
    sim.running=false;
  }
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,afterSources=sourceHashes();
  const sourcesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources);
  const maxSafeLaps=Math.max(...records.flatMap(worker=>worker.generations.map(row=>row.maxSafeLaps)));
  const bestSafeProgressM=Math.max(...records.flatMap(worker=>worker.generations.map(row=>row.bestSafeProgressM||0)));
  const report={format:'male-cns-saved-v3-all-workers-three-generation-baseline-v1',appVersion:'5.6.0',
    passed:saveUnchanged&&sourcesUnchanged&&records.length===5&&records.every(worker=>worker.generations.length===3),
    learningSucceeded:maxSafeLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',workers:records.length,
      populationPerWorker:40,rewardRevision:'progress-3'},runtime:'Node 24.19.0 CPU-only',settings:{naturalGenerationsPerWorker:3,allSavedGenomesAndOptimizerStatesRestored:true},
    summary:{workerGenerations:records.reduce((sum,worker)=>sum+worker.generations.length,0),bestSafeProgressM,maxSafeLaps,
      workersWithAnyLap:records.filter(worker=>worker.generations.some(row=>row.maxSafeLaps>0)).length},
    workers:records,sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourcesUnchanged},
    method:'Restores each of the five actual saved V3/Monza worker states, including its RNG, 40 genomes, optimizer mean/sigma/counters and historical reward revision. Advances three natural full-population generations per worker with the current production simulation on CPU. No reward migration, decoder change, route cue, teacher signal, physical intervention, or cross-worker genome exchange.',
    boundary:'Five worker populations from one historical save/seed family on Monza only. This continuation is a baseline, not a controlled intervention or proof of generalization. It does not write the user save, app version, release, tag or production source.'};
  if(!report.passed)throw Error('All-worker benchmark integrity or preservation check failed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log(`ALL_WORKERS_RESULT ${JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,bestSafeProgressM,maxSafeLaps,workers:records.map(worker=>({worker:worker.worker,seed:worker.seed,generations:worker.generations.map(row=>({generation:row.generation,bestSafeProgressM:row.bestSafeProgressM,maxSafeLaps:row.maxSafeLaps}))})),report:path.join(out,'report.json')})}`);
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
