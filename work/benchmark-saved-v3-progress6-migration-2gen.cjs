'use strict';
// In-memory-only reward migration replay from the protected V3/Monza gen64 save.
// Preserves all 40 genomes and optimizer state, but clears score history whose
// values were computed under progress-3. No production source or save is written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const generationsToRun=Number(process.argv[2]||2);
if(!Number.isInteger(generationsToRun)||generationsToRun<2||generationsToRun>5)throw Error('Choose 2–5 complete generations');
const treatmentPopulation=Number(process.argv[3]||40);
if(![40,100].includes(treatmentPopulation))throw Error('Treatment population must be 40 or 100');
const out=path.join(root,`.impeccable/review/learning-ml/saved-v3-progress6-migration-${treatmentPopulation}pop-${generationsToRun}gen-20261023-01`);
const F=require(path.join(root,'outputs/simulation.js'));
const Progress=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceHashes=()=>Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'].map(file=>
  [file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite ${out}`);
  const reference=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-pop100-savedrng-10gen-20261023-01/report.json'),'utf8'));
  const hashesBefore=sourceHashes(),referenceHashes=reference.sourceHashes?.before;
  if(!reference.passed||referenceHashes?.['simulation.js']!==hashesBefore['simulation.js']||referenceHashes?.['rewards.js']!==hashesBefore['rewards.js'])
    throw Error('A passing same-source current-reward reference is required');
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await Progress.decode(raw.toString('utf8'),'5.6.0');
  const original=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||
     original.generation!==64||original.seed!==7717||original.population!==40||original.rewardRevision!=='progress-3'||reference.save.sha256!==saveSha)
    throw Error('Exact protected V3/Monza generation-64 checkpoint required');
  const migrated=structuredClone(original);
  migrated.rewardRevision=F.Rewards.REVISION;
  migrated.history=[];migrated.stagnation=0;migrated.learningFrontier={progress:0,laps:0,lapTime:null};
  migrated.bestEver=null;migrated.champion=null;migrated.championStats=null;migrated.hallOfFame=[];migrated.externalChampion=null;
  const graphData=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')));
  const circuits=require(path.join(root,'outputs/data/circuits.json'));
  const sim=new F.Simulation(graphData,{modelId:'v3',population:original.population,circuitId:'monza',circuits,seed:original.seed});
  Progress.validatePayload(decoded.payload,{graph:sim.graph,circuits:sim.circuits});
  Progress.restore(sim,migrated);sim.population=treatmentPopulation;sim.running=true;
  const generations=[],start=sim.generation,target=start+generationsToRun;let terminal=null,ticks=0,lastLog=performance.now();
  const runStart=performance.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(c=>!c.alive))terminal=s.cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),laps:c.laps,
      reason:c.reason||'',safe:F.isSafeLearningOutcome(c),fitness:c.fitness,brakeLockSeconds:c.rewardState?.brakeLockSeconds||0,
      stallPenalty:c.rewardBreakdown?.penalties?.stall||0,outputs:c.outputs?.slice()||null})).sort((a,b)=>a.id-b.id);
    if(performance.now()-lastLog>30000){lastLog=performance.now();console.log('V3_PROGRESS6_MIGRATION_PROGRESS '+JSON.stringify({generation:s.generation,ticks,alive:s.cars.filter(c=>c.alive).length,completed:generations.length}));}
  };
  while(sim.generation<target&&ticks<160000&&performance.now()-runStart<900000){
    const before=sim.generation;sim.tick();ticks++;
    if(sim.generation!==before){
      const outcomes=terminal||[],safe=outcomes.filter(c=>c.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null;
      const record={generation:before,evaluatedPopulation:outcomes.length,leader,safeAgentCount:safe.length,maxLaps:Math.max(0,...outcomes.map(c=>c.laps)),
        reasonCounts:sortedCounts(outcomes.reduce((counts,c)=>(counts[c.reason]=(counts[c.reason]||0)+1,counts),{})),
        brakeLockAgents:outcomes.filter(c=>c.brakeLockSeconds>0).length,maxBrakeLockSeconds:Math.max(0,...outcomes.map(c=>c.brakeLockSeconds)),
        totalStallPenalty:outcomes.reduce((sum,c)=>sum+c.stallPenalty,0),examples:outcomes.filter(c=>c.brakeLockSeconds>0).slice(0,8)};
      generations.push(record);terminal=null;
      console.log('V3_PROGRESS6_MIGRATION_GENERATION_DONE '+JSON.stringify({generation:record.generation,leader:leader&&{id:leader.id,progressM:leader.progressM,reason:leader.reason},safeAgentCount:safe.length,maxLaps:record.maxLaps,brakeLockAgents:record.brakeLockAgents,totalStallPenalty:record.totalStallPenalty}));
    }
  }
  if(sim.generation!==target||generations.length!==generationsToRun)throw Error(`Expected ${generationsToRun} complete generations; got ${generations.length}`);
  const controlSource=treatmentPopulation===100?reference.treatment.perGeneration:reference.control.perGeneration;
  const control=controlSource.filter(g=>g.generation>=start&&g.generation<target);
  const treatment=generations;
  const generation64PhysicalMatch=(()=>{const a=treatment[0],b=control[0];return !!b&&a.leader?.id===b.leader?.id&&
    Math.abs(a.leader.progressM-b.leader.progressM)<1e-9&&a.safeAgentCount===b.safeAgentCount&&a.maxLaps===b.maxLaps&&
    JSON.stringify(a.reasonCounts)===JSON.stringify(sortedCounts(b.reasonCounts));})();
  const paired=treatment.map((t,i)=>{const c=control[i];return {generation:t.generation,
    control:c?{leaderId:c.leader?.id,leaderProgressM:c.leader?.progressM,safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps}:null,
    treatment:{leaderId:t.leader?.id,leaderProgressM:t.leader?.progressM,safeAgentCount:t.safeAgentCount,maxLaps:t.maxLaps,brakeLockAgents:t.brakeLockAgents,totalStallPenalty:t.totalStallPenalty},
    safeProgressDeltaM:c?(t.leader?.progressM??0)-(c.leader?.progressM??0):null};});
  const hashesAfter=sourceHashes(),sourcesUnchanged=JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const report={format:'male-cns-v3-progress6-in-memory-migration-2gen-v1',appVersion:'5.6.0',passed:Boolean(generation64PhysicalMatch&&sourcesUnchanged&&saveUnchanged),learningSucceeded:false,
    input:{saveSha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:7717,population:40,sourceRewardRevision:original.rewardRevision},
    migration:{rewardRevision:migrated.rewardRevision,genomesPreserved:JSON.stringify(migrated.genomes)===JSON.stringify(original.genomes),optimizerPreserved:JSON.stringify(migrated.optimizer)===JSON.stringify(original.optimizer),
      savedPopulation:original.population,treatmentPopulation,
      historyCleared:true,stagnationReset:true,championAndHallReset:true,onlyInMemory:true},
    sourceHashes:{before:hashesBefore,after:hashesAfter,unchanged:sourcesUnchanged},
    controlReference:{path:'.impeccable/review/learning-ml/saved-v3-pop100-savedrng-10gen-20261023-01/report.json',rewardRevision:reference.save.rewardRevision,
      population:treatmentPopulation,exactGeneration64PhysicalMatch:generation64PhysicalMatch},
    settings:{runtime:'Node 24.19.0 CPU-only',savedPopulation:40,treatmentPopulation,completeGenerations:generationsToRun,controlRateHz:10,physicsHz:60,noGpu:true},
    pairedComparison:paired,treatment:generations,
    method:`Validate the user file unchanged, clone its exact saved state in memory, switch the episode reward revision to current progress-6, and clear history/champion/stagnation values scored under progress-3. All saved genomes, RNG and optimizer parameters are preserved. The saved 40 agents evaluate generation 64; breeding from then uses population ${treatmentPopulation}. Replay ${generationsToRun} natural generations paired to the same-source 10-generation reference at population ${treatmentPopulation}. No production source, user save or persistent app setting is changed.`,
    runnerSha256:sha(fs.readFileSync(__filename)),
    boundary:`One checkpoint, seed, model and circuit over ${generationsToRun} generations. A short migration-only episode cannot establish robust learning or completion of a lap.`};
  if(!generation64PhysicalMatch||!sourcesUnchanged||!saveUnchanged)throw Error('Replay did not match generation64 baseline or protected state changed');
  fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('V3_PROGRESS6_MIGRATION_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:false,pairedComparison:paired,saveUnchanged,sourcesUnchanged,report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
  sim.running=false;
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
