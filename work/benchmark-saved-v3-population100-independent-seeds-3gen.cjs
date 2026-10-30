'use strict';
// Two paired independent evolution-RNG replications of the V3/Monza 40-vs-100
// population experiment. Starts each arm from the exact protected gen64 save.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-population100-independent-seeds-3gen-20261023-01');
const F=require(path.join(root,'outputs/simulation.js'));
const Progress=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hashSources=()=>Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'].map(file=>
  [file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));

function runArm(decoded,circuitsJson,evolutionSeed,population){
  const state=structuredClone(decoded.payload.workers[0].state);
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const circuits=JSON.parse(JSON.stringify(circuitsJson));
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  Progress.restore(sim,state);
  if(sim.generation!==64||sim.cars.length!==40||sim.population!==40)throw Error('Expected the exact saved gen64 state with 40 live agents');
  // Keep the restored policies, physics, optimizer and checkpoint state, while
  // giving each paired replication a controlled independent evolution stream.
  sim.random=F.rng(evolutionSeed);
  if(population===100)sim.population=100;
  const startPopulation=sim.cars.length,startGeneration=sim.generation,targetGeneration=67,perGeneration=[];
  let terminal=null,ticks=0,lastLog=performance.now();
  const runStart=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,
      reason:c.reason||'',safe:F.isSafeLearningOutcome(c),fitness:c.fitness,lapTimes:c.lapTimes.slice()})).sort((a,b)=>a.id-b.id);
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('V3_POP100_REPLICA_PROGRESS '+JSON.stringify({evolutionSeed,population,generation:s.generation,ticks,alive:s.cars.filter(c=>c.alive).length,completed:perGeneration.length}));}
  };
  while(sim.generation<targetGeneration&&ticks<180000&&performance.now()-runStart<720000){
    const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){
      const summary=sim.history.at(-1),safe=(terminal||[]).filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      const record={generation:before,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...(terminal||[]).map(c=>c.laps)),
        completedLapCount:(terminal||[]).reduce((sum,c)=>sum+c.laps,0),reasonCounts:sortedCounts((terminal||[]).reduce((counts,c)=>(counts[c.reason]=(counts[c.reason]||0)+1,counts),{})),
        evaluatedPopulation:terminal?.length??0,nextPopulation:sim.cars.length,stagnation:summary?.stagnation??null,
        bestLapTime:summary?.bestLapTime??null,meanProgressM:summary?.meanProgress??null,fitnessBest:summary?.best??null,
        learning:summary?.learning??null,frontierDiagnostics:structuredClone(sim.lastFrontierDiagnostics||null)};
      perGeneration.push(record);
      console.log('V3_POP100_REPLICA_GEN '+JSON.stringify({evolutionSeed,population,generation:before,
        leader:record.leader&&{id:record.leader.id,progressM:record.leader.progressM},safe:record.safeAgentCount,laps:record.maxLaps,
        evaluatedPopulation:record.evaluatedPopulation,nextPopulation:record.nextPopulation}));
      terminal=null;
    }
  }
  if(sim.generation!==targetGeneration||perGeneration.length!==3)throw Error(`Seed ${evolutionSeed}, population ${population}: did not finish three natural generations`);
  sim.running=false;
  return {evolutionSeed,population,startPopulation,startGeneration,targetGeneration,seedStoredInSave:state.seed,rngStateStoredInSave:state.rngState,
    ticks,elapsedMs:Math.round(performance.now()-runStart),perGeneration,overall:{bestSafeProgressM:Math.max(...perGeneration.map(g=>g.leader?.progressM??0)),
      finalSafeProgressM:perGeneration.at(-1).leader?.progressM??0,finalSafeAgentCount:perGeneration.at(-1).safeAgentCount,
      maxLaps:Math.max(...perGeneration.map(g=>g.maxLaps))}};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const previous=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-population100-current-source-5gen-20261023-01/report.json'),'utf8'));
  const hashesBefore=hashSources();
  if(!previous.passed||!previous.save?.unchanged||previous.save?.savedPopulation!==40||
     previous.sourceHashes?.before?.['simulation.js']!==hashesBefore['simulation.js'])throw Error('Verified current-source 40-vs-100 baseline required');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||
     state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||previous.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza gen64 checkpoint required');
  const circuits=require(path.join(root,'outputs/data/circuits.json'));
  const seeds=[20261023,20261024],replications=[];
  for(const evolutionSeed of seeds){
    console.log('V3_POP100_REPLICA_START '+JSON.stringify({evolutionSeed,populations:[40,100],generations:3,saveSha256:saveSha}));
    const control=runArm(decoded,circuits,evolutionSeed,40);
    const treatment=runArm(decoded,circuits,evolutionSeed,100);
    const generation64Matches=control.perGeneration[0].leader?.id===treatment.perGeneration[0].leader?.id&&
      Math.abs((control.perGeneration[0].leader?.progressM??-1)-(treatment.perGeneration[0].leader?.progressM??-1))<1e-9&&
      control.perGeneration[0].safeAgentCount===treatment.perGeneration[0].safeAgentCount&&
      control.perGeneration[0].maxLaps===treatment.perGeneration[0].maxLaps&&
      control.perGeneration[0].evaluatedPopulation===40&&treatment.perGeneration[0].evaluatedPopulation===40&&treatment.perGeneration[0].nextPopulation===100;
    if(!generation64Matches)throw Error(`Paired gen64 replay mismatch for evolution RNG seed ${evolutionSeed}`);
    const paired=control.perGeneration.map((c,i)=>{const t=treatment.perGeneration[i];return {generation:c.generation,
      control:{leader:c.leader&&{id:c.leader.id,progressM:c.leader.progressM},safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps},
      treatment:{leader:t.leader&&{id:t.leader.id,progressM:t.leader.progressM},safeAgentCount:t.safeAgentCount,maxLaps:t.maxLaps,
        evaluatedPopulation:t.evaluatedPopulation,nextPopulation:t.nextPopulation},
      safeProgressDeltaM:(t.leader?.progressM??0)-(c.leader?.progressM??0),safeAgentDelta:t.safeAgentCount-c.safeAgentCount,lapDelta:t.maxLaps-c.maxLaps};});
    replications.push({evolutionSeed,generation64Matches,control,treatment,paired});
  }
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,hashesAfter=hashSources(),sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter);
  const allInitialMatches=replications.every(r=>r.generation64Matches);
  const report={format:'male-cns-saved-v3-population100-independent-evolution-seeds-v1',appVersion:'5.6.0',
    passed:Boolean(allInitialMatches&&saveUnchanged&&sourcesUnchanged&&replications.length===2&&replications.every(r=>r.control.perGeneration.length===3&&r.treatment.perGeneration.length===3)),
    learningSucceeded:replications.some(r=>r.treatment.overall.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:40,rewardRevision:state.rewardRevision},
    sourceHashes:{before:hashesBefore,after:hashesAfter,unchanged:sourcesUnchanged},
    settings:{runtime:'Node 24.19.0 CPU-only',replications:replications.length,evolutionRngSeeds:seeds,populationsCompared:[40,100],naturalGenerationsPerArm:3,
      controlRateHz:10,physicsHz:60,noGPU:true,sameSavedCheckpointPerPair:true,populationChangeInMemoryOnly:true},
    replicationSummary:replications.map(r=>({evolutionSeed:r.evolutionSeed,generation64Matches:r.generation64Matches,
      finalSafeProgressDeltaM:r.paired.at(-1).safeProgressDeltaM,finalSafeAgentDelta:r.paired.at(-1).safeAgentDelta,
      treatmentLaps:r.treatment.overall.maxLaps,controlLaps:r.control.overall.maxLaps,
      pairedGenerations:r.paired.map(g=>({generation:g.generation,deltaM:g.safeProgressDeltaM,safeAgentDelta:g.safeAgentDelta}))})),
    replications,
    method:'Two paired replications with distinct evolution RNG seeds (20261023 and 20261024), both starting from the same protected trained V3/Monza gen64 checkpoint. For each seed, 40-agent control and 100-agent treatment use identical random streams within that pair; the saved 40 agents are evaluated unchanged at gen64, and the treatment changes only the in-memory offspring population to 100 before gen65. Each branch completes gen64–66. The exact original checkpoint, source files, physics, rewards, sensors and controller remain untouched.',
    boundary:'Two independent evolution RNG streams but one trained checkpoint, one circuit and only two treated generations per stream. This can test whether the short-term population signal repeats, but cannot establish two-lap completion, cold-start performance or generalization across circuits/models.'};
  if(!saveUnchanged||!sourcesUnchanged)throw Error('Protected save or application source changed during the experiment');
  fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_POP100_REPLICA_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
    replicationSummary:report.replicationSummary,saveUnchanged,sourcesUnchanged,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
  if(!report.passed)process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
