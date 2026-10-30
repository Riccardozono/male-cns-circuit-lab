'use strict';
// Test whether ES updates are diluted by offspring not sampled from its own
// distribution. Paired exact-save experiment; treatment is an in-memory patch.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/saved-v3-es-source-filter-ab-20261022-01');
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const replaceOnce=(source,oldText,newText,label)=>{
  const first=source.indexOf(oldText);if(first<0||source.indexOf(oldText,first+oldText.length)>=0)throw Error(`Expected one exact ${label} source anchor`);
  return source.slice(0,first)+newText+source.slice(first+oldText.length);
};

function compileSourceFilteredSimulation(file){
  let source=fs.readFileSync(file,'utf8');
  source=replaceOnce(source,
    'const normalized=genomes.map(g=>normalizeGenome(g,this.graph.outputs.length));',
    'const optimizerSampleFlags=genomes.map(g=>g.__esSample===true);const normalized=genomes.map(g=>normalizeGenome(g,this.graph.outputs.length));',
    'spawn input source flags');
  source=replaceOnce(source,
    'this.cars=normalized.map((g,i)=>{const car=makeCar(this.track,i,g,this.rewardRevision);car.footprintSensorsEnabled=this.graph.modelId===\'v3\';',
    'this.cars=normalized.map((g,i)=>{const car=makeCar(this.track,i,g,this.rewardRevision);car.esSampled=optimizerSampleFlags[i];car.footprintSensorsEnabled=this.graph.modelId===\'v3\';',
    'spawn car source flags');
  source=replaceOnce(source,
    'this.optimizer?.update(optimizerRanked,usesLearningOutcome?compareOptimizerAgents:undefined);',
    'this.optimizer?.update(optimizerRanked.filter(candidate=>candidate.esSampled===true),usesLearningOutcome?compareOptimizerAgents:undefined);',
    'ES source filter');
  source=replaceOnce(source,
    'child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);\n          genomes.push(child);optimizerSampleCount++;continue;',
    'child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);child.__esSample=true;\n          genomes.push(child);optimizerSampleCount++;continue;',
    'explicit ES offspring tag');
  source=replaceOnce(source,
    'else {child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);}',
    'else {child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);child.__esSample=true;}',
    'fallback ES offspring tag');
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);m.loaded=true;
  return {api:m.exports,sourceSha256:sha(source)};
}

function runArm(F,savedState,data,name,generations=5){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:savedState.population,
    circuitId:'monza',circuits,seed:savedState.seed});P.restore(sim,structuredClone(savedState));sim.running=true;
  const firstGeneration=sim.generation,rows=[];let generationTicks=0,totalTicks=0,terminal=new Map(),start=Date.now();
  sim.onTrialTick=s=>{
    if(s.cars.every(car=>!car.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{id:car.id,
      progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car)});
  };
  while(sim.generation<firstGeneration+generations){
    if(generationTicks>=60000)throw Error(`${name}: generation ${sim.generation} exceeded tick watchdog`);
    const generation=sim.generation;sim.tick();generationTicks++;totalTicks++;
    if(sim.generation!==generation){
      if(terminal.size!==savedState.population)throw Error(`${name}: terminal census incomplete for gen ${generation}`);
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),h=sim.history.at(-1);
      rows.push({generation:h.generation,ticks:generationTicks,safeAgentCount:safe.length,unsafeCount:outcomes.length-safe.length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        rawBestProgressM:Math.max(...outcomes.map(x=>x.progressM)),rawMaxLaps:Math.max(...outcomes.map(x=>x.laps)),fitnessLeader:h.best,
        stagnation:h.stagnation,mutationAmount:h.mutationAmount,historyOptimizerEpisodes:h.learning?.episodes??null,
        nextGenerationEsSampleCount:sim.lastOptimizerSampleCount??null,terminalOutcomes:outcomes});
      console.log('ES_SOURCE_FILTER_GENERATION '+JSON.stringify({arm:name,generation:h.generation,bestSafeProgressM:rows.at(-1).bestSafeProgressM,
        maxSafeLaps:rows.at(-1).maxSafeLaps,safeAgentCount:safe.length,optimizerEpisodes:h.learning?.episodes??null,ticks:generationTicks}));
      terminal=new Map();generationTicks=0;
    }
  }
  sim.running=false;
  return {name,startGeneration:firstGeneration,seed:savedState.seed,population:savedState.population,rows,totalTicks,wallSeconds:(Date.now()-start)/1000};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite existing ES source-filter report');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0');
  const payload=decoded.payload,savedState=payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||payload.modelId!=='v3'||payload.circuitId!=='monza'||savedState.generation!==64||
    savedState.seed!==7717||savedState.population!==40||savedState.rewardRevision!=='progress-3')throw Error('Unexpected saved V3/Monza checkpoint');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),
    productionBefore=sourceHashes(),simFile=require.resolve(path.join(root,'outputs/simulation.js')),
    Fcontrol=require(simFile),control=runArm(Fcontrol,savedState,data,'current-update-all-outcomes');
  const known=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-all-workers-3gen-20261022-01/report.json'),'utf8')),
    expected=known.workers[0].generations[0].outcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe})),
    observed=control.rows[0].terminalOutcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe}));
  const exactInitial=JSON.stringify(expected)===JSON.stringify(observed);
  if(!exactInitial)throw Error('Control did not exactly reproduce saved generation 64');
  const treatmentBuild=compileSourceFilteredSimulation(simFile),treatment=runArm(treatmentBuild.api,savedState,data,'update-only-own-es-samples');
  const safeLaps=Math.max(...control.rows.map(r=>r.maxSafeLaps),...treatment.rows.map(r=>r.maxSafeLaps)),productionAfter=sourceHashes();
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,sourcesUnchanged=JSON.stringify(productionBefore)===JSON.stringify(productionAfter);
  const report={format:'male-cns-saved-v3-es-source-filter-ab-v1',appVersion:'5.6.0',passed:Boolean(exactInitial&&saveUnchanged&&sourcesUnchanged&&control.rows.length===5&&treatment.rows.length===5),
    learningSucceeded:safeLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',worker:0,generation:64,seed:savedState.seed,population:savedState.population,rewardRevision:savedState.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',settings:{naturalGenerationsPerArm:5,control:'production: ES update ranks every optimizerRanked outcome',treatment:'in-memory: ES update ranks only genome descendants sampled from its own distribution'},
    method:'Paired full-population natural evolution from two exact in-memory copies of the saved worker-0 checkpoint. The treatment tags only offspring actually created by EvolutionStrategy.sample, propagates that transient provenance to their cars, and filters the ES mean/sigma update to those offspring. Safe-parent/champion selection, rewards, mutations, immigrants, frontier exploration, topology, recurrent brain, physics, sensors, population, seed and saved state are unchanged. The tag is not persisted.',
    controlReplayMatchesPriorGeneration64:exactInitial,control,treatment,
    comparison:{safeProgressDeltaMetersByGeneration:treatment.rows.map((row,i)=>row.bestSafeProgressM-control.rows[i].bestSafeProgressM),
      safeLapDeltaByGeneration:treatment.rows.map((row,i)=>row.maxSafeLaps-control.rows[i].maxSafeLaps),promoteTreatment:false},
    inMemoryTreatmentSourceSha256:treatmentBuild.sourceSha256,productionSourceHashes:{before:productionBefore,after:productionAfter,unchanged:sourcesUnchanged},
    boundary:'One saved worker, seed 7717, Monza, five natural generations per arm. Passing means parity/integrity only. Learning improvement requires persistent safe lap progress, ideally two laps and replication across seeds/circuits. No production file, save, app version, tag, package or release was modified.'};
  if(!report.passed)throw Error('ES lineage A/B failed exact replay or integrity checks');
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('ES_SOURCE_FILTER_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,sourcesUnchanged,exactInitial,
    control:control.rows.map(r=>({generation:r.generation,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps,esEpisodes:r.historyOptimizerEpisodes})),
    treatment:treatment.rows.map(r=>({generation:r.generation,bestSafeProgressM:r.bestSafeProgressM,maxSafeLaps:r.maxSafeLaps,esEpisodes:r.historyOptimizerEpisodes})),
    delta:report.comparison.safeProgressDeltaMetersByGeneration,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
