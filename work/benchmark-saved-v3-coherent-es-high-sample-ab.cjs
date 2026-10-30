'use strict';
// Paired natural-generation test: a coherent, higher-sample ES path.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-coherent-es-high-sample-ab-20261022-01');
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const files=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function replaceOnce(source,oldText,newText,label){const i=source.indexOf(oldText);if(i<0||source.indexOf(oldText,i+oldText.length)>=0)throw Error(`Expected one source anchor: ${label}`);return source.slice(0,i)+newText+source.slice(i+oldText.length);}
function loadCoherentEs(simFile){
  let source=fs.readFileSync(simFile,'utf8');
  source=replaceOnce(source,'const normalized=genomes.map(g=>normalizeGenome(g,this.graph.outputs.length));',
    'const optimizerSampleFlags=genomes.map(g=>g.__esSample===true);const normalized=genomes.map(g=>normalizeGenome(g,this.graph.outputs.length));','spawn source flags');
  source=replaceOnce(source,'this.cars=normalized.map((g,i)=>{const car=makeCar(this.track,i,g,this.rewardRevision);car.footprintSensorsEnabled=this.graph.modelId===\'v3\';',
    'this.cars=normalized.map((g,i)=>{const car=makeCar(this.track,i,g,this.rewardRevision);car.esSampled=optimizerSampleFlags[i];car.footprintSensorsEnabled=this.graph.modelId===\'v3\';','spawn car flags');
  source=replaceOnce(source,'this.optimizer?.update(optimizerRanked,usesLearningOutcome?compareOptimizerAgents:undefined);',
    'this.optimizer?.update(optimizerRanked.filter(candidate=>candidate.esSampled===true),usesLearningOutcome?compareOptimizerAgents:undefined);','ES update filter');
  source=replaceOnce(source,
    'const optimizerSampleTarget=usesLearningOutcome&&baseMutation>0&&!noSafeLearningCandidate\n         ?Math.min(Math.max(1,Math.floor(this.population*.1)),',
    'const optimizerSampleTarget=usesLearningOutcome&&baseMutation>0&&!noSafeLearningCandidate\n         ?Math.min(Math.max(1,Math.floor(this.population*.5)),','ES sample share 50 percent');
  source=replaceOnce(source,'child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);\n          genomes.push(child);optimizerSampleCount++;continue;',
    'child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);child.__esSample=true;\n          genomes.push(child);optimizerSampleCount++;continue;','primary ES sample lineage');
  source=replaceOnce(source,'else {child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);}',
    'else {child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);child.__esSample=true;}','secondary ES sample lineage');
  const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));m._compile(source,simFile);m.loaded=true;
  return {api:m.exports,sourceSha256:sha(source)};
}
function runArm(F,savedState,data,name,generations=5){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:savedState.population,circuitId:'monza',circuits,seed:savedState.seed});
  P.restore(sim,structuredClone(savedState));sim.running=true;const first=sim.generation,rows=[];let ticks=0,genTicks=0,terminal=new Map(),started=Date.now();
  sim.onTrialTick=s=>{if(s.cars.every(c=>!c.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{id:car.id,
    progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,reason:car.reason||'',fitness:car.fitness,safe:F.isSafeLearningOutcome(car)});};
  while(sim.generation<first+generations){if(genTicks>=60000)throw Error(`${name}: generation tick watchdog`);const old=sim.generation;sim.tick();ticks++;genTicks++;
    if(sim.generation!==old){if(terminal.size!==savedState.population)throw Error(`${name}: incomplete population census`);
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),h=sim.history.at(-1);
      rows.push({generation:h.generation,ticks:genTicks,safeAgentCount:safe.length,unsafeCount:outcomes.length-safe.length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        rawBestProgressM:Math.max(...outcomes.map(x=>x.progressM)),rawMaxLaps:Math.max(...outcomes.map(x=>x.laps)),fitnessLeader:h.best,
        optimizerEpisodes:h.learning?.episodes??null,esSamplesProducedForNextGeneration:sim.lastOptimizerSampleCount??null,
        esSampledCarsAtStart:sim.cars.filter(c=>c.esSampled===true).length,terminalOutcomes:outcomes});
      console.log('COHERENT_ES_GENERATION '+JSON.stringify({arm:name,generation:h.generation,bestSafeProgressM:rows.at(-1).bestSafeProgressM,
        maxSafeLaps:rows.at(-1).maxSafeLaps,esSamplesProduced:rows.at(-1).esSamplesProducedForNextGeneration,esSampledCars:rows.at(-1).esSampledCarsAtStart}));
      terminal=new Map();genTicks=0;}}
  sim.running=false;return {name,startGeneration:first,seed:savedState.seed,population:savedState.population,rows,ticks,wallSeconds:(Date.now()-started)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 required');if(fs.existsSync(out))throw Error('Refusing to overwrite report');
  const bytes=fs.readFileSync(savePath),saveSha=sha(bytes),decoded=await P.decode(bytes.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')throw Error('Unexpected saved V3/Monza identity');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),before=sourceHashes(),simFile=require.resolve(path.join(root,'outputs/simulation.js')),
    control=runArm(require(simFile),state,data,'production-es-10-percent-all-outcomes');
  const previous=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-all-workers-3gen-20261022-01/report.json'),'utf8')),
    expected=previous.workers[0].generations[0].outcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe})),
    observed=control.rows[0].terminalOutcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe})),exactInitial=JSON.stringify(expected)===JSON.stringify(observed);
  if(!exactInitial)throw Error('Production control gen64 failed exact replay');
  const treatmentBuild=loadCoherentEs(simFile),treatment=runArm(treatmentBuild.api,state,data,'coherent-es-50-percent-own-samples');
  const after=sourceHashes(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,sourcesUnchanged=JSON.stringify(before)===JSON.stringify(after),
    maxLaps=Math.max(...control.rows.map(r=>r.maxSafeLaps),...treatment.rows.map(r=>r.maxSafeLaps));
  const report={format:'male-cns-saved-v3-coherent-es-high-sample-ab-v1',appVersion:'5.6.0',passed:Boolean(exactInitial&&saveUnchanged&&sourcesUnchanged&&control.rows.length===5&&treatment.rows.length===5),
    learningSucceeded:maxLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',worker:0,generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',settings:{naturalGenerationsPerArm:5,control:'current production: 10 percent ES sample cap; distribution update sees all outcomes',treatment:'50 percent cap over available offspring; distribution update sees only ES-sampled descendants'},
    method:'Exact paired in-memory replay of the saved checkpoint. Treatment changes only ES sample share and the statistical set used to update its mean/sigma. Actual ES sample lineage is transiently tagged; all physical evaluations, safe parent selection, reward rules, mutations, frontier, population, seed and controller topology remain active. No tag is saved.',
    controlReplayMatchesPriorGeneration64:exactInitial,control,treatment,comparison:{safeProgressDeltaMetersByGeneration:treatment.rows.map((row,i)=>row.bestSafeProgressM-control.rows[i].bestSafeProgressM),
      safeLapDeltaByGeneration:treatment.rows.map((row,i)=>row.maxSafeLaps-control.rows[i].maxSafeLaps),promoteTreatment:false},
    inMemoryTreatmentSourceSha256:treatmentBuild.sourceSha256,productionSourceHashes:{before,after,unchanged:sourcesUnchanged},
    boundary:'One worker, seed, circuit and five natural generations. The A/B can reject/promote only a short-horizon research candidate; two safe laps and replication remain required. No production source, save, model weights, app version, tag, package or release changed.'};
  if(!report.passed)throw Error('Integrity gate failed');fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('COHERENT_ES_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,sourcesUnchanged,exactInitial,
    control:control.rows.map(r=>({generation:r.generation,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps,esSamples:r.esSamplesProducedForNextGeneration})),
    treatment:treatment.rows.map(r=>({generation:r.generation,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps,esSamples:r.esSamplesProducedForNextGeneration})),
    delta:report.comparison.safeProgressDeltaMetersByGeneration,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
