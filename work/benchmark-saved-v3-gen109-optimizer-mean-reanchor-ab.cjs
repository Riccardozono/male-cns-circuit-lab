'use strict';
// Research-only paired A/B: preserve the checkpointed ES sigma but re-anchor
// the treatment mean to the saved safe champion before its first evaluation.
// The protected generation must replay identically in both arms; only later
// offspring can reveal an effect. The source and checkpoint are never written.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'..');
const savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save');
const out=path.resolve(process.env.MALECNS_V3_GEN109_MEAN_REANCHOR_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-optimizer-mean-reanchor-ab-20261022-01'));
const generations=Math.max(2,Math.min(3,Number.parseInt(process.env.MALECNS_V3_GEN109_MEAN_REANCHOR_GENERATIONS||'2',10)||2));
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourcePaths=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/dense-neural.js'];
const sourceHashes=()=>Object.fromEntries(sourcePaths.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const rms=(a,b)=>Math.sqrt(a.reduce((sum,value,index)=>sum+(value-b[index])**2,0)/a.length);
const sigmaDistance=(mean,weights,sigma)=>Math.sqrt(mean.reduce((sum,value,index)=>sum+((value-weights[index])/(sigma[index]||1e-9))**2,0)/mean.length);
function outcome(car,ppm){return {id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,fitness:car.fitness,reason:car.reason||'',safe:F.isSafeLearningOutcome(car)};}
function runArm(state,payload,data,circuits,name,reanchorMean){
  const armState=structuredClone(state),sim=new F.Simulation(Legacy.tagV3(structuredClone(data)),{modelId:'v3',population:state.population,circuitId:'monza',circuits,seed:state.seed});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,armState);
  if(!sim.optimizer||!Array.isArray(sim.optimizer.mean)||!Array.isArray(sim.optimizer.sigma))throw Error(`${name}: restored ES optimizer is incomplete`);
  const sigmaBefore=sim.optimizer.sigma.slice(),meanBefore=sim.optimizer.mean.slice(),safeChampion=state.genomes?.[0]?.policyWeights;
  if(!Array.isArray(safeChampion)||safeChampion.length!==meanBefore.length)throw Error('Checkpoint genome 0 is not a compatible policy');
  const championMatchesSavedChampion=JSON.stringify(safeChampion)===JSON.stringify(state.champion?.policyWeights??state.champion);
  if(!championMatchesSavedChampion)throw Error('Checkpoint genome 0 no longer matches its saved champion');
  const before={meanChampionRms:rms(meanBefore,safeChampion),meanChampionSigmaDistance:sigmaDistance(meanBefore,safeChampion,sigmaBefore),meanRms:rms(meanBefore,Array(meanBefore.length).fill(0)),sigmaRms:rms(sigmaBefore,Array(sigmaBefore.length).fill(0))};
  if(reanchorMean)sim.optimizer.mean=safeChampion.slice();
  const afterReanchor={meanRmsDistanceToChampion:rms(sim.optimizer.mean,safeChampion),sigmaUnchanged:JSON.stringify(sim.optimizer.sigma)===JSON.stringify(sigmaBefore),meanChanged:JSON.stringify(sim.optimizer.mean)!==JSON.stringify(meanBefore)};
  if(reanchorMean&&(!afterReanchor.sigmaUnchanged||afterReanchor.meanRmsDistanceToChampion!==0))throw Error('Mean-only treatment changed sigma or failed to re-anchor');
  sim.running=true;
  const rows=[];let ticksInGeneration=0,totalTicks=0,terminal=new Map(),lastLog=performance.now(),generationStart=sim.generation;
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(!car.alive&&!terminal.has(car.id))terminal.set(car.id,outcome(car,s.track.pixelsPerMeter||1));
    if(performance.now()-lastLog>20000){lastLog=performance.now();console.log('MEAN_REANCHOR_PROGRESS '+JSON.stringify({arm:name,generation:s.generation,alive:s.cars.filter(c=>c.alive).length,terminal:terminal.size,bestProgressM:Math.max(...s.cars.map(c=>c.bestProgress/(s.track.pixelsPerMeter||1)))}));}
  };
  const started=performance.now();
  while(sim.generation<generationStart+generations){
    const beforeGeneration=sim.generation;ticksInGeneration=0;
    while(sim.generation===beforeGeneration){if(ticksInGeneration>=60000)throw Error(`${name}: generation ${beforeGeneration} exceeded watchdog`);sim.tick();ticksInGeneration++;totalTicks++;}
    if(terminal.size!==state.population)throw Error(`${name}: generation ${beforeGeneration} terminal census ${terminal.size}/${state.population}`);
    const outcomes=[...terminal.values()].sort((a,b)=>a.id-b.id),safe=outcomes.filter(row=>row.safe),history=sim.history.at(-1),ppm=sim.track.pixelsPerMeter||1;
    if(!history||history.generation!==beforeGeneration)throw Error(`${name}: missing history for completed generation ${beforeGeneration}`);
    const safeLeader=safe.slice().sort((a,b)=>b.progressM-a.progressM||b.laps-a.laps)[0]||null;
    rows.push({generation:beforeGeneration,ticks:ticksInGeneration,safeAgentCount:safe.length,unsafeAgentCount:outcomes.length-safe.length,
      bestSafeProgressM:safeLeader?.progressM??null,maxSafeLaps:safe.length?Math.max(...safe.map(row=>row.laps)):0,
      bestSafeFitness:safe.length?Math.max(...safe.map(row=>row.fitness)):-Infinity,meanSafeProgressM:safe.length?safe.reduce((sum,row)=>sum+row.progressM,0)/safe.length:null,
      historyFitnessLeader:history.best,stagnation:history.stagnation,mutationAmount:history.mutationAmount,outcomes});
    console.log('MEAN_REANCHOR_GENERATION '+JSON.stringify({arm:name,generation:beforeGeneration,bestSafeProgressM:safeLeader?.progressM??null,maxSafeLaps:rows.at(-1).maxSafeLaps,safeAgentCount:safe.length}));
    terminal=new Map();
  }
  const finalMean=sim.optimizer.mean.slice(),finalSigma=sim.optimizer.sigma.slice();sim.running=false;
  return {name,reanchorMean,initialOptimizer:{...before,championMatchesSavedChampion,sigmaPreservedAtStart:afterReanchor.sigmaUnchanged,meanOnlyReanchor:afterReanchor},
    rows,totalTicks,wallSeconds:(performance.now()-started)/1000,finalOptimizer:{meanRmsDistanceToSavedChampion:rms(finalMean,safeChampion),meanSigmaDistanceToSavedChampion:sigmaDistance(finalMean,safeChampion,finalSigma),sigmaRms:rms(finalSigma,Array(finalSigma.length).fill(0))}};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing diagnostic output: ${out}`);
  const original=fs.readFileSync(savePath),saveSha=sha(original),decoded=await P.decode(original.toString('utf8'),'5.6.0'),state=structuredClone(decoded.payload.workers[0].state);
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Expected exact V3/Monza gen.109 research checkpoint');
  if(!Array.isArray(state.genomes)||state.genomes.length!==state.population||!state.genomes[0]?.policyWeights)throw Error('Checkpoint policy population is incomplete');
  const data=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),circuits=require(path.join(root,'outputs/data/circuits.json')),
    beforeSources=sourceHashes(),originalDenseStep=Dense.step;
  Dense.step=(...args)=>Cuda.pass(...args);
  let arms=[],gpu;
  try{
    arms.push(runArm(state,decoded.payload,data,circuits,'control-saved-optimizer-mean',false));
    arms.push(runArm(state,decoded.payload,data,circuits,'treatment-mean-only-reanchored-to-saved-safe-champion',true));
    gpu=Cuda.stats();
  }finally{Dense.step=originalDenseStep;Cuda.close();}
  const afterSources=sourceHashes(),sourcesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,
    control=arms[0],treatment=arms[1],pairedStartOutcomes=JSON.stringify(control.rows[0]?.outcomes)===JSON.stringify(treatment.rows[0]?.outcomes),
    completeRows=arms.every(arm=>arm.rows.length===generations&&arm.rows.every(row=>row.outcomes.length===state.population)),
    safeLaps=Math.max(...arms.flatMap(arm=>arm.rows.map(row=>row.maxSafeLaps))),
    report={format:'male-cns-saved-v3-gen109-es-mean-only-reanchor-ab-v1',appVersion:'5.6.0',passed:Boolean(saveUnchanged&&sourcesUnchanged&&pairedStartOutcomes&&completeRows&&gpu.gpuCalls>0&&gpu.cpuFallbacks===0),
      learningSucceeded:safeLaps>=2,checkpoint:{path:savePath,sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:109,seed:7717,population:100,rewardRevision:state.rewardRevision},
      settings:{naturalGenerationsPerArm:generations,onlyTreatmentDifference:'Before generation 109, replace optimizer.mean with state.genomes[0].policyWeights, which is verified equal to the saved safe champion. Preserve the checkpoint sigma vector exactly; no adopt() reset.',
        optimizerSigmaPreserved:true,gpuBackend:'exact V3 CUDA neural pass; CPU physics',runtime:process.versions.node},
      pairedStartOutcomes,arms,comparison:{safeProgressDeltaMByGeneration:treatment.rows.map((row,index)=>row.bestSafeProgressM-control.rows[index].bestSafeProgressM),
        safeLapDeltaByGeneration:treatment.rows.map((row,index)=>row.maxSafeLaps-control.rows[index].maxSafeLaps),safeAgentCountDeltaByGeneration:treatment.rows.map((row,index)=>row.safeAgentCount-control.rows[index].safeAgentCount)},
      sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourcesUnchanged},cuda:gpu,
      boundary:'Single V3/Monza seed and 100-agent checkpoint; two natural generations per arm. Exact generation-109 paired outcomes validate the checkpoint, not learning. A short-run change is only a local signal; two laps, longer persistence, other seeds/circuits and cold starts remain unproven. No app source, user save, version, release, tag, portable or installer is modified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('MEAN_REANCHOR_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,pairedStartOutcomes,comparison:report.comparison,arms:arms.map(arm=>({name:arm.name,rows:arm.rows.map(row=>({generation:row.generation,bestSafeProgressM:row.bestSafeProgressM,maxSafeLaps:row.maxSafeLaps,safeAgentCount:row.safeAgentCount})),wallSeconds:arm.wallSeconds})),cuda:gpu,report:path.join(out,'report.json')}));
  if(!report.passed)throw Error('Integrity, exact paired-start, or GPU-only check failed; report preserved');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
