'use strict';
// Ten-generation in-memory A/B treatment: extend only the local practice horizon.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const baselinePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-steering-only-frontier-ab-10gen-current-20261023-01/report.json');
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-practice-horizon-3600-ab-10gen-current-20261023-01');
const HORIZON_TICKS=3600;
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));
const files=['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'];
const sourceHashes=()=>Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
function loadLongPractice(simFile){
  const source=fs.readFileSync(simFile,'utf8'),anchor='function evaluatePractice(track,graph,genome,state,maxTicks=720)';
  if(source.split(anchor).length!==2)throw Error('Expected one practice-horizon source anchor');
  const treatment=source.replace(anchor,`function evaluatePractice(track,graph,genome,state,maxTicks=${HORIZON_TICKS})`),
    m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));m._compile(treatment,simFile);m.loaded=true;
  return {api:m.exports,sourceSha256:sha(treatment)};
}
function runTreatment(F,state,data){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;const first=sim.generation,rows=[];let ticks=0,genTicks=0,terminal=new Map(),started=Date.now();
  sim.onTrialTick=s=>{if(s.cars.every(c=>!c.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{id:car.id,
    progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||'',fitness:car.fitness,safe:F.isSafeLearningOutcome(car)});};
  while(sim.generation<first+10){if(genTicks>=60000)throw Error('Treatment generation tick watchdog');const old=sim.generation;sim.tick();ticks++;genTicks++;
    if(sim.generation!==old){if(terminal.size!==state.population)throw Error('Treatment incomplete population census');
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),h=sim.history.at(-1),
        leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0]||null,
        reasonCounts=sortedCounts(outcomes.reduce((acc,x)=>(acc[x.reason]=(acc[x.reason]||0)+1,acc),{})),
        practiceResults=(sim.practiceResults||[]).map(x=>({parentId:x.parentId,improved:x.improved,
          baseline:{progress:x.baseline?.progress,laps:x.baseline?.laps,reason:x.baseline?.reason,fitness:x.baseline?.fitness},
          best:{progress:x.best?.progress,laps:x.best?.laps,reason:x.best?.reason,fitness:x.best?.fitness}}));
      rows.push({generation:h.generation,ticks:genTicks,leader,safeAgentCount:safe.length,maxLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        reasonCounts,practiceEvaluations:sim.practiceEvaluations||0,practiceCandidateSets:practiceResults.length,
        practiceImprovedSets:practiceResults.filter(x=>x.improved).length,practiceResults,
        terminalOutcomes:outcomes});
      console.log('PRACTICE_HORIZON_GENERATION '+JSON.stringify({generation:h.generation,leader:leader&&{id:leader.id,progressM:leader.progressM},
        safeAgentCount:safe.length,maxLaps:rows.at(-1).maxLaps,practiceEvaluations:rows.at(-1).practiceEvaluations,
        practiceCandidateSets:rows.at(-1).practiceCandidateSets,practiceImprovedSets:rows.at(-1).practiceImprovedSets}));
      terminal=new Map();genTicks=0;}}
  sim.running=false;return {startGeneration:first,seed:state.seed,population:state.population,rows,ticks,wallSeconds:(Date.now()-started)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 required');if(fs.existsSync(out))throw Error('Refusing to overwrite report');
  const baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8')),before=sourceHashes(),bytes=fs.readFileSync(savePath),saveSha=sha(bytes),
    decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(!baseline.passed||!baseline.controlMatchesPriorEightGenerationReplay||baseline.diskSourceHashes?.unchanged!==true||
      JSON.stringify(baseline.diskSourceHashes.before)!==JSON.stringify(before)||baseline.save?.sha256!==saveSha||
      decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3'||baseline.control?.perGeneration?.length!==10)
    throw Error('Exact current-source checkpoint, baseline and ten-generation control required');
  const control=baseline.control,build=loadLongPractice(require.resolve(path.join(root,'outputs/simulation.js'))),
    treatment=runTreatment(build.api,state,JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),
    first=control.perGeneration[0],firstTreatment=treatment.rows[0],initialMatches=firstTreatment.generation===first.generation&&
      firstTreatment.leader?.id===first.leader?.id&&firstTreatment.leader?.progressM===first.leader?.progressM&&
      firstTreatment.safeAgentCount===first.safeAgentCount&&firstTreatment.maxLaps===first.maxLaps&&
      JSON.stringify(sortedCounts(firstTreatment.reasonCounts))===JSON.stringify(sortedCounts(first.reasonCounts));
  if(!initialMatches)throw Error('Treatment gen64 differs from the recorded exact-source control');
  const after=sourceHashes(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,sourcesUnchanged=JSON.stringify(before)===JSON.stringify(after),
    pairs=control.perGeneration.map((c,i)=>({generation:c.generation,control:{leader:c.leader&&{id:c.leader.id,progressM:c.leader.progressM},safeAgentCount:c.safeAgentCount,maxLaps:c.maxLaps},
      treatment:{leader:treatment.rows[i].leader&&{id:treatment.rows[i].leader.id,progressM:treatment.rows[i].leader.progressM},safeAgentCount:treatment.rows[i].safeAgentCount,maxLaps:treatment.rows[i].maxLaps},
      safeProgressDeltaM:(treatment.rows[i].leader?.progressM??0)-(c.leader?.progressM??0)})),
    maxLaps=Math.max(...control.perGeneration.map(g=>g.maxLaps),...treatment.rows.map(g=>g.maxLaps));
  const report={format:'male-cns-saved-v3-practice-horizon-3600-ab-10gen-v1',appVersion:'5.6.0',passed:initialMatches&&saveUnchanged&&sourcesUnchanged&&treatment.rows.length===10,
    learningSucceeded:maxLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',settings:{naturalGenerationsPerArm:10,control:'recorded exact-source current control; local practice horizon 720 ticks',
      treatment:`same source behavior in memory except local practice horizon ${HORIZON_TICKS} ticks`},
    method:'The treatment extends only evaluatePractice maxTicks from 720 to 3600. Actual generation episodes, mutation, optimizer, reward, sensors, vehicle physics, track, parent selection and RNG remain unchanged. The control is the completed exact-source ten-generation replay. Practice evaluates candidate policies from previously reached physical/neural states, with no route or teacher actions.',
    controlMatchesPriorEightGenerationReplay:baseline.controlMatchesPriorEightGenerationReplay,initialMatches,control,treatment,pairedComparison:{pairs,
      finalSafeProgressDeltaM:pairs.at(-1).safeProgressDeltaM,bestSafeProgressDeltaM:Math.max(...pairs.map(p=>p.safeProgressDeltaM)),
      treatmentMaxLaps:Math.max(...treatment.rows.map(g=>g.maxLaps)),controlMaxLaps:Math.max(...control.perGeneration.map(g=>g.maxLaps)),
      generationsWithBetterSafeProgress:pairs.filter(p=>p.safeProgressDeltaM>1).map(p=>p.generation),generationsWithWorseSafeProgress:pairs.filter(p=>p.safeProgressDeltaM< -1).map(p=>p.generation)},
    integrity:{saveUnchanged,sourcesUnchanged,sourceHashes:{before,after},controlReportSha256:sha(fs.readFileSync(baselinePath)),treatmentSourceSha256:build.sourceSha256},
    boundary:'One saved checkpoint, circuit and RNG. Passing verifies matched replay/integrity only; it does not prove a completed lap or generalized learning.'};
  if(!report.passed)throw Error('Integrity gate failed');fs.mkdirSync(out,{recursive:false});
  const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('PRACTICE_HORIZON_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,initialMatches,
    controlFinal:control.perGeneration.at(-1),treatmentFinal:treatment.rows.at(-1),comparison:report.pairedComparison,
    treatmentPracticeEvaluations:treatment.rows.reduce((sum,r)=>sum+r.practiceEvaluations,0),
    treatmentPracticeImprovedSets:treatment.rows.reduce((sum,r)=>sum+r.practiceImprovedSets,0),saveUnchanged,sourcesUnchanged,
    report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
