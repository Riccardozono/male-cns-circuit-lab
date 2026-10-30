'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const beforePath=path.join(root,'.impeccable/review/learning-ml/practice-reward-revision-20261023-01/simulation-before.js');
const baselinePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-steering-only-frontier-ab-10gen-current-20261023-01/report.json');
const validateFull=process.argv.includes('--validate-full');
const fineMotor=process.argv.includes('--fine-motor');
if(validateFull&&fineMotor)throw Error('Choose one independent treatment');
const correctedPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-practice-revision-transfer-20261024-01/report.json');
const out=path.join(root,fineMotor?'.impeccable/review/learning-ml/saved-v3-fine-motor-10gen-20261024-01':validateFull?'.impeccable/review/learning-ml/saved-v3-practice-full-validation-20261024-01':'.impeccable/review/learning-ml/saved-v3-practice-revision-transfer-20261024-01');
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),genomeSha=g=>sha(JSON.stringify(g));
const files=['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
const sorted=value=>Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
function loadInstrumented(source){
  const filename=path.join(root,'outputs/simulation.js'),anchor='if(bestWeights){child.policyWeights=bestWeights;mirrored.weights=Learning.mirroredMutation(parent.genome.policyWeights,bestWeights);}';
  if(source.split(anchor).length!==2)throw Error('Practice transfer hook source changed');
  const hook=anchor+"\n                if(bestWeights)this.onPracticeCandidate?.({generation:this.generation,parentId:parent.id,childId:genomes.length,parentProgress:parent.bestProgress,revision:parent.practiceState.rewardRevision,baseline:{...baseline},best:{...best},genome:cloneGenome(child)});";
  let instrumented=source.replace(anchor,hook);
  if(validateFull){
    const acceptance='if(result.progress>baseline.progress+(this.track.pixelsPerMeter||1)&&result.fitness>best.fitness){best=result;bestWeights=candidate.policyWeights;}';
    if(instrumented.split(acceptance).length!==2)throw Error('Full-validation source anchor changed');
    instrumented=instrumented.replace(acceptance,'if(result.progress>baseline.progress+(this.track.pixelsPerMeter||1)&&result.fitness>baseline.fitness&&this.validatePracticeCandidate(parent,candidate,result)){best=result;bestWeights=candidate.policyWeights;}');
  }
  const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(instrumented,filename);
  return {api:m.exports,hash:sha(instrumented)};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 required');
  if(fs.existsSync(out))throw Error('Refusing to replace an existing experiment');
  const started=Date.now(),sourceBefore=fs.readFileSync(beforePath,'utf8'),source=fs.readFileSync(path.join(root,'outputs/simulation.js'),'utf8'),beforeHashes=hashes(),
    baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8')),bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  const expected=sourceBefore.replace('along:car.rewardState.along,','along:car.rewardState.along,rewardRevision:car.rewardRevision,')
    .replace('const car=makeCar(track,0,cloneGenome(genome));','const rewardRevision=state.rewardRevision??Rewards.REVISION,car=makeCar(track,0,cloneGenome(genome),rewardRevision);')
    .replace('Rewards.initialise(track,car);car.rewardState.along=state.along;','Rewards.initialise(track,car,null,rewardRevision);car.rewardState.along=state.along;');
  if(source!==expected||sha(sourceBefore)!==baseline.diskSourceHashes?.before?.['simulation.js']||!baseline.passed||
     !baseline.controlMatchesPriorEightGenerationReplay||baseline.save.sha256!==saveSha||decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||
     decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')throw Error('Paired source/checkpoint contract failed');
  for(const file of files.filter(x=>x!=='simulation.js'))if(beforeHashes[file]!==baseline.diskSourceHashes.before[file])throw Error('Unrelated source differs: '+file);
  const corrected=validateFull||fineMotor?JSON.parse(fs.readFileSync(correctedPath,'utf8')):null,
    controlRows=corrected?.rows??baseline.control.perGeneration;
  if(corrected&&(!corrected.passed||corrected.integrity.patchedSourceSha256!==sha(source)||corrected.save.sha256!==saveSha))throw Error('Corrected-source control contract failed');
  const build=loadInstrumented(source),F=build.api,sim=new F.Simulation(Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),
    {modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));sim.running=true;
  let ticks=0,genTicks=0,terminal=[],events=[],rows=[],transfers=[];
  const fineMutation={enabled:fineMotor,steeringOrCombinedFactor:.003,longitudinalOnlyFactor:.03,calls:0,steeringOrCombinedCalls:0,longitudinalOnlyCalls:0};
  if(fineMotor){
    const Learning=require(path.join(root,'outputs/neural-learning.js')),original=Learning.safeMotorMutation;
    Learning.safeMotorMutation=function(graph,values,...args){
      const child=original(graph,values,...args),p=graph.learning;
      let steering=false;for(let j=p.readoutOffset;j<values.length;j+=2)if(child[j]!==values[j]){steering=true;break;}
      fineMutation.calls++;if(steering)fineMutation.steeringOrCombinedCalls++;else fineMutation.longitudinalOnlyCalls++;
      return Learning.scaleMutation(values,child,steering?fineMutation.steeringOrCombinedFactor:fineMutation.longitudinalOnlyFactor);
    };
  }
  const validation={baselineEpisodes:0,candidateEpisodes:0,parentIdentityMatches:0,results:[]};
  if(validateFull){
    const {fullRollout,outcome}=require('./practice-full-rollout.cjs'),parents=new Map();
    const preflight=fullRollout(F,sim.track,sim.graph,state.genomes[3],{rewardRevision:state.rewardRevision,maxTicks:60000});
    validation.preflight=outcome(F,preflight);
    if(preflight.car.bestProgress/(sim.track.pixelsPerMeter||1)!==controlRows[0].leader.progressM||preflight.car.reason!==controlRows[0].leader.reason||preflight.car.laps!==0)throw Error('Saved V3 standalone validation differs from recorded full episode');
    sim.validatePracticeCandidate=(parent,candidate,local)=>{
      const key=sim.generation+':'+parent.id;let record=parents.get(key);
      if(!record){
        const replay=fullRollout(F,sim.track,sim.graph,parent.genome,{rewardRevision:state.rewardRevision,previousLapTime:parent.previousGenerationLapTime,maxTicks:60000});
        validation.baselineEpisodes++;
        for(const field of ['fitness','bestProgress','laps','reason'])if(replay.car[field]!==parent[field])throw Error('Parent full-validation identity mismatch: '+field);
        validation.parentIdentityMatches++;record={best:replay.car};parents.set(key,record);
      }
      const replay=fullRollout(F,sim.track,sim.graph,candidate,{rewardRevision:state.rewardRevision,previousLapTime:sim.history.at(-1)?.bestLapTime??null,maxTicks:60000});
      validation.candidateEpisodes++;
      const accepted=F.isSafeLearningOutcome(replay.car)&&F.compareLearningAgents(replay.car,record.best)<0;
      if(accepted)record.best=replay.car;
      const result={generation:sim.generation,parentId:parent.id,parentProgressM:parent.bestProgress/(sim.track.pixelsPerMeter||1),
        localProgress:local.progress,localReason:local.reason,genomeSha256:genomeSha(candidate),full:outcome(F,replay),accepted};
      validation.results.push(result);
      console.log('FULL_PRACTICE_CHECK '+JSON.stringify({generation:result.generation,parentId:parent.id,localProgress:local.progress,
        fullProgressM:replay.car.bestProgress/(sim.track.pixelsPerMeter||1),safe:result.full.safe,accepted}));
      return accepted;
    };
  }
  sim.onPracticeCandidate=e=>{
    events.push({...e,parentProgressM:e.parentProgress/(sim.track.pixelsPerMeter||1),genomeSha256:genomeSha(e.genome)});
    console.log('PRACTICE_ACCEPTED '+JSON.stringify({generation:e.generation,childId:e.childId,parentId:e.parentId,revision:e.revision,
      localProgress:e.best.progress,localReason:e.best.reason}));
  };
  sim.onTrialTick=s=>{if(s.cars.every(car=>!car.alive))terminal=s.cars.map(car=>({id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),
    laps:car.laps,reason:car.reason,fitness:car.fitness,safe:F.isSafeLearningOutcome(car),genomeSha256:genomeSha(car.genome)}));};
  while(sim.generation<state.generation+10){
    if(genTicks>=60000)throw Error('Generation watchdog');const old=sim.generation;sim.tick();ticks++;genTicks++;
    if(sim.generation!==old){
      if(terminal.length!==state.population)throw Error('Incomplete terminal census');
      const safe=terminal.filter(x=>x.safe),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.id-b.id)[0],h=sim.history.at(-1),
        reasonCounts=sorted(terminal.reduce((acc,x)=>(acc[x.reason]=(acc[x.reason]||0)+1,acc),{}));
      const row={generation:h.generation,ticks:genTicks,leader,safeAgentCount:safe.length,maxLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        reasonCounts,practiceEvaluations:sim.practiceEvaluations,practiceResults:structuredClone(sim.practiceResults),terminalOutcomes:terminal};rows.push(row);
      for(const event of events.filter(e=>e.generation===h.generation-1)){
        const actual=terminal.find(x=>x.id===event.childId);if(actual?.genomeSha256!==event.genomeSha256)throw Error('Practice child lineage mismatch');
        const {genome,...summary}=event;transfers.push({...summary,offspringGeneration:h.generation,outcome:actual,
          fullEpisodeProgressDeltaFromParentM:actual.progressM-event.parentProgressM});
      }
      console.log('REVISION_GENERATION '+JSON.stringify({generation:row.generation,progressM:leader?.progressM,safe:row.safeAgentCount,laps:row.maxLaps,
        practiceEvaluations:row.practiceEvaluations,practiceImprovements:row.practiceResults.filter(x=>x.improved).length}));
      terminal=[];genTicks=0;
    }
  }
  sim.running=false;
  const first=rows[0],oldFirst=controlRows[0],initialMatches=first.leader.id===oldFirst.leader.id&&first.leader.progressM===oldFirst.leader.progressM&&
    first.safeAgentCount===oldFirst.safeAgentCount&&JSON.stringify(first.reasonCounts)===JSON.stringify(sorted(oldFirst.reasonCounts));
  const pairs=rows.map((row,i)=>{const control=controlRows[i];return {generation:row.generation,controlM:control.leader.progressM,treatmentM:row.leader.progressM,
    deltaM:row.leader.progressM-control.leader.progressM,controlSafe:control.safeAgentCount,treatmentSafe:row.safeAgentCount};});
  const afterHashes=hashes(),sourceStable=JSON.stringify(beforeHashes)===JSON.stringify(afterHashes),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  let checkpoint=null,checkpointText=null;
  if(fineMotor){
    const payload=P.fromSimulation(sim);P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});
    checkpointText=await P.encode(payload,'5.6.0');const decodedCopy=await P.decode(checkpointText,'5.6.0');
    const probe=new F.Simulation(Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
    P.restore(probe,decodedCopy.payload.workers[0].state);const restoreExact=JSON.stringify(P.capture(probe))===JSON.stringify(P.capture(sim));
    if(!restoreExact)throw Error('Research checkpoint round-trip differs');
    checkpoint={filename:'checkpoint-research.malecns-save',sha256:sha(checkpointText),restoreExact,appVersion:'5.6.0',releaseRuntimeTested:false,generation:sim.generation};
  }
  const report={format:fineMotor?'malecns-fine-motor-10gen-v1':validateFull?'malecns-practice-full-validation-v1':'malecns-practice-revision-transfer-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:initialMatches&&sourceStable&&saveUnchanged&&rows.length===10,
    learningSucceeded:rows.some(x=>x.maxLaps>=2),save:{sha256:saveSha,modelId:'v3',circuitId:'monza',generation:64,seed:7717,population:40,rewardRevision:state.rewardRevision},
    settings:{generations:10,onlyBehaviorChange:fineMotor?'The corrected-source control is unchanged except safeMotorMutation readout steps are rescaled by 0.003 when steering changes, or 0.03 for longitudinal-only changes. Same anatomical graph, population, sensors, physics, reward, selection, RNG draws and other mutation families.':validateFull?'The corrected reward revision is common to both arms. Locally promising candidates are replayed from the line and only safe improvements over the parent and prior trials can replace the ordinary mutation.':'Carry parent rewardRevision into local practice; keep original historical scoring',runtime:`Node ${process.versions.node} CPU-only`},
    initialMatches,control:{perGeneration:controlRows,sourceReport:corrected?correctedPath:baselinePath},rows,pairedComparison:{pairs,finalDeltaM:pairs.at(-1).deltaM,maxLaps:Math.max(...rows.map(x=>x.maxLaps))},practiceValidation:validation,fineMutation,checkpoint,
    practiceTransfer:{accepted:events.length,resolved:transfers.length,transfers,unresolved:events.filter(e=>!transfers.some(t=>t.generation===e.generation&&t.childId===e.childId)).map(({genome,...e})=>e)},
    integrity:{sourceBeforeSha256:sha(sourceBefore),patchedSourceSha256:sha(source),instrumentedSourceSha256:build.hash,controlReportSha256:sha(fs.readFileSync(corrected?correctedPath:baselinePath)),
      sourcesStableDuringRun:sourceStable,beforeHashes,afterHashes,saveUnchanged},ticks,wallSeconds:(Date.now()-started)/1000,
    boundary:'The fix aligns practice reward revision with the loaded generation. Correct scoring and passing checks do not themselves prove two laps or general learning.'};
  if(!report.passed)throw Error('Replay/integrity failure');fs.mkdirSync(out,{recursive:false});const reportPath=path.join(out,'report.json');
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  if(checkpointText)fs.writeFileSync(path.join(out,checkpoint.filename),checkpointText,{encoding:'utf8',flag:'wx'});
  fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
  console.log('REVISION_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,final:rows.at(-1).leader,
    finalDeltaM:report.pairedComparison.finalDeltaM,accepted:events.length,fineMutation,checkpoint,fullValidationEpisodes:validation.candidateEpisodes,fullValidationAccepted:validation.results.filter(x=>x.accepted).length,transfers:transfers.map(t=>({parent:t.parentId,child:t.childId,generation:t.offspringGeneration,
      localProgress:t.best.progress,actual:t.outcome,deltaM:t.fullEpisodeProgressDeltaFromParentM})),saveUnchanged,sourceStable,wallSeconds:report.wallSeconds,
    report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
