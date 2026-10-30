'use strict';
// Research-only paired A/B from the exact V3/Monza gen.109 checkpoint.
// Treatment changes only the focus of stalled-safe-frontier offspring to a
// joint steering + longitudinal readout mutation. Physics, reward, sensors,
// parent selection, optimizer state and the checkpoint remain untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save');
const out=path.resolve(process.env.MALECNS_V3_GEN109_FRONTIER_COMBINED_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-frontier-combined-focus-ab-20261022-01'));
const generations=Math.max(2,Math.min(3,Number.parseInt(process.env.MALECNS_V3_GEN109_FRONTIER_COMBINED_GENERATIONS||'2',10)||2));
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/dense-neural.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function compileSimulation(file,combinedFrontier){
  let source=fs.readFileSync(file,'utf8');
  if(combinedFrontier){
    const oldFocus="const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'longitudinal':null;";
    const newFocus="const frontierMutationFocus=stagnantFrontier?'combined':null;";
    const index=source.indexOf(oldFocus);
    if(index<0||source.indexOf(oldFocus,index+oldFocus.length)>=0)throw Error('Expected exactly one current frontier mutation focus');
    source=source.slice(0,index)+newFocus+source.slice(index+oldFocus.length);
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
      laps:car.laps,fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car),speedMps:car.vehicle?.speedMps??car.speed??null,
      outputs:Array.isArray(car.outputs)?car.outputs.slice(0,3):null});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('FRONTIER_COMBINED_PROGRESS '+JSON.stringify({arm:name,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,terminal:terminal.size}));}
  };
  while(sim.generation<first+generations){
    if(ticksInGeneration>=60000)throw Error(`${name}: generation watchdog`);
    const g=sim.generation;sim.tick();ticksInGeneration++;totalTicks++;
    if(sim.generation!==g){
      if(terminal.size!==state.population)throw Error(`${name}: terminal census ${terminal.size}/${state.population}`);
      const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(x=>x.safe),h=sim.history.at(-1),
        leader=safe.slice().sort((a,b)=>b.progressM-a.progressM||a.fitness-b.fitness)[0]||null;
      if(!h||h.generation!==g)throw Error(`${name}: missing completed history for generation ${g}`);
      rows.push({generation:h.generation,ticks:ticksInGeneration,safeAgentCount:safe.length,unsafeAgentCount:outcomes.length-safe.length,
        bestSafeProgressM:leader?.progressM??null,maxSafeLaps:safe.length?Math.max(...safe.map(x=>x.laps)):0,
        safeLeader:leader,bestSafeFitness:safe.length?Math.max(...safe.map(x=>x.fitness)):-Infinity,
        meanSafeProgressM:safe.length?safe.reduce((sum,x)=>sum+x.progressM,0)/safe.length:null,
        stagnation:h.stagnation,mutationAmount:h.mutationAmount,outcomes});
      console.log('FRONTIER_COMBINED_GENERATION '+JSON.stringify({arm:name,generation:h.generation,bestSafeProgressM:leader?.progressM??null,
        maxSafeLaps:rows.at(-1).maxSafeLaps,safeAgentCount:safe.length,stagnation:h.stagnation,frontier:sim.lastFrontierDiagnostics||null}));
      terminal=new Map();ticksInGeneration=0;
    }
  }
  sim.running=false;return {name,startGeneration:first,seed:state.seed,population:state.population,rows,totalTicks,wallSeconds:(performance.now()-started)/1000};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing diagnostic output: ${out}`);
  const raw=fs.readFileSync(savePath),saveSha=sha(raw),decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Expected exact V3/Monza gen.109 research checkpoint');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json')),
    beforeSources=sourceHashes(),simFile=require.resolve(path.join(root,'outputs/simulation.js')),
    controlBuild=compileSimulation(simFile,false),treatmentBuild=compileSimulation(simFile,true),originalDenseStep=Dense.step;
  Dense.step=(...args)=>Cuda.pass(...args);let arms=[],gpu;
  try{
    arms.push(runArm(controlBuild.api,state,decoded.payload,data,circuits,'current-frontier-focus'));
    arms.push(runArm(treatmentBuild.api,state,decoded.payload,data,circuits,'combined-steering-longitudinal-frontier'));
    gpu=Cuda.stats();
  }finally{Dense.step=originalDenseStep;Cuda.close();}
  const afterSources=sourceHashes(),sourcesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
    control=arms[0],treatment=arms[1],pairedStartOutcomes=JSON.stringify(control.rows[0]?.outcomes)===JSON.stringify(treatment.rows[0]?.outcomes),
    completeRows=arms.every(arm=>arm.rows.length===generations&&arm.rows.every(row=>row.outcomes.length===state.population)),
    safeLaps=Math.max(...arms.flatMap(arm=>arm.rows.map(row=>row.maxSafeLaps))),
    report={format:'male-cns-saved-v3-gen109-frontier-combined-focus-ab-v1',appVersion:'5.6.0',passed:Boolean(saveUnchanged&&sourcesUnchanged&&pairedStartOutcomes&&completeRows&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0),
      learningSucceeded:safeLaps>=2,checkpoint:{path:savePath,sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:109,seed:7717,population:100,rewardRevision:state.rewardRevision},
      settings:{naturalGenerationsPerArm:generations,control:'current frontier mutation focus',treatment:'for every stagnant safe-frontier offspring, force joint steering and longitudinal readout perturbation instead of current conditional/random focus',onlyTreatmentDifference:true,
        gpuBackend:'exact V3 CUDA neural pass; CPU physics',runtime:process.versions.node},pairedStartOutcomes,arms,
      comparison:{safeProgressDeltaMByGeneration:treatment.rows.map((row,index)=>row.bestSafeProgressM-control.rows[index].bestSafeProgressM),
        safeLapDeltaByGeneration:treatment.rows.map((row,index)=>row.maxSafeLaps-control.rows[index].maxSafeLaps),
        safeAgentCountDeltaByGeneration:treatment.rows.map((row,index)=>row.safeAgentCount-control.rows[index].safeAgentCount)},
      treatmentSimulationSha256:treatmentBuild.sourceSha256,sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourcesUnchanged},cuda:gpu,
      boundary:'Single V3/Monza seed and 100-agent gen.109 checkpoint; two natural generations per arm. Matching generation-109 outcomes prove paired evaluation, not learning. A local gain is exploratory only; two laps, persistence, other seeds/circuits and cold starts remain unproven. No application source, user save, version, release, tag, portable or installer is modified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('FRONTIER_COMBINED_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,pairedStartOutcomes,comparison:report.comparison,
    arms:arms.map(arm=>({name:arm.name,rows:arm.rows.map(row=>({generation:row.generation,bestSafeProgressM:row.bestSafeProgressM,maxSafeLaps:row.maxSafeLaps,safeAgentCount:row.safeAgentCount,safeLeader:row.safeLeader})),wallSeconds:arm.wallSeconds})),cuda:gpu,report:path.join(out,'report.json')}));
  if(!report.passed)throw Error('Integrity, exact paired-start, or GPU-only check failed; report preserved');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
