'use strict';
// Paired diagnostic for the missing saved global champion in worker 4.
// CPU-only; restores an exact copy of the user's save and never writes to it.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-worker4-global-champion-ab-20261022-01');
const F=require(path.join(root,'outputs/simulation.js'));
const P=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['desktop/engine.cjs','outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));

function runBranch(name,sourceState,genome){
  const state=structuredClone(sourceState);
  if(genome)state.externalChampion=F.cloneGenome(genome);
  const connectome=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const sim=new F.Simulation(Legacy.tagV3(connectome),{modelId:'v3',population:state.population,
    circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,state);sim.running=true;
  const startGeneration=sim.generation,rows=[];
  for(let offset=0;offset<3;offset++){
    const target=sim.generation+1,terminal=new Map();let ticks=0;
    sim.onTrialTick=s=>{
      if(s.cars.every(car=>!car.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{
        id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,
        bestLapTime:Number.isFinite(car.bestLapTime)?car.bestLapTime:null,fitness:car.fitness,
        safe:F.isSafeLearningOutcome(car),reason:car.reason||''
      });
    };
    while(sim.generation<target&&ticks<60000){sim.tick();ticks++;}
    if(sim.generation!==target||terminal.size!==state.population)throw Error(name+' generation failed to finish');
    const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe);
    const bestSafe=safe.slice().sort((a,b)=>b.laps-a.laps||b.progressM-a.progressM||b.fitness-a.fitness)[0]||null;
    const history=sim.history.at(-1);
    rows.push({generation:history.generation,ticks,safeAgentCount:safe.length,
      bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.progressM)):null,
      maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,bestSafe,
      unsafeCount:outcomes.length-safe.length,crashCount:outcomes.filter(x=>x.reason==='urto').length,
      immigrantCount:history.immigrantCount,stagnation:history.stagnation,outcomes});
  }
  sim.running=false;
  return {name,startGeneration,seed:state.seed,initialExternalChampionHash:state.externalChampion?sha(JSON.stringify(state.externalChampion)):null,generations:rows};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing paired benchmark');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes);
  const decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0');
  const payload=decoded.payload;
  if(payload.modelId!=='v3'||payload.circuitId!=='monza'||payload.workers.length!==5)throw Error('Unexpected source save');
  const state=payload.workers[4].state,global=payload.globalChampion?.genome;
  if(!global||state.externalChampion!==null)throw Error('Expected worker 4 without the persisted global champion');
  const validationData=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const validationSim=new F.Simulation(validationData,{modelId:'v3',population:state.population,circuitId:'monza',circuits});
  P.validatePayload(payload,{graph:validationSim.graph,circuits:validationSim.circuits});
  const matchesSavedGenome=state.genomes.some(g=>sha(JSON.stringify(g))===sha(JSON.stringify(global)));
  const before=sourceHashes();
  const control=runBranch('control-no-global-champion',state,null);
  const treatment=runBranch('restore-global-champion-slot-2',state,global);
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,after=sourceHashes();
  const sourcesUnchanged=JSON.stringify(before)===JSON.stringify(after);
  const report={format:'male-cns-saved-v3-worker4-global-champion-paired-ab-v1',appVersion:'5.6.0',
    passed:saveUnchanged&&sourcesUnchanged&&control.generations.length===3&&treatment.generations.length===3,
    learningSucceeded:Math.max(...control.generations.map(x=>x.maxSafeLaps),...treatment.generations.map(x=>x.maxSafeLaps))>=2,
    save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',worker:4,startGeneration:state.generation,
      population:state.population,rewardRevision:state.rewardRevision,globalChampionWorker:payload.globalChampion.workerIndex,
      globalChampionStats:payload.globalChampion.stats,globalChampionGenomeSha256:sha(JSON.stringify(global)),
      savedWorkerExternalChampionWasNull:true,globalChampionAlreadyInSavedPopulation:matchesSavedGenome},
    runtime:'Node 24.19.0 CPU-only',design:'Matched two-branch replay from identical worker-4 checkpoint, RNG and optimizer. Treatment restores the saved global champion as the app’s reserved external-champion candidate; control preserves the checkpoint as saved. Three natural full-population generations per branch; no decoder/reward/physics changes and no writes to the save.',
    branches:{control,treatment},sourceHashes:{before,after,unchanged:sourcesUnchanged},
    interpretation:'This isolates the effect of initializing worker 4 with the missing global champion. It is not a full five-worker concurrent replay and does not establish app-wide convergence.'};
  if(!report.passed)throw Error('Paired benchmark preservation or completion check failed');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('WORKER4_CHAMPION_AB '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
    globalChampionAlreadyInSavedPopulation:matchesSavedGenome,control:control.generations.map(x=>({generation:x.generation,bestSafeProgressM:x.bestSafeProgressM,maxSafeLaps:x.maxSafeLaps})),
    treatment:treatment.generations.map(x=>({generation:x.generation,bestSafeProgressM:x.bestSafeProgressM,maxSafeLaps:x.maxSafeLaps})),
    saveUnchanged,sourcesUnchanged,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
