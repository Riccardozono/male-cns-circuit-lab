'use strict';
// Ten-generation follow-up for the coherent ES lineage hypothesis.
// Uses the already-recorded exact-source production control; only the treatment runs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const baselinePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-steering-only-frontier-ab-10gen-current-20261023-01/report.json');
const sampleShare=Number(process.argv[2]??.5);
if(![.1,.5].includes(sampleShare))throw Error('Use sample share 0.1 or 0.5 for the paired treatments');
const out=path.join(root,`.impeccable/review/learning-ml/saved-v3-coherent-es-${sampleShare===.1?'10pct-lineage-only':'50pct'}-10gen-followup-20261023-01`);
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sortedCounts=counts=>Object.fromEntries(Object.entries(counts||{}).sort(([a],[b])=>a.localeCompare(b)));
const files=['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'];
const sourceHashes=()=>Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(root,'outputs',file)))]));
function replaceOnce(source,oldText,newText,label){const i=source.indexOf(oldText);if(i<0||source.indexOf(oldText,i+oldText.length)>=0)throw Error(`Expected one source anchor: ${label}`);return source.slice(0,i)+newText+source.slice(i+oldText.length);}
function loadCoherentEs(simFile){
  let source=fs.readFileSync(simFile,'utf8');
  source=replaceOnce(source,'const normalized=genomes.map(g=>normalizeGenome(g,this.graph.outputs.length));',
    'const optimizerSampleFlags=genomes.map(g=>g.__esSample===true);const normalized=genomes.map(g=>normalizeGenome(g,this.graph.outputs.length));','spawn lineage flags');
  source=replaceOnce(source,'this.cars=normalized.map((g,i)=>{const car=makeCar(this.track,i,g,this.rewardRevision);car.footprintSensorsEnabled=this.graph.modelId===\'v3\';',
    'this.cars=normalized.map((g,i)=>{const car=makeCar(this.track,i,g,this.rewardRevision);car.esSampled=optimizerSampleFlags[i];car.footprintSensorsEnabled=this.graph.modelId===\'v3\';','spawn sample flags');
  source=replaceOnce(source,'this.optimizer?.update(optimizerRanked,usesLearningOutcome?compareOptimizerAgents:undefined);',
    'this.optimizer?.update(optimizerRanked.filter(candidate=>candidate.esSampled===true),usesLearningOutcome?compareOptimizerAgents:undefined);','ES update lineage filter');
  source=replaceOnce(source,'const optimizerSampleTarget=usesLearningOutcome&&baseMutation>0&&!noSafeLearningCandidate\n         ?Math.min(Math.max(1,Math.floor(this.population*.1)),',
    `const optimizerSampleTarget=usesLearningOutcome&&baseMutation>0&&!noSafeLearningCandidate\n         ?Math.min(Math.max(1,Math.floor(this.population*${sampleShare})),`,'ES sample share');
  source=replaceOnce(source,'child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);\n          genomes.push(child);optimizerSampleCount++;continue;',
    'child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);child.__esSample=true;\n          genomes.push(child);optimizerSampleCount++;continue;','primary ES sample lineage');
  source=replaceOnce(source,'else {child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);}',
    'else {child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);child.__esSample=true;}','secondary ES sample lineage');
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));m._compile(source,simFile);m.loaded=true;
  return {api:m.exports,sourceSha256:sha(source)};
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
        reasonCounts=sortedCounts(outcomes.reduce((acc,x)=>(acc[x.reason]=(acc[x.reason]||0)+1,acc),{}));
      rows.push({generation:h.generation,ticks:genTicks,leader,safeAgentCount:safe.length,maxLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        reasonCounts,optimizerEpisodes:h.learning?.episodes??null,esSamplesProducedForNextGeneration:sim.lastOptimizerSampleCount??null,
        esSampledCarsAtStart:sim.cars.filter(c=>c.esSampled===true).length,terminalOutcomes:outcomes});
      console.log('COHERENT_ES_FOLLOWUP_GENERATION '+JSON.stringify({generation:h.generation,leader:leader&&{id:leader.id,progressM:leader.progressM},
        safeAgentCount:safe.length,maxLaps:rows.at(-1).maxLaps,esSamples:rows.at(-1).esSampledCarsAtStart}));
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
  const control=baseline.control,build=loadCoherentEs(require.resolve(path.join(root,'outputs/simulation.js'))),
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
    finalSafeProgressDeltaM=pairs.at(-1).safeProgressDeltaM,maxLaps=Math.max(...control.perGeneration.map(g=>g.maxLaps),...treatment.rows.map(g=>g.maxLaps));
  const report={format:'male-cns-saved-v3-coherent-es-10gen-followup-v1',appVersion:'5.6.0',passed:initialMatches&&saveUnchanged&&sourcesUnchanged&&treatment.rows.length===10,
    learningSucceeded:maxLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',settings:{naturalGenerationsPerArm:10,control:'recorded exact-source current production control; 10% ES sample cap and update uses all outcomes',
      treatment:`${Math.round(sampleShare*100)}% ES sample cap; distribution update uses only descendants actually sampled from that ES generation`},
    method:`Uses the control already recorded by the exact-source ten-generation A/B. Treatment restores the same checkpoint, tags only transient ES samples in memory and excludes non-ES offspring from mean/sigma updates while retaining a ${Math.round(sampleShare*100)}% ES sample share. Physics, reward, sensor inputs, safe-parent selection, non-ES offspring, track and random stream remain the same. No tag is persisted.`,
    controlMatchesPriorEightGenerationReplay:baseline.controlMatchesPriorEightGenerationReplay,initialMatches,control,treatment,pairedComparison:{pairs,finalSafeProgressDeltaM,
      bestSafeProgressDeltaM:Math.max(...pairs.map(p=>p.safeProgressDeltaM)),treatmentMaxLaps:Math.max(...treatment.rows.map(g=>g.maxLaps)),controlMaxLaps:Math.max(...control.perGeneration.map(g=>g.maxLaps)),
      generationsWithBetterSafeProgress:pairs.filter(p=>p.safeProgressDeltaM>1).map(p=>p.generation),generationsWithWorseSafeProgress:pairs.filter(p=>p.safeProgressDeltaM< -1).map(p=>p.generation)},
    integrity:{saveUnchanged,sourcesUnchanged,sourceHashes:{before,after},controlReportSha256:sha(fs.readFileSync(baselinePath)),treatmentSourceSha256:build.sourceSha256},
    boundary:'One saved checkpoint, circuit and RNG stream. Passing means replay/integrity only; this does not prove a completed lap, two-lap generation, other-seed replication or generalization.'};
  if(!report.passed)throw Error('Integrity gate failed');fs.mkdirSync(out,{recursive:false});
  const reportPath=path.join(out,'report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('COHERENT_ES_FOLLOWUP_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,initialMatches,
    controlFinal:control.perGeneration.at(-1),treatmentFinal:treatment.rows.at(-1),comparison:report.pairedComparison,saveUnchanged,sourcesUnchanged,
    report:reportPath,reportSha256:sha(fs.readFileSync(reportPath))}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
