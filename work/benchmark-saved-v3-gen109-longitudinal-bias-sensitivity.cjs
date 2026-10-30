'use strict';
// Research-only sensitivity sweep from a verified saved V3/Monza gen.109
// champion. Changes only its learned longitudinal readout bias in memory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),
  savePath=path.join(root,'.impeccable/review/learning-ml/saved-v3-crossover-100-continuous-batch-cuda-20261022-01/checkpoints/Circuit-Lab-5.6.0-v3-monza-gen109.malecns-save'),
  controlPath=path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-exploration-sigma-reset-ab-20261022-01/report.json'),
  out=path.join(root,'.impeccable/review/learning-ml/saved-v3-gen109-longitudinal-bias-sensitivity-20261022-01');
const expectedSaveSha='c17030e2d26ec235521269aa89a4474222fe7d7ae350ceb73286cfad2c498f96';
const F=require(path.join(root,'outputs/simulation.js')),P=require(path.join(root,'outputs/progress-save.js')),
  Legacy=require(path.join(root,'outputs/legacy-models.js')),Dense=require(path.join(root,'outputs/dense-neural.js')),
  Cuda=require('./cuda-exact-v3-runtime.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sourceFiles=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/progress-save.js','outputs/vehicle-992.js','outputs/data/circuits.json','outputs/data/connectome.json'];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
function runVariant(data,circuits,state,parent,biasDelta,expectedBaseline){
  const sim=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  sim.rewardRevision=state.rewardRevision;sim.stagnation=state.stagnation;sim.safeLearningFrontier={...state.learningFrontier};
  const genome=F.cloneGenome(parent);genome.policyWeights[genome.policyWeights.length-1]+=biasDelta;
  sim.spawn([genome]);const car=sim.cars[0],ppm=sim.track.pixelsPerMeter||1;
  let terminal=null,ticks=0,lastLog=performance.now();
  sim.onTrialTick=s=>{
    const c=s.cars[0];
    if(!c.alive&&!terminal)terminal={biasDelta,initialLongitudinalBias:parent.policyWeights.at(-1),finalLongitudinalBias:genome.policyWeights.at(-1),
      ticks:s.ticks,progressM:c.bestProgress/ppm,laps:c.laps,lapTimes:c.lapTimes.slice(),reason:c.reason||'',fitness:c.fitness,
      safe:F.isSafeLearningOutcome(c),outputs:c.outputs.slice(),speedMps:c.vehicle?.speedMps??0,gear:c.vehicle?.gear??null,rpm:c.vehicle?.rpm??null};
    if(performance.now()-lastLog>15000){lastLog=performance.now();console.log('LONGITUDINAL_BIAS_PROGRESS '+JSON.stringify({biasDelta,ticks:s.ticks,progressM:c.bestProgress/ppm,speedMps:c.vehicle?.speedMps??0,gas:c.outputs[1],brake:c.outputs[2]}));}
  };
  const initialGeneration=sim.generation;
  while(sim.generation===initialGeneration&&ticks++<20000)sim.tick();
  sim.running=false;
  if(sim.generation===initialGeneration||!terminal)throw Error(`Bias ${biasDelta}: rollout did not finish naturally within 20,000 ticks`);
  if(biasDelta===0&&(terminal.progressM!==expectedBaseline.progressM||terminal.laps!==expectedBaseline.laps||terminal.reason!==expectedBaseline.reason))
    throw Error(`Baseline mismatch: got ${JSON.stringify({progressM:terminal.progressM,laps:terminal.laps,reason:terminal.reason})}, expected ${JSON.stringify(expectedBaseline)}`);
  return terminal;
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(fs.existsSync(out))throw Error(`Refusing to overwrite existing output: ${out}`);
  const beforeSources=hashes(),raw=fs.readFileSync(savePath),saveSha=sha(raw);
  if(saveSha!==expectedSaveSha)throw Error('Research checkpoint hash differs from the verified gen.109 input');
  const control=JSON.parse(fs.readFileSync(controlPath,'utf8'));
  if(!control.passed||control.checkpoint?.sha256!==saveSha||control.learningSucceeded)throw Error('Verified gen.109 learning control report missing or inconsistent');
  const expectedBaseline=control.arms?.[0]?.rows?.find(row=>row.generation===109)?.outcomes?.find(row=>row.id===0);
  if(!expectedBaseline)throw Error('Saved champion baseline outcome is absent from the control report');
  const decoded=await P.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  if(decoded.appVersion!=='5.6.0'||decoded.payload.modelId!=='v3'||decoded.payload.circuitId!=='monza'||state.generation!==109||state.seed!==7717||state.population!==100||state.rewardRevision!=='progress-3')throw Error('Expected verified V3/Monza gen.109 checkpoint');
  const data=Legacy.tagV3(JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    validator=new F.Simulation(data,{modelId:'v3',population:1,circuitId:'monza',circuits,seed:state.seed,mutation:0});
  P.validatePayload(decoded.payload,{graph:validator.graph,circuits:validator.circuits});
  const parent=F.cloneGenome(state.genomes[0]),weights=parent.policyWeights;
  if(!Array.isArray(weights)||parent.adapterVersion!==validator.graph.learning.version||weights.length<3)throw Error('Saved champion neural readout is incompatible');
  if(JSON.stringify(weights)!==JSON.stringify(state.champion?.policyWeights??state.champion))throw Error('Gen.109 genome 0 does not match the saved champion');
  const deltas=[0,.2,.4,.6,.8,1.0],results=[],originalStep=Dense.step,start=performance.now();
  Dense.step=(...args)=>Cuda.pass(...args);
  try{for(const biasDelta of deltas){results.push(runVariant(data,circuits,state,parent,biasDelta,expectedBaseline));console.log('LONGITUDINAL_BIAS_RESULT '+JSON.stringify(results.at(-1)));}}
  finally{Dense.step=originalStep;}
  const cuda=Cuda.stats(),afterSources=hashes(),sourceFilesUnchanged=JSON.stringify(beforeSources)===JSON.stringify(afterSources),inputUnchanged=sha(fs.readFileSync(savePath))===saveSha;
  const baseline=results[0],best=[...results].sort((a,b)=>b.progressM-a.progressM||b.laps-a.laps)[0];
  const report={format:'male-cns-saved-v3-gen109-longitudinal-bias-sensitivity-v1',appVersion:'5.6.0',passed:Boolean(cuda.gpuCalls>0&&cuda.cpuFallbacks===0&&sourceFilesUnchanged&&inputUnchanged),learningSucceeded:results.some(r=>r.laps>=2),
    checkpoint:{path:savePath,sha256:saveSha,unchanged:inputUnchanged,model:'V3',circuit:'Monza',generation:state.generation,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    settings:{arms:deltas.length,biasDeltas:deltas,onlyDifference:'Add the listed delta to the final longitudinal policy readout bias; topology, steering, physics, sensors, rewards, seed and all other saved genome weights remain unchanged.',gpuBackend:'exact V3 CUDA neural pass; CPU physics',runtime:process.versions.node},
    baselineExpected:expectedBaseline,initialReadout:{adapterVersion:parent.adapterVersion,policyWeightCount:weights.length,longitudinalBias:weights.at(-1),steeringBias:weights.at(-2)},results,
    comparison:{bestBiasDelta:best.biasDelta,bestProgressM:best.progressM,progressGainVsBaselineM:best.progressM-baseline.progressM,bestLaps:best.laps,lapGain:best.laps-baseline.laps,anySafeLap:results.some(r=>r.safe&&r.laps>0)},
    wallSeconds:(performance.now()-start)/1000,cuda,sourceHashes:{before:beforeSources,after:afterSources,unchanged:sourceFilesUnchanged},
    boundary:'Six natural single-agent V3/Monza rollouts on one saved gen.109 champion and one seed. Only the final learned longitudinal bias is varied. The baseline must exactly reproduce the stored champion outcome. This is local causal sensitivity evidence, not population-level learning, multi-seed robustness, or proof of completing a lap. All variants remain in memory; the research checkpoint, app, version, release and distributables are unchanged.'};
  if(!report.passed)throw Error(`Integrity/GPU-only validation failed: ${JSON.stringify({cuda,sourceFilesUnchanged,inputUnchanged})}`);
  const cudaIdentity=Cuda.identity();report.cuda.identity=cudaIdentity;
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('LONGITUDINAL_BIAS_SWEEP_SUMMARY '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,baseline:results[0],comparison:report.comparison,cuda:report.cuda,report:path.join(out,'report.json')}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{try{Cuda.close();}catch{}});
