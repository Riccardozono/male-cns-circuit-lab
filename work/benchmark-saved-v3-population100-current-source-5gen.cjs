'use strict';
// Five-gen CPU-only population test from the protected V3/Monza checkpoint.
// The saved 40-agent policy is replayed once at gen64, then the experimental
// branch breeds 100 agents in memory. No source/save/app settings are written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-population100-current-source-5gen-20261023-01');
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
  const ab=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-combined-frontier-ab-10gen-20261023-01/report.json'),'utf8'));
  const hashesBefore=hashSources();
  if(!ab.passed||ab.save?.model!=='V3'||ab.save?.startGeneration!==64||ab.diskSourceHashes?.before?.['simulation.js']!==hashesBefore['simulation.js'])
    throw Error('A verified same-source V3/Monza control reference is required');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||
     state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||ab.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const graphData=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(graphData,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  Progress.restore(sim,state);
  if(sim.population!==40)throw Error(`Expected 40 restored agents, found ${sim.population}`);
  sim.population=100;sim.running=true;
  const perGeneration=[],startGeneration=sim.generation,targetGeneration=startGeneration+5;
  let terminal=null,ticks=0,lastLog=performance.now();
  const runStart=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,
      reason:c.reason||'',safe:F.isSafeLearningOutcome(c),fitness:c.fitness,lapTimes:c.lapTimes.slice()})).sort((a,b)=>a.id-b.id);
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('V3_POP100_PROGRESS '+JSON.stringify({generation:s.generation,ticks,alive:s.cars.filter(c=>c.alive).length,completed:perGeneration.length,population:s.population}));}
  };
  while(sim.generation<targetGeneration&&ticks<240000&&performance.now()-runStart<900000){
    const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){
      const summary=sim.history.at(-1),safe=(terminal||[]).filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      const record={generation:before,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...(terminal||[]).map(c=>c.laps)),
        completedLapCount:(terminal||[]).reduce((sum,c)=>sum+c.laps,0),reasonCounts:sortedCounts((terminal||[]).reduce((counts,c)=>(counts[c.reason]=(counts[c.reason]||0)+1,counts),{})),
        evaluatedPopulation:terminal?.length??0,nextPopulation:sim.cars.length,bestLapTime:summary?.bestLapTime??null,
        meanProgressM:summary?.meanProgress??null,fitnessBest:summary?.best??null,stagnation:summary?.stagnation??null,
        mutationAmount:summary?.mutationAmount??null,immigrantCount:summary?.immigrantCount??null,learning:summary?.learning??null,
        frontierDiagnostics:structuredClone(sim.lastFrontierDiagnostics||null)};
      perGeneration.push(record);
      console.log('V3_POP100_GENERATION_DONE '+JSON.stringify({generation:before,leader:record.leader&&{id:record.leader.id,progressM:record.leader.progressM},safeAgentCount:record.safeAgentCount,
        maxLaps:record.maxLaps,evaluatedPopulation:record.evaluatedPopulation,nextPopulation:record.nextPopulation}));
      terminal=null;
    }
  }
  if(sim.generation!==targetGeneration||perGeneration.length!==5)throw Error(`Expected five complete generations; got ${perGeneration.length}`);
  const control=ab.control.perGeneration.slice(0,5);
  const controlMatchesReference=control.length===5&&control.every((expected,index)=>{
    const current=ab.control.perGeneration[index],reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-current-source-continuation-8gen-20261023-01/report.json'),'utf8')).perGeneration[index];
    return current.generation===reference.generation&&Math.abs(current.leader.progressM-reference.leader.progressM)<1e-9&&current.safeAgentCount===reference.safeAgentCount&&current.maxLaps===reference.maxLaps;
  });
  const initialMatch=perGeneration[0].leader?.id===control[0].leader?.id&&Math.abs(perGeneration[0].leader.progressM-control[0].leader.progressM)<1e-9&&
    perGeneration[0].safeAgentCount===control[0].safeAgentCount&&perGeneration[0].maxLaps===control[0].maxLaps&&perGeneration[0].evaluatedPopulation===40;
  const paired=perGeneration.map((treatment,index)=>{const c=control[index];return {generation:treatment.generation,
    control:{leader:c.leader&&{id:c.leader.id,progressM:c.leader.progressM},safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps},
    treatment:{leader:treatment.leader&&{id:treatment.leader.id,progressM:treatment.leader.progressM},safeAgentCount:treatment.safeAgentCount,maxLaps:treatment.maxLaps,
      evaluatedPopulation:treatment.evaluatedPopulation,nextPopulation:treatment.nextPopulation},
    safeProgressDeltaM:(treatment.leader?.progressM??0)-(c.leader?.progressM??0),lapDelta:treatment.maxLaps-c.maxLaps};});
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,hashesAfter=hashSources(),sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter);
  const report={format:'male-cns-saved-v3-population100-current-source-v1',appVersion:'5.6.0',
    passed:Boolean(controlMatchesReference&&initialMatch&&saveUnchanged&&sourcesUnchanged),learningSucceeded:perGeneration.some(g=>g.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',startGeneration:64,seed:7717,savedPopulation:40,rewardRevision:state.rewardRevision},
    sourceHashes:{before:hashesBefore,after:hashesAfter,unchanged:sourcesUnchanged},
    settings:{runtime:'Node 24.19.0 CPU-only',controlPopulation:40,treatmentPopulation:100,treatmentAppliedBeforeGeneration64Reproduction:true,
      completeNaturalGenerations:5,controlRateHz:10,physicsHz:60,noGPU:true,sameSave:true,sameSeed:true,sameCircuit:true},
    controlMatchesCurrentSourceReference:controlMatchesReference,initialGenerationMatches:initialMatch,control:control.slice(0,5).map(g=>({generation:g.generation,leader:g.leader,
      safeAgentCount:g.safeAgentCount,maxLaps:g.maxLaps,reasonCounts:g.reasonCounts})),treatment:perGeneration,
    pairedComparison:{perGeneration:paired,finalSafeProgressDeltaM:(perGeneration.at(-1).leader?.progressM??0)-(control.at(-1).leader?.progressM??0),
      bestSafeProgressDeltaM:Math.max(...perGeneration.map(g=>g.leader?.progressM??0))-Math.max(...control.map(g=>g.leader?.progressM??0)),
      generationsWithBetterSafeProgress:paired.filter(g=>g.safeProgressDeltaM>1).map(g=>g.generation),generationsWithWorseSafeProgress:paired.filter(g=>g.safeProgressDeltaM< -1).map(g=>g.generation),
      treatmentLaps:Math.max(...perGeneration.map(g=>g.maxLaps)),controlLaps:Math.max(...control.map(g=>g.maxLaps))},
    method:'Continues the exact V3/Monza gen64 save through five natural generations using the current application sources. The treatment starts with the saved 40-agent population to evaluate generation64 identically, then changes only the in-memory Simulation population to 100 before breeding generation65. The paired 40-agent control is the first five generations of an independently completed current-source same-checkpoint replay and is verified against the earlier eight-generation report. No reward, physics, sensors, controller, source file, persistent setting or save is changed.',
    boundary:'One checkpoint, seed and circuit; five generations. Increased safe progress is a single-seed short-horizon result, not two-lap completion or general convergence.'};
  if(!saveUnchanged||!sourcesUnchanged)throw Error('Protected save or disk source changed during the experiment');
  fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_POP100_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,controlMatchesReference,initialMatch,
    pairedComparison:report.pairedComparison,saveUnchanged,sourcesUnchanged,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
  if(!report.passed)process.exitCode=1;
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
