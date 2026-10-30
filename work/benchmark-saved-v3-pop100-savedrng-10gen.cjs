'use strict';
// Ten natural V3/Monza generations at 100 agents, starting from the protected
// gen64 checkpoint with its saved RNG. The paired 40-agent arm is the exact
// current-source control replay already recorded in the same-source AB report.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-pop100-savedrng-10gen-20261023-01');
const F=require(path.join(root,'outputs/simulation.js'));
const Progress=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hashSources=()=>Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'].map(file=>
  [file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const pair=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-combined-frontier-ab-10gen-20261023-01/report.json'),'utf8'));
  const short=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-population100-current-source-5gen-20261023-01/report.json'),'utf8'));
  const hashesBefore=hashSources();
  if(!pair.passed||!short.passed||pair.diskSourceHashes?.before?.['simulation.js']!==hashesBefore['simulation.js']||
     short.sourceHashes?.before?.['simulation.js']!==hashesBefore['simulation.js'])throw Error('Current-source same-checkpoint control references required');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||
     state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||pair.save.sha256!==saveSha||short.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza gen64 checkpoint required');
  const graphData=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(graphData,{modelId:'v3',population:40,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  Progress.restore(sim,state);
  if(sim.population!==40||sim.cars.length!==40)throw Error('Expected the exact 40-car saved state');
  // Keep the checkpoint RNG stream; only enlarge the in-memory offspring pool.
  sim.population=100;sim.running=true;
  const terminalGenerations=10,startGeneration=sim.generation,targetGeneration=startGeneration+terminalGenerations,perGeneration=[];
  let terminal=null,ticks=0,lastLog=performance.now();
  const runStart=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,
      reason:c.reason||'',safe:F.isSafeLearningOutcome(c),fitness:c.fitness,lapTimes:c.lapTimes.slice()})).sort((a,b)=>a.id-b.id);
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('V3_POP100_LONG_PROGRESS '+JSON.stringify({generation:s.generation,ticks,alive:s.cars.filter(c=>c.alive).length,completed:perGeneration.length,population:s.cars.length}));}
  };
  while(sim.generation<targetGeneration&&ticks<300000&&performance.now()-runStart<1800000){
    const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){
      const summary=sim.history.at(-1),safe=(terminal||[]).filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      const record={generation:before,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...(terminal||[]).map(c=>c.laps)),
        completedLapCount:(terminal||[]).reduce((sum,c)=>sum+c.laps,0),reasonCounts:sortedCounts((terminal||[]).reduce((counts,c)=>(counts[c.reason]=(counts[c.reason]||0)+1,counts),{})),
        evaluatedPopulation:terminal?.length??0,nextPopulation:sim.cars.length,stagnation:summary?.stagnation??null,
        bestLapTime:summary?.bestLapTime??null,meanProgressM:summary?.meanProgress??null,fitnessBest:summary?.best??null,
        learning:summary?.learning??null,frontierDiagnostics:structuredClone(sim.lastFrontierDiagnostics||null)};
      perGeneration.push(record);
      console.log('V3_POP100_LONG_GEN '+JSON.stringify({generation:before,leader:record.leader&&{id:record.leader.id,progressM:record.leader.progressM},
        safe:record.safeAgentCount,laps:record.maxLaps,evaluatedPopulation:record.evaluatedPopulation,nextPopulation:record.nextPopulation,stagnation:record.stagnation}));
      terminal=null;
    }
  }
  if(sim.generation!==targetGeneration||perGeneration.length!==terminalGenerations)throw Error(`Expected ten natural generations; completed ${perGeneration.length}`);
  const control=pair.control.perGeneration,shortExpected=short.treatment;
  const initialControlMatches=perGeneration[0].leader?.id===control[0].leader?.id&&Math.abs(perGeneration[0].leader.progressM-control[0].leader.progressM)<1e-9&&
    perGeneration[0].safeAgentCount===control[0].safeAgentCount&&perGeneration[0].maxLaps===control[0].maxLaps&&perGeneration[0].evaluatedPopulation===40;
  const firstFiveMatchShort=perGeneration.slice(0,5).every((actual,index)=>{
    const expected=shortExpected[index];return actual.generation===expected.generation&&actual.leader?.id===expected.leader?.id&&
      Math.abs((actual.leader?.progressM??-1)-(expected.leader?.progressM??-1))<1e-9&&actual.safeAgentCount===expected.safeAgentCount&&
      actual.maxLaps===expected.maxLaps&&JSON.stringify(actual.reasonCounts)===JSON.stringify(sortedCounts(expected.reasonCounts))&&actual.evaluatedPopulation===expected.evaluatedPopulation;
  });
  const paired=perGeneration.map((t,index)=>{const c=control[index];return {generation:t.generation,
    control:{leader:c.leader&&{id:c.leader.id,progressM:c.leader.progressM},safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps},
    treatment:{leader:t.leader&&{id:t.leader.id,progressM:t.leader.progressM},safeAgentCount:t.safeAgentCount,maxLaps:t.maxLaps,evaluatedPopulation:t.evaluatedPopulation},
    safeProgressDeltaM:(t.leader?.progressM??0)-(c.leader?.progressM??0),safeAgentDelta:t.safeAgentCount-c.safeAgentCount,lapDelta:t.maxLaps-c.maxLaps};});
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,hashesAfter=hashSources(),sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter);
  const report={format:'male-cns-saved-v3-population100-saved-rng-ten-generations-v1',appVersion:'5.6.0',
    passed:Boolean(initialControlMatches&&firstFiveMatchShort&&saveUnchanged&&sourcesUnchanged&&perGeneration.length===10),
    learningSucceeded:perGeneration.some(g=>g.maxLaps>=2),save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,
      savedPopulation:40,trainingRngState:state.rngState,rewardRevision:state.rewardRevision},
    sourceHashes:{before:hashesBefore,after:hashesAfter,unchanged:sourcesUnchanged},
    settings:{runtime:'Node 24.19.0 CPU-only',controlPopulation:40,treatmentPopulation:100,naturalGenerations:10,controlRateHz:10,physicsHz:60,
      sameSavedRng:true,populationChangeInMemoryOnly:true,noGPU:true},
    references:{initialGenerationMatchesTenGenerationControl:initialControlMatches,firstFiveGenerationsMatchPrevious100AgentReplay:firstFiveMatchShort},
    control:{overall:{bestSafeProgressM:Math.max(...control.map(g=>g.leader?.progressM??0)),finalSafeProgressM:control.at(-1).leader?.progressM??0,
      maxLaps:Math.max(...control.map(g=>g.maxLaps))},perGeneration:control},
    treatment:{overall:{bestSafeProgressM:Math.max(...perGeneration.map(g=>g.leader?.progressM??0)),finalSafeProgressM:perGeneration.at(-1).leader?.progressM??0,
      finalSafeAgentCount:perGeneration.at(-1).safeAgentCount,maxLaps:Math.max(...perGeneration.map(g=>g.maxLaps)),
      bestLapTime:perGeneration.map(g=>g.bestLapTime).filter(Number.isFinite).sort((a,b)=>a-b)[0]??null},perGeneration},
    pairedComparison:{perGeneration:paired,finalSafeProgressDeltaM:paired.at(-1).safeProgressDeltaM,
      bestSafeProgressDeltaM:Math.max(...perGeneration.map(g=>g.leader?.progressM??0))-Math.max(...control.map(g=>g.leader?.progressM??0)),
      generationsWithBetterSafeProgress:paired.filter(g=>g.safeProgressDeltaM>1).map(g=>g.generation),
      generationsWithWorseSafeProgress:paired.filter(g=>g.safeProgressDeltaM< -1).map(g=>g.generation),
      treatmentLaps:Math.max(...perGeneration.map(g=>g.maxLaps)),controlLaps:Math.max(...control.map(g=>g.maxLaps))},
    method:'Ten natural generations from the exact protected V3/Monza gen64 checkpoint, using its original saved RNG stream. Only the in-memory offspring population changes from 40 to 100 after restoring the saved 40 policies. The control arm is the ten-generation current-source replay from the same checkpoint and RNG; generation64 must match exactly, and generations64–68 must also reproduce the prior deterministic 100-agent report before later outcomes are trusted.',
    boundary:'One trained checkpoint, original saved RNG stream, one circuit and ten generations. This tests whether the initial 100-agent signal persists; it does not establish two-lap completion or transfer to other seeds, models or tracks.'};
  if(!saveUnchanged||!sourcesUnchanged)throw Error('Protected save or application sources changed during the experiment');
  fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_POP100_LONG_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,
    references:report.references,control:report.control.overall,treatment:report.treatment.overall,paired:report.pairedComparison,
    saveUnchanged,sourcesUnchanged,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
  if(!report.passed)process.exitCode=1;
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
