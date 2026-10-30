'use strict';
// Research-only paired A/B: among safe no-lap policies, compare current
// progress-first ordering with fitness-first ordering. Safety and lap count
// remain higher priorities in both arms; the exact gen.109 outcomes must match.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save');
const out=path.resolve(process.env.MALECNS_V3_GEN109_FITNESS_FIRST_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-safe-fitness-first-ab-20261022-01'));
const generations=Math.max(2,Math.min(3,Number.parseInt(process.env.MALECNS_V3_GEN109_FITNESS_FIRST_GENERATIONS||'2',10)||2));
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/dense-neural.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function replaceOnce(source,oldText,newText,label){const i=source.indexOf(oldText);if(i<0||source.indexOf(oldText,i+oldText.length)>=0)throw Error(`Expected one source anchor: ${label}`);return source.slice(0,i)+newText+source.slice(i+oldText.length);}
function compileSimulation(file,fitnessFirst){
  let source=fs.readFileSync(file,'utf8');
  if(fitnessFirst){
    const oldComparator=`    if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;
    const aFitness=Number.isFinite(a?.fitness)?a.fitness:-Infinity,bFitness=Number.isFinite(b?.fitness)?b.fitness:-Infinity;if(aFitness!==bFitness)return bFitness-aFitness;`;
    const newComparator=`    const aFitness=Number.isFinite(a?.fitness)?a.fitness:-Infinity,bFitness=Number.isFinite(b?.fitness)?b.fitness:-Infinity;if(aFitness!==bFitness)return bFitness-aFitness;
    if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;`;
    source=replaceOnce(source,oldComparator,newComparator,'safe no-lap comparator');
  }
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);m.loaded=true;
  return {api:m.exports,sourceSha256:sha(source)};
}
function runArm(F,state,payload,data,circuits,name){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,structuredClone(state));sim.running=true;
  const first=sim.generation,rows=[],started=performance.now();let ticksInGeneration=0,totalTicks=0,terminal=new Map(),lastLog=started;
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),
      laps:car.laps,fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car)});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('FITNESS_FIRST_PROGRESS '+JSON.stringify({arm:name,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,terminal:terminal.size}));}
  };
  while(sim.generation<first+generations){
    if(ticksInGeneration>=60000)throw Error(`${name}: generation watchdog`);
    const g=sim.generation;sim.tick();ticksInGeneration++;totalTicks++;
    if(sim.generation!==g){
      if(terminal.size!==state.population)throw Error(`${name}: terminal census ${terminal.size}/${state.population}`);
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),h=sim.history.at(-1),leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||b.laps-a.laps)[0]||null;
      rows.push({generation:h.generation,ticks:ticksInGeneration,safeAgentCount:safe.length,unsafeAgentCount:outcomes.length-safe.length,
        bestSafeProgressM:leader?.progressM??null,maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        bestSafeFitness:safe.length?Math.max(...safe.map(x=>x.fitness)):-Infinity,historyFitnessLeader:h.best,outcomes});
      console.log('FITNESS_FIRST_GENERATION '+JSON.stringify({arm:name,generation:h.generation,bestSafeProgressM:leader?.progressM??null,maxSafeLaps:rows.at(-1).maxSafeLaps,safeAgentCount:safe.length}));
      terminal=new Map();ticksInGeneration=0;
    }
  }
  sim.running=false;return {name,startGeneration:first,seed:state.seed,population:state.population,rows,totalTicks,wallSeconds:(performance.now()-started)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing diagnostic output: ${out}`);
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Expected exact V3/Monza gen.109 checkpoint');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json')),
    beforeSources=sourceHashes(),simFile=require.resolve(path.join(root,'outputs/simulation.js')),
    controlBuild=compileSimulation(simFile,false),treatmentBuild=compileSimulation(simFile,true),originalDenseStep=Dense.step;
  Dense.step=(...args)=>Cuda.pass(...args);let arms=[],gpu;
  try{
    arms.push(runArm(controlBuild.api,state,decoded.payload,data,circuits,'safe-progress-first'));
    arms.push(runArm(treatmentBuild.api,state,decoded.payload,data,circuits,'safe-fitness-first'));
    gpu=Cuda.stats();
  }finally{Dense.step=originalDenseStep;Cuda.close();}
  const afterSources=sourceHashes(),sourcesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
    control=arms[0],treatment=arms[1],pairedStartOutcomes=JSON.stringify(control.rows[0]?.outcomes)===JSON.stringify(treatment.rows[0]?.outcomes),
    completeRows=arms.every(arm=>arm.rows.length===generations&&arm.rows.every(row=>row.outcomes.length===state.population)),
    safeLaps=Math.max(...arms.flatMap(arm=>arm.rows.map(row=>row.maxSafeLaps))),
    report={format:'male-cns-saved-v3-gen109-safe-fitness-first-ab-v1',appVersion:'5.6.0',passed:Boolean(saveUnchanged&&sourcesUnchanged&&pairedStartOutcomes&&completeRows&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0),
      learningSucceeded:safeLaps>=2,checkpoint:{path:savePath,sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:109,seed:7717,population:100,rewardRevision:state.rewardRevision},
      settings:{naturalGenerationsPerArm:generations,control:'safe outcomes rank by lap count, then physical progress, then fitness',treatment:'safe outcomes rank by lap count, then real saved-revision fitness, then physical progress',
        onlyComparatorDifference:true,safetyAndLapPriorityUnchanged:true,gpuBackend:'exact V3 CUDA neural pass; CPU physics'},
      pairedStartOutcomes,arms,comparison:{safeProgressDeltaMByGeneration:treatment.rows.map((row,index)=>row.bestSafeProgressM-control.rows[index].bestSafeProgressM),
        safeLapDeltaByGeneration:treatment.rows.map((row,index)=>row.maxSafeLaps-control.rows[index].maxSafeLaps),safeAgentCountDeltaByGeneration:treatment.rows.map((row,index)=>row.safeAgentCount-control.rows[index].safeAgentCount)},
      inMemoryTreatmentSimulationSha256:treatmentBuild.sourceSha256,sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourcesUnchanged},cuda:gpu,
      boundary:'Single V3/Monza seed and 100-agent saved checkpoint; two natural generations per arm. Exact gen.109 outcomes verify pairing, not learning. A short-run difference is local only; two laps and generalization remain unproven. No application source, save, version, release, tag, portable or installer is modified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('FITNESS_FIRST_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,pairedStartOutcomes,comparison:report.comparison,
    arms:arms.map(arm=>({name:arm.name,rows:arm.rows.map(row=>({generation:row.generation,bestSafeProgressM:row.bestSafeProgressM,maxSafeLaps:row.maxSafeLaps,safeAgentCount:row.safeAgentCount})),wallSeconds:arm.wallSeconds})),cuda:gpu,report:path.join(out,'report.json')}));
  if(!report.passed)throw Error('Integrity, exact paired-start, or GPU-only check failed; report preserved');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
