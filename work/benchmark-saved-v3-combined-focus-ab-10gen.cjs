'use strict';
// Paired CPU-only control/treatment replay from the exact protected V3/Monza
// checkpoint. Treatment changes one source expression in memory only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-combined-frontier-ab-10gen-20261023-01');
const simPath=path.join(root,'outputs/simulation.js');
const originalSimulation=fs.readFileSync(simPath,'utf8');
const needle="const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'longitudinal':null;";
if(originalSimulation.split(needle).length!==2)throw Error('Expected exactly one current longitudinal frontier-focus expression');
const treatmentSimulation=originalSimulation.replace(needle,"const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'combined':null;");
const treatmentModule=new Module(simPath,module);
treatmentModule.filename=simPath;
treatmentModule.paths=Module._nodeModulePaths(path.dirname(simPath));
treatmentModule._compile(treatmentSimulation,simPath);
const FControl=require(simPath),FTreatment=treatmentModule.exports;
const Progress=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hashSources=()=>Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'].map(file=>
  [file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));

function makeArm(name,F,decoded,saveSha,circuitsJson){
  const state=structuredClone(decoded.payload.workers[0].state);
  const graphData=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const circuits=JSON.parse(JSON.stringify(circuitsJson));
  const sim=new F.Simulation(graphData,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  Progress.restore(sim,state);sim.running=true;
  const startGeneration=sim.generation,targetGeneration=startGeneration+10,perGeneration=[];
  let terminal=null,ticks=0,lastLog=performance.now();
  const runStart=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,
      reason:c.reason||'',safe:F.isSafeLearningOutcome(c),fitness:c.fitness,lapTimes:c.lapTimes.slice()})).sort((a,b)=>a.id-b.id);
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('V3_AB_PROGRESS '+JSON.stringify({arm:name,generation:s.generation,ticks,alive:s.cars.filter(c=>c.alive).length,completed:perGeneration.length}));}
  };
  while(sim.generation<targetGeneration&&ticks<150000&&performance.now()-runStart<900000){
    const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){
      const summary=sim.history.at(-1),safe=(terminal||[]).filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      const record={generation:before,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...(terminal||[]).map(c=>c.laps)),
        completedLapCount:(terminal||[]).reduce((sum,c)=>sum+c.laps,0),reasonCounts:sortedCounts((terminal||[]).reduce((counts,c)=>(counts[c.reason]=(counts[c.reason]||0)+1,counts),{})),
        bestLapTime:summary?.bestLapTime??null,meanProgressM:summary?.meanProgress??null,fitnessBest:summary?.best??null,
        stagnation:summary?.stagnation??null,mutationAmount:summary?.mutationAmount??null,immigrantCount:summary?.immigrantCount??null,
        learning:summary?.learning??null,frontierDiagnostics:structuredClone(sim.lastFrontierDiagnostics||null)};
      perGeneration.push(record);
      console.log('V3_AB_GENERATION_DONE '+JSON.stringify({arm:name,generation:before,leader:record.leader&&{id:record.leader.id,progressM:record.leader.progressM},safeAgentCount:record.safeAgentCount,
        maxLaps:record.maxLaps,stagnation:record.stagnation,frontier:record.frontierDiagnostics}));
      terminal=null;
    }
  }
  if(sim.generation!==targetGeneration||perGeneration.length!==10)throw Error(`${name}: expected ten complete natural generations, got ${perGeneration.length}`);
  sim.running=false;
  return {name,startGeneration,targetGeneration,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision,ticks,
    elapsedMs:Math.round(performance.now()-runStart),perGeneration,overall:{bestSafeProgressM:Math.max(...perGeneration.map(g=>g.leader?.progressM??0)),
      finalSafeProgressM:perGeneration.at(-1).leader?.progressM??0,finalSafeAgentCount:perGeneration.at(-1).safeAgentCount,
      maxLaps:Math.max(...perGeneration.map(g=>g.maxLaps)),bestLapTime:perGeneration.map(g=>g.bestLapTime).filter(Number.isFinite).sort((a,b)=>a-b)[0]??null},saveSha256:saveSha};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-current-source-continuation-8gen-20261023-01/report.json'),'utf8'));
  const baselineSourceHashes=hashSources();
  if(!reference.passed||reference.save?.model!=='V3'||reference.save?.circuit!=='Monza'||
     reference.sourceHashes?.before?.['simulation.js']!==baselineSourceHashes['simulation.js'])throw Error('A passing same-checkpoint/current-source reference is required');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0');
  const initialState=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||
     initialState.generation!==64||initialState.seed!==7717||initialState.population!==40||initialState.rewardRevision!=='progress-3'||reference.save?.sha256!==saveSha)
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const circuitsJson=require(path.join(root,'outputs/data/circuits.json'));
  console.log('V3_AB_ARM_START '+JSON.stringify({arm:'control',saveSha256:saveSha,generation:64,seed:7717,population:40,changedSourceExpression:false}));
  const control=makeArm('control',FControl,decoded,saveSha,circuitsJson);
  const controlMatchesReference=control.perGeneration.slice(0,8).every((actual,index)=>{
    const expected=reference.perGeneration[index];
    return actual.generation===expected.generation&&actual.leader?.id===expected.leader?.id&&
      Math.abs((actual.leader?.progressM??-1)-(expected.leader?.progressM??-1))<1e-9&&actual.safeAgentCount===expected.safeAgentCount&&
      actual.maxLaps===expected.maxLaps&&JSON.stringify(actual.reasonCounts)===JSON.stringify(sortedCounts(expected.reasonCounts));
  });
  if(!controlMatchesReference)throw Error('Current-source control did not reproduce the previously measured first eight generations; aborting treatment comparison');
  console.log('V3_AB_ARM_START '+JSON.stringify({arm:'combined-focus',saveSha256:saveSha,generation:64,seed:7717,population:40,changedSourceExpression:'longitudinal -> combined (in-memory only)'}));
  const treatment=makeArm('combined-focus',FTreatment,decoded,saveSha,circuitsJson);
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,sourceHashesAfter=hashSources(),diskSourcesUnchanged=JSON.stringify(baselineSourceHashes)===JSON.stringify(sourceHashesAfter);
  const perGeneration=control.perGeneration.map((c,index)=>{
    const t=treatment.perGeneration[index];
    return {generation:c.generation,control:{leader:c.leader&&{id:c.leader.id,progressM:c.leader.progressM},safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps,reasonCounts:c.reasonCounts,frontierDiagnostics:c.frontierDiagnostics},
      treatment:{leader:t.leader&&{id:t.leader.id,progressM:t.leader.progressM},safeAgentCount:t.safeAgentCount,maxLaps:t.maxLaps,reasonCounts:t.reasonCounts,frontierDiagnostics:t.frontierDiagnostics},
      safeProgressDeltaM:(t.leader?.progressM??0)-(c.leader?.progressM??0),lapDelta:t.maxLaps-c.maxLaps};
  });
  const appliedAtInitialReproduction=Boolean(treatment.perGeneration[0].frontierDiagnostics?.frontierMutationFocus==='combined'&&treatment.perGeneration[0].frontierDiagnostics?.frontierOffspringCount>0);
  const report={format:'male-cns-saved-v3-paired-combined-frontier-focus-v1',appVersion:'5.6.0',
    passed:Boolean(controlMatchesReference&&saveUnchanged&&diskSourcesUnchanged&&control.perGeneration.length===10&&treatment.perGeneration.length===10),
    learningSucceeded:treatment.overall.maxLaps>=2,
    save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',startGeneration:64,seed:7717,population:40,rewardRevision:'progress-3'},
    diskSourceHashes:{before:baselineSourceHashes,after:sourceHashesAfter,unchanged:diskSourcesUnchanged},
    inMemoryTreatment:{expressionBefore:needle,expressionAfter:"const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'combined':null;",
      originalSimulationSha256:sha(originalSimulation),transformedSimulationSha256:sha(treatmentSimulation),diskFileWritten:false,
      sourceFileIdentity:simPath,activeAtFirstReproduction:appliedAtInitialReproduction,
      firstGenerationDiagnostics:treatment.perGeneration[0].frontierDiagnostics},
    settings:{runtime:'Node 24.19.0 CPU-only',arms:2,completeNaturalGenerationsPerArm:10,controlRateHz:10,physicsHz:60,
      sameSave:true,sameSeed:true,samePopulation:true,sameCircuit:true,noGPU:true},
    controlMatchesPriorEightGenerationReplay:controlMatchesReference,
    control:{overall:control.overall,perGeneration:control.perGeneration},
    treatment:{overall:treatment.overall,perGeneration:treatment.perGeneration},
    pairedComparison:{perGeneration,finalSafeProgressDeltaM:treatment.overall.finalSafeProgressM-control.overall.finalSafeProgressM,
      bestSafeProgressDeltaM:treatment.overall.bestSafeProgressM-control.overall.bestSafeProgressM,
      generationsWithBetterSafeProgress:perGeneration.filter(g=>g.safeProgressDeltaM>1).map(g=>g.generation),
      generationsWithWorseSafeProgress:perGeneration.filter(g=>g.safeProgressDeltaM< -1).map(g=>g.generation),
      treatmentLaps:treatment.overall.maxLaps,controlLaps:control.overall.maxLaps},
    method:'Runs a full ten-generation unmodified current-source control and then ten-generation treatment from the identical V3/Monza gen64 save and seed. Treatment compiles a single frontier-mutation-focus expression in memory only; it does not write source files, change rewards/physics/sensors/pedals, provide a route or teacher, or manually mutate the checkpoint. All cars are evaluated through the MaleCNS policy and normal evolution. The control must exactly reproduce the first eight generations of the prior current-source report before treatment results are considered.',
    boundary:'One protected checkpoint, one seed, one circuit, ten generations per arm. A better safe progress value is a measured single-seed outcome, not proof of generalized learning; two completed laps in one generation remain the learning target.'};
  if(!saveUnchanged||!diskSourcesUnchanged)throw Error('Protected save or on-disk application sources changed during paired replay');
  fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_AB_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,controlMatchesReference,
    appliedAtInitialReproduction,overall:{control:control.overall,treatment:treatment.overall},
    deltas:report.pairedComparison,saveUnchanged,diskSourcesUnchanged,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
  if(!report.passed)process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
