'use strict';
// Eight natural V3 generations from the exact user Monza checkpoint, using
// current working sources. CPU-only; never writes the save or app state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-current-source-continuation-8gen-20261023-01');
const F=require(path.join(root,'outputs/simulation.js'));
const Progress=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const hashSources=()=>Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'].map(file=>
  [file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-control-rate-rescaled-20261023-01/report.json'),'utf8'));
  const hashesBefore=hashSources(),referenceHashes=reference.sourceHashes?.before;
  if(!reference.passed||reference.settings?.baselineControlRateHz!==10||
     referenceHashes?.simulation!==hashesBefore['simulation.js']||referenceHashes?.learning!==hashesBefore['neural-learning.js'])
    throw Error('A passing current-source 10 Hz reference is required');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await Progress.decode(bytes.toString('utf8'),'5.6.0');
  const state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||
     state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||reference.save?.sha256!==saveSha)
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(data,{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  Progress.restore(sim,state);sim.running=true;
  const startGeneration=sim.generation,targetGeneration=startGeneration+8,perGeneration=[];
  const runStart=performance.now();let terminal=null,ticks=0,lastLog=runStart;
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,
      reason:c.reason||'',safe:F.isSafeLearningOutcome(c),fitness:c.fitness,lapTimes:c.lapTimes.slice()})).sort((a,b)=>a.id-b.id);
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('V3_CONTINUATION_PROGRESS '+JSON.stringify({generation:s.generation,ticks,alive:s.cars.filter(c=>c.alive).length,completed:perGeneration.length}));}
  };
  while(sim.generation<targetGeneration&&ticks<120000&&performance.now()-runStart<600000){
    const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){
      const summary=sim.history.at(-1),safe=(terminal||[]).filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      const record={generation:before,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...(terminal||[]).map(c=>c.laps)),
        completedLapCount:(terminal||[]).reduce((sum,c)=>sum+c.laps,0),reasonCounts:(terminal||[]).reduce((counts,c)=>(counts[c.reason]=(counts[c.reason]||0)+1,counts),{}),
        bestLapTime:summary?.bestLapTime??null,meanProgressM:summary?.meanProgress??null,fitnessBest:summary?.best??null,
        stagnation:summary?.stagnation??null,mutationAmount:summary?.mutationAmount??null,immigrantCount:summary?.immigrantCount??null,
        learning:summary?.learning??null};
      perGeneration.push(record);
      console.log('V3_GENERATION_DONE '+JSON.stringify({generation:before,leader:record.leader,safeAgentCount:record.safeAgentCount,
        maxLaps:record.maxLaps,stagnation:record.stagnation,learning:record.learning}));
      terminal=null;
    }
  }
  if(sim.generation!==targetGeneration||perGeneration.length!==8)throw Error(`Expected eight natural generations; finished ${perGeneration.length}`);
  const first=perGeneration[0],expected=reference.comparison.baseline10Hz;
  const initialMatches=first.leader?.id===expected.leader.id&&Math.abs(first.leader.progressM-expected.leader.progressM)<1e-9&&
    first.maxLaps===expected.laps&&first.safeAgentCount===expected.safeAgentCount&&JSON.stringify(first.reasonCounts)===JSON.stringify(expected.terminalReasonCounts);
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,hashesAfter=hashSources(),sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter);
  const report={format:'male-cns-saved-v3-current-source-natural-continuation-v1',appVersion:'5.6.0',
    passed:Boolean(initialMatches&&saveUnchanged&&sourcesUnchanged&&perGeneration.length===8),
    learningSucceeded:perGeneration.some(g=>g.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',startGeneration:startGeneration,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    sourceHashes:{before:hashesBefore,after:hashesAfter,unchanged:sourcesUnchanged},
    settings:{runtime:'Node 24.19.0 CPU V3 solver',controlRateHz:10,physicsHz:60,completedNaturalGenerations:perGeneration.length,
      generationsWithESUpdates:perGeneration.filter(g=>(g.learning?.updates||0)>0).length,mutation:sim.mutation,speedMultiplier:sim.speedMultiplier},
    initialControl:{matchedCurrentSourceReference:initialMatches,expectedLeader:expected.leader,actual:perGeneration[0]},
    perGeneration,overall:{bestSafeProgressM:Math.max(...perGeneration.map(g=>g.leader?.progressM??0)),
      minimumSafeProgressM:Math.min(...perGeneration.map(g=>g.leader?.progressM??0)),
      maxLaps:Math.max(...perGeneration.map(g=>g.maxLaps)),bestLapTime:perGeneration.map(g=>g.bestLapTime).filter(Number.isFinite).sort((a,b)=>a-b)[0]??null},
    method:'Continues the exact saved 40-genome V3/Monza generation-64 checkpoint through eight complete natural generations using current working sources. Every car still acts only through its MaleCNS neural controller; no route cue, teacher action, reward/physics override or manual genome mutation is added. Records safe progress, laps, terminal causes, ES updates and stagnation per generation. CPU-only.',
    boundary:'One saved checkpoint, seed, circuit and eight generations. A successful integrity replay is not learning success; two laps in one generation are the target. This continuation tests the current baseline search, not generalization or a new algorithm.'};
  if(!saveUnchanged||!sourcesUnchanged)throw Error('Save or application source changed during continuation');
  fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_CONTINUATION_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,overall:report.overall,
    perGeneration:perGeneration.map(g=>({generation:g.generation,leader:g.leader,safe:g.safeAgentCount,maxLaps:g.maxLaps,stagnation:g.stagnation})),
    saveUnchanged,sourceUnchanged:sourcesUnchanged,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
  if(!report.passed)process.exitCode=1;
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
