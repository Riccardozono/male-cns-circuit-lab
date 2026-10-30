'use strict';
// Isolated six-generation A/B: allow a small offspring share from near-frontier crashes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const baselinePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-steering-only-frontier-ab-10gen-current-20261023-01/report.json');
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-risk-repair-6pct-ab-6gen-current-20261023-01');
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  F=require(path.join(root,'outputs/simulation.js')),circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));
const files=['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'];
const sourceHashes=()=>Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
function run(state,data){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,
    seed:state.seed,riskRepairEnabled:true,riskRepairOffspringRate:.06});
  P.restore(sim,structuredClone(state));sim.running=true;const first=sim.generation,rows=[];let ticks=0,genTicks=0,terminal=new Map(),started=Date.now();
  sim.onTrialTick=s=>{if(s.cars.every(c=>!c.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{id:car.id,
    progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||'',fitness:car.fitness,safe:F.isSafeLearningOutcome(car),
    overlap:Boolean(car.overlap),censored:Boolean(car.censored),penalties:{collision:Number(car.rewardBreakdown?.penalties?.collision)||0,
      offTrack:Number(car.rewardBreakdown?.penalties?.offTrack)||0,invalid:Number(car.rewardBreakdown?.penalties?.invalid)||0}});};
  while(sim.generation<first+6){if(genTicks>=60000)throw Error('Treatment generation tick watchdog');const old=sim.generation;sim.tick();ticks++;genTicks++;
    if(sim.generation!==old){if(terminal.size!==state.population)throw Error('Treatment incomplete population census');
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),h=sim.history.at(-1),
        leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null,
        bestUnsafe=outcomes.filter(x=>!x.safe).sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null,
        diagnostics=structuredClone(sim.lastFrontierDiagnostics||{}),reasonCounts=sortedCounts(outcomes.reduce((acc,x)=>(acc[x.reason]=(acc[x.reason]||0)+1,acc),{}));
      rows.push({generation:h.generation,ticks:genTicks,leader,safeAgentCount:safe.length,maxLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        bestUnsafe,reasonCounts,frontierDiagnostics:diagnostics,terminalOutcomes:outcomes});
      console.log('RISK_REPAIR_GENERATION '+JSON.stringify({generation:h.generation,leader:leader&&{id:leader.id,progressM:leader.progressM},
        safeAgentCount:safe.length,maxLaps:rows.at(-1).maxLaps,bestUnsafe:bestUnsafe&&{id:bestUnsafe.id,progressM:bestUnsafe.progressM,reason:bestUnsafe.reason,
          overlap:bestUnsafe.overlap,penalties:bestUnsafe.penalties},riskRepairParentProgress:diagnostics.riskRepairParentProgress??null,
        riskRepairOffspringCount:diagnostics.riskRepairOffspringCount??0}));
      terminal=new Map();genTicks=0;}}
  sim.running=false;return {startGeneration:first,seed:state.seed,population:state.population,rows,ticks,wallSeconds:(Date.now()-started)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 required');if(fs.existsSync(out))throw Error('Refusing to overwrite report');
  const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8')),before=sourceHashes(),bytes=fs.readFileSync(savePath),saveSha=sha(bytes),
    decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(!baseline.passed||!baseline.controlMatchesPriorEightGenerationReplay||baseline.diskSourceHashes?.unchanged!==true||
      JSON.stringify(baseline.diskSourceHashes.before)!==JSON.stringify(before)||baseline.save?.sha256!==saveSha||
      decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||
      state.population!==40||state.rewardRevision!=='progress-3'||baseline.control?.perGeneration?.length!==10)
    throw Error('Exact current-source checkpoint, baseline and ten-generation control required');
  const treatment=run(state,JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),control=baseline.control.perGeneration.slice(0,6),
    first=control[0],firstTreatment=treatment.rows[0],initialMatches=firstTreatment.generation===first.generation&&
      firstTreatment.leader?.id===first.leader?.id&&firstTreatment.leader?.progressM===first.leader?.progressM&&
      firstTreatment.safeAgentCount===first.safeAgentCount&&firstTreatment.maxLaps===first.maxLaps&&
      JSON.stringify(sortedCounts(firstTreatment.reasonCounts))===JSON.stringify(sortedCounts(first.reasonCounts));
  if(!initialMatches)throw Error('Treatment generation 64 differs from exact-source control');
  const after=sourceHashes(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,sourcesUnchanged=JSON.stringify(before)===JSON.stringify(after),
    pairs=control.map((c,i)=>({generation:c.generation,control:{leader:c.leader&&{id:c.leader.id,progressM:c.leader.progressM},safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps},
      treatment:{leader:treatment.rows[i].leader&&{id:treatment.rows[i].leader.id,progressM:treatment.rows[i].leader.progressM},safeAgentCount:treatment.rows[i].safeAgentCount,maxLaps:treatment.rows[i].maxLaps,
        riskRepairParentProgress:treatment.rows[i].frontierDiagnostics.riskRepairParentProgress??null,riskRepairOffspringCount:treatment.rows[i].frontierDiagnostics.riskRepairOffspringCount??0},
      safeProgressDeltaM:(treatment.rows[i].leader?.progressM??0)-(c.leader?.progressM??0)})),
    maxLaps=Math.max(...control.map(g=>g.maxLaps),...treatment.rows.map(g=>g.maxLaps));
  const report={format:'male-cns-saved-v3-risk-repair-6pct-ab-6gen-v1',appVersion:'5.6.0',passed:initialMatches&&saveUnchanged&&sourcesUnchanged&&treatment.rows.length===6,
    learningSucceeded:maxLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    runtime:`Node ${process.versions.node} CPU-only`,settings:{generations:6,riskRepairEnabled:true,riskRepairOffspringRate:.06,
      control:'recorded exact-source continuation',treatment:'only risk-repair offspring enabled at 6%; all other source behavior unchanged'},
    method:'Restore the user checkpoint exactly, then compare six natural generations to the recorded exact-source control. The only runtime option enabled is the existing V3 risk-repair branch: up to 6% of offspring may be mutated from an eligible near-frontier collision outcome; it remains outside safe champion/archive ranking. No route, teacher action, reward, sensor, vehicle or source change.',
    controlMatchesPriorEightGenerationReplay:baseline.controlMatchesPriorEightGenerationReplay,initialMatches,control,treatment,
    pairedComparison:{pairs,finalSafeProgressDeltaM:pairs.at(-1).safeProgressDeltaM,bestSafeProgressDeltaM:Math.max(...pairs.map(p=>p.safeProgressDeltaM)),
      treatmentMaxLaps:Math.max(...treatment.rows.map(g=>g.maxLaps)),controlMaxLaps:Math.max(...control.map(g=>g.maxLaps)),
      generationsWithBetterSafeProgress:pairs.filter(p=>p.safeProgressDeltaM>1).map(p=>p.generation),generationsWithWorseSafeProgress:pairs.filter(p=>p.safeProgressDeltaM< -1).map(p=>p.generation)},
    integrity:{saveUnchanged,sourcesUnchanged,sourceHashes:{before,after},controlReportSha256:sha(fs.readFileSync(baselinePath))},
    boundary:'Passing verifies initial replay and file integrity only; this one checkpoint/seed and six generations do not prove generalization or two-lap learning.'};
  if(!report.passed)throw Error('Integrity gate failed');fs.mkdirSync(out,{recursive:false});
  const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('RISK_REPAIR_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,initialMatches,
    controlFinal:{leader:control.at(-1).leader,safeAgentCount:control.at(-1).safeAgentCount,maxLaps:control.at(-1).maxLaps},
    treatmentFinal:{leader:treatment.rows.at(-1).leader,safeAgentCount:treatment.rows.at(-1).safeAgentCount,maxLaps:treatment.rows.at(-1).maxLaps,
      riskRepairParentProgress:treatment.rows.at(-1).frontierDiagnostics.riskRepairParentProgress??null,riskRepairOffspringCount:treatment.rows.at(-1).frontierDiagnostics.riskRepairOffspringCount??0},
    comparison:report.pairedComparison,saveUnchanged,sourcesUnchanged,wallSeconds:treatment.wallSeconds,report:reportPath,
    reportSha256:sha(fs.readFileSync(reportPath))}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
