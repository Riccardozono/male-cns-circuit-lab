'use strict';
// In-memory A/B of functional-block recombination for the saved V3/Monza policy.
// Production modules, the user's save, and release artifacts are read-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const defaultOut=path.join(root,'.impeccable/review/learning-ml/saved-v3-functional-block-crossover-source-ab-20261022-01');
const out=path.resolve(process.env.MALECNS_CROSSOVER_REPORT_DIR||defaultOut);
const postCheckpointSeed=process.env.MALECNS_CROSSOVER_POST_CHECKPOINT_SEED===undefined?null:Number(process.env.MALECNS_CROSSOVER_POST_CHECKPOINT_SEED);
if(postCheckpointSeed!==null&&(!Number.isSafeInteger(postCheckpointSeed)||postCheckpointSeed<=0))throw Error('Post-checkpoint seed must be a positive safe integer');
const P=require(path.join(root,'outputs/progress-save.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const circuits=require(path.join(root,'outputs/data/circuits.json'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));

function replaceOnce(source,oldText,newText,label){
  const i=source.indexOf(oldText);
  if(i<0||source.indexOf(oldText,i+oldText.length)>=0)throw Error(`Expected one source anchor: ${label}`);
  return source.slice(0,i)+newText+source.slice(i+oldText.length);
}

function compileSimulation(file,enableBlockCrossover){
  let source=fs.readFileSync(file,'utf8');
  const productionGate="const useFunctionalCrossover=this.modelId==='v3'&&donorCandidates.length>0&&this.random()<EVOLUTION_RULES.functionalCrossoverRate;";
  if(enableBlockCrossover){if(!source.includes(productionGate))throw Error('Production treatment gate is missing');}
  else source=replaceOnce(source,productionGate,'const useFunctionalCrossover=false;','disable only V3 functional crossover for the in-memory control');
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);m.loaded=true;
  return {api:m.exports,sourceSha256:sha(source)};
}

function runArm(F,state,data,name,generations=5,postSeed=null){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.restore(sim,structuredClone(state));if(postSeed!==null)sim.random=F.rng(postSeed);sim.running=true;
  const first=sim.generation,rows=[];let generationTicks=0,totalTicks=0,terminal=new Map(),started=Date.now();
  sim.onTrialTick=s=>{if(s.cars.every(c=>!c.alive))for(const car of s.cars)if(!terminal.has(car.id))terminal.set(car.id,{id:car.id,
    progressM:car.bestProgress/(s.track.pixelsPerMeter||1),laps:car.laps,fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car)});};
  while(sim.generation<first+generations){
    if(generationTicks>=60000)throw Error(`${name}: generation watchdog`);
    const g=sim.generation;sim.tick();generationTicks++;totalTicks++;
    if(sim.generation!==g){
      if(terminal.size!==state.population)throw Error(`${name}: incomplete terminal census`);
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),history=sim.history.at(-1);
      const row={generation:history.generation,offspringGeneration:sim.generation,ticks:generationTicks,safeAgentCount:safe.length,unsafeCount:outcomes.length-safe.length,
        bestSafeProgressM:safe.length?Math.max(...safe.map(x=>x.progressM)):null,maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        bestSafeFitness:safe.length?Math.max(...safe.map(x=>x.fitness)):null,functionalCrossoverCount:sim.lastFunctionalCrossoverCount||0,
        terminalOutcomes:outcomes};
      rows.push(row);
      console.log('FUNCTIONAL_BLOCK_CROSSOVER_GENERATION '+JSON.stringify({arm:name,generation:row.generation,offspringGeneration:row.offspringGeneration,bestSafeProgressM:row.bestSafeProgressM,
        maxSafeLaps:row.maxSafeLaps,safeAgentCount:row.safeAgentCount,functionalCrossoverCount:row.functionalCrossoverCount}));
      terminal=new Map();generationTicks=0;
    }
  }
  sim.running=false;
  return {name,startGeneration:first,seed:state.seed,population:state.population,rows,totalTicks,wallSeconds:(Date.now()-started)/1000};
}

async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 required');
  if(fs.existsSync(out))throw Error('Refusing to overwrite crossover report');
  const saveBytes=fs.readFileSync(savePath),saveSha=sha(saveBytes),decoded=await P.decode(saveBytes.toString('utf8'),'5.6.0');
  const state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.population!==40||state.rewardRevision!=='progress-3')
    throw Error('Unexpected V3/Monza checkpoint identity');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const before=sourceHashes(),simFile=require.resolve(path.join(root,'outputs/simulation.js'));
  const controlBuild=compileSimulation(simFile,false),treatmentBuild=compileSimulation(simFile,true);
  const control=runArm(controlBuild.api,state,data,'current-mutation-no-crossovers',5,postCheckpointSeed);
  const prior=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/saved-v3-practice-progress-acceptance-ab-20261022-01/report.json'),'utf8'));
  const expected=prior.control.rows[0].terminalOutcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe}));
  const observed=control.rows[0].terminalOutcomes.map(({id,progressM,laps,reason,safe})=>({id,progressM,laps,reason,safe}));
  const exactInitial=JSON.stringify(expected)===JSON.stringify(observed);
  if(!exactInitial)throw Error('Current control failed exact checkpoint generation-64 replay');
  const treatment=runArm(treatmentBuild.api,state,data,`functional-block-crossover-${Math.round(treatmentBuild.api.EVOLUTION_RULES.functionalCrossoverRate*100)}pct`,5,postCheckpointSeed);
  const after=sourceHashes(),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,sourcesUnchanged=JSON.stringify(before)===JSON.stringify(after);
  const maxSafeLaps=Math.max(...control.rows.map(r=>r.maxSafeLaps),...treatment.rows.map(r=>r.maxSafeLaps));
  const report={format:'male-cns-saved-v3-functional-block-crossover-ab-v1',appVersion:'5.6.0',passed:Boolean(exactInitial&&saveUnchanged&&sourcesUnchanged&&control.rows.length===5&&treatment.rows.length===5),
    learningSucceeded:maxSafeLaps>=2,save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',worker:0,generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    runtime:'Node 24.19.0 CPU-only',postCheckpointSeed:postCheckpointSeed===null?null:{seed:postCheckpointSeed,scope:'Evolutionary RNG replaced only after exact saved generation-64 state is restored; paired across arms. The starting population and physical generation-64 replay are unchanged.'},
    settings:{naturalGenerationsPerArm:5,crossoverProbability:treatmentBuild.api.EVOLUTION_RULES.functionalCrossoverRate,crossoverRate:`${Math.round(treatmentBuild.api.EVOLUTION_RULES.functionalCrossoverRate*100)}% of the existing motor-readout offspring family for V3 when at least two distinct safe elite genotypes are available`,
      blocks:['sensor gains 0-27','sensor biases 28-55','shared synaptic log-gains','complete steering readout plus bias','complete longitudinal readout plus bias'],
      postCrossoverMutation:'same safe motor mutation as production; full physical episode reward decides selection'},
    method:`Paired natural full-population evolution from exact in-memory copies of the saved V3 worker-0 checkpoint. Control compiles the same current source with only the V3 crossover gate disabled; treatment uses the production gate and recombines complete functional parameter blocks from two distinct safe elite policies for ${Math.round(treatmentBuild.api.EVOLUTION_RULES.functionalCrossoverRate*100)}% of offspring in the existing motor-readout family, then applies the same safe-motor mutation. Connectome, recurrent dynamics, sensors, physics, rewards, parent safety, selection, RNG seed, population and original checkpoint are unchanged. No route teacher or action override.`,
    controlReplayMatchesPriorGeneration64:exactInitial,inMemoryControlSourceSha256:controlBuild.sourceSha256,control,treatment,
    comparison:{safeProgressDeltaMetersByGeneration:treatment.rows.map((r,i)=>r.bestSafeProgressM-control.rows[i].bestSafeProgressM),
      safeLapDeltaByGeneration:treatment.rows.map((r,i)=>r.maxSafeLaps-control.rows[i].maxSafeLaps),
      controlProgressM:control.rows.map(r=>r.bestSafeProgressM),treatmentProgressM:treatment.rows.map(r=>r.bestSafeProgressM),
      treatmentCrossoverCountByOffspringGeneration:treatment.rows.map(r=>({generation:r.offspringGeneration,count:r.functionalCrossoverCount})),promoteTreatment:false},
    benchmarkRunnerSha256:sha(fs.readFileSync(__filename)),inMemoryTreatmentSourceSha256:treatmentBuild.sourceSha256,productionSourceHashes:{before,after,unchanged:sourcesUnchanged},
    boundary:'One saved worker/genotype and one circuit over five natural generations per arm. If postCheckpointSeed is set, only the evolutionary RNG after restoring the exact saved state is independently seeded; this is stochastic replication, not an independent initial population. Passing verifies baseline replay and integrity only; learning improvement requires persistent safe complete laps and replication. The local 5.6.0 simulation source contains the treatment under test; the benchmark itself writes no application source, user save, package, tag or release.'};
  if(!report.passed)throw Error('Integrity gate failed');
  fs.mkdirSync(out,{recursive:false});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('FUNCTIONAL_BLOCK_CROSSOVER_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,sourcesUnchanged,exactInitial,
    control:control.rows.map(r=>({generation:r.generation,progress:r.bestSafeProgressM,laps:r.maxSafeLaps})),
    treatment:treatment.rows.map(r=>({generation:r.generation,progress:r.bestSafeProgressM,laps:r.maxSafeLaps,crossovers:r.functionalCrossoverCount})),
    delta:report.comparison.safeProgressDeltaMetersByGeneration,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
