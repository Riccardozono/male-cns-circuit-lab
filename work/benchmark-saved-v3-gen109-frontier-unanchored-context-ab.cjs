'use strict';
// Research-only paired A/B from the exact V3/Monza gen.109 checkpoint.
// Treatment changes only the null-space protection of the most-visited neural
// context for safe-frontier offspring; ordinary offspring keep current logic.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save');
const out=path.resolve(process.env.MALECNS_V3_GEN109_UNANCHORED_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-frontier-unanchored-context-ab-20261022-01'));
const generations=Math.max(2,Math.min(3,Number.parseInt(process.env.MALECNS_V3_GEN109_UNANCHORED_GENERATIONS||'2',10)||2));
const P=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/dense-neural.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function replaceOnce(source,oldText,newText,label){const index=source.indexOf(oldText);if(index<0||source.indexOf(oldText,index+oldText.length)>=0)throw Error(`Expected exactly one source anchor: ${label}`);return source.slice(0,index)+newText+source.slice(index+oldText.length);}
function compileTreatment(simFile,neuralFile){
  let neuralSource=fs.readFileSync(neuralFile,'utf8');
  neuralSource=replaceOnce(neuralSource,'function safeMotorMutation(graph,values,r,amount,experience,focus=null){',
    'function safeMotorMutation(graph,values,r,amount,experience,focus=null,preserveAnchor=true){','safe motor signature');
  neuralSource=replaceOnce(neuralSource,'for(const centre of sorted.slice(0,1)){','for(const centre of sorted.slice(0,preserveAnchor?1:0)){','context anchor loop');
  const compiledLearning=new Module(neuralFile,module);compiledLearning.filename=neuralFile;compiledLearning.paths=Module._nodeModulePaths(path.dirname(neuralFile));
  compiledLearning._compile(neuralSource,neuralFile);compiledLearning.loaded=true;
  let simSource=fs.readFileSync(simFile,'utf8');
  simSource=replaceOnce(simSource,
    'Learning.safeMotorMutation(this.graph,frontierParent.genome.policyWeights,this.random,childMutationAmount(),frontierParent.brain?.policyExperience,frontierMutationFocus);',
    'Learning.safeMotorMutation(this.graph,frontierParent.genome.policyWeights,this.random,childMutationAmount(),frontierParent.brain?.policyExperience,frontierMutationFocus,false);',
    'frontier-only unanchored mutation call');
  const previous=require.cache[neuralFile];require.cache[neuralFile]=compiledLearning;
  try{
    const compiledSimulation=new Module(simFile,module);compiledSimulation.filename=simFile;compiledSimulation.paths=Module._nodeModulePaths(path.dirname(simFile));
    compiledSimulation._compile(simSource,simFile);compiledSimulation.loaded=true;
    return {api:compiledSimulation.exports,neuralSha256:sha(neuralSource),simulationSha256:sha(simSource)};
  }finally{if(previous)require.cache[neuralFile]=previous;else delete require.cache[neuralFile];}
}
function experienceSummary(car){
  const experience=car.brain?.policyExperience,features=car.brain?.policyFeatures,centres=experience?.centres||[];
  let nearest=null,nearestDistance=Infinity;
  if(features&&typeof features.length==='number')for(const centre of centres){if(!centre.values||centre.values.length!==features.length)continue;let distance=0;for(let i=0;i<features.length;i++)distance+=(features[i]-centre.values[i])**2;distance/=Math.max(1,features.length);if(distance<nearestDistance){nearestDistance=distance;nearest=centre;}}
  return {samples:experience?.samples??null,centreCount:centres.length,topCentreCount:centres.length?Math.max(...centres.map(c=>c.count||0)):null,
    nearestTerminalCentreCount:nearest?.count??null,nearestTerminalDistance:Number.isFinite(nearestDistance)?nearestDistance:null};
}
function runArm(F,state,payload,data,circuits,name){
  const sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,structuredClone(state));sim.running=true;
  const first=sim.generation,rows=[],started=performance.now();let ticksInGeneration=0,totalTicks=0,terminal=new Map(),lastLog=started;
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,{id:car.id,progressM:car.bestProgress/(s.track.pixelsPerMeter||1),
      laps:car.laps,fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car),speedMps:car.vehicle?.speedMps??car.speed??null,
      outputs:Array.isArray(car.outputs)?car.outputs.slice(0,3):null,experience:experienceSummary(car)});
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('UNANCHORED_CONTEXT_PROGRESS '+JSON.stringify({arm:name,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,terminal:terminal.size}));}
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
      console.log('UNANCHORED_CONTEXT_GENERATION '+JSON.stringify({arm:name,generation:h.generation,bestSafeProgressM:leader?.progressM??null,
        maxSafeLaps:rows.at(-1).maxSafeLaps,safeAgentCount:safe.length,stagnation:h.stagnation,frontier:sim.lastFrontierDiagnostics||null,leaderExperience:leader?.experience||null}));
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
    beforeSources=sourceHashes(),simFile=require.resolve(path.join(root,'outputs/simulation.js')),neuralFile=require.resolve(path.join(root,'outputs/neural-learning.js')),
    controlBuild=(()=>{const m=new Module(simFile,module);m.filename=simFile;m.paths=Module._nodeModulePaths(path.dirname(simFile));m._compile(fs.readFileSync(simFile,'utf8'),simFile);m.loaded=true;return {api:m.exports,neuralSha256:sha(fs.readFileSync(neuralFile)),simulationSha256:sha(fs.readFileSync(simFile))};})(),
    treatmentBuild=compileTreatment(simFile,neuralFile),originalDenseStep=Dense.step;
  Dense.step=(...args)=>Cuda.pass(...args);let arms=[],gpu;
  try{
    arms.push(runArm(controlBuild.api,state,decoded.payload,data,circuits,'current-anchor'));
    arms.push(runArm(treatmentBuild.api,state,decoded.payload,data,circuits,'frontier-context-unanchored'));
    gpu=Cuda.stats();
  }finally{Dense.step=originalDenseStep;Cuda.close();}
  const afterSources=sourceHashes(),sourcesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
    control=arms[0],treatment=arms[1],pairedStartOutcomes=JSON.stringify(control.rows[0]?.outcomes)===JSON.stringify(treatment.rows[0]?.outcomes),
    completeRows=arms.every(arm=>arm.rows.length===generations&&arm.rows.every(row=>row.outcomes.length===state.population)),
    safeLaps=Math.max(...arms.flatMap(arm=>arm.rows.map(row=>row.maxSafeLaps))),
    report={format:'male-cns-saved-v3-gen109-frontier-unanchored-context-ab-v1',appVersion:'5.6.0',passed:Boolean(saveUnchanged&&sourcesUnchanged&&pairedStartOutcomes&&completeRows&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0),
      learningSucceeded:safeLaps>=2,checkpoint:{path:savePath,sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:109,seed:7717,population:100,rewardRevision:state.rewardRevision},
      settings:{naturalGenerationsPerArm:generations,control:'current null-space anchor in safeMotorMutation',treatment:'only safe-frontier offspring skip protection of the most-visited context; all other offspring and action focus remain unchanged',onlyTreatmentDifference:true,
        gpuBackend:'exact V3 CUDA neural pass; CPU physics',runtime:process.versions.node},pairedStartOutcomes,arms,
      comparison:{safeProgressDeltaMByGeneration:treatment.rows.map((row,index)=>row.bestSafeProgressM-control.rows[index].bestSafeProgressM),
        safeLapDeltaByGeneration:treatment.rows.map((row,index)=>row.maxSafeLaps-control.rows[index].maxSafeLaps),
        safeAgentCountDeltaByGeneration:treatment.rows.map((row,index)=>row.safeAgentCount-control.rows[index].safeAgentCount)},
      treatmentNeuralSha256:treatmentBuild.neuralSha256,treatmentSimulationSha256:treatmentBuild.simulationSha256,
      sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourcesUnchanged},cuda:gpu,
      boundary:'Single V3/Monza seed and 100-agent gen.109 checkpoint; two natural generations per arm. Matching generation-109 outcomes validate paired evaluation, not learning. This tests only an in-memory training-mutation change for frontier offspring. No application source, user save, version, release, tag, portable or installer is modified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('UNANCHORED_CONTEXT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,pairedStartOutcomes,comparison:report.comparison,
    arms:arms.map(arm=>({name:arm.name,rows:arm.rows.map(row=>({generation:row.generation,bestSafeProgressM:row.bestSafeProgressM,maxSafeLaps:row.maxSafeLaps,safeAgentCount:row.safeAgentCount,safeLeader:row.safeLeader})),wallSeconds:arm.wallSeconds})),cuda:gpu,report:path.join(out,'report.json')}));
  if(!report.passed)throw Error('Integrity, exact paired-start, or GPU-only check failed; report preserved');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
