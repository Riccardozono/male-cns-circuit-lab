'use strict';
// Matched V3/Monza save replay: learned-policy launch bias 0 vs map value .02.
// All edits are in-memory; the user save and application version stay untouched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',
  out=path.join(root,'.impeccable/review/learning-ml/saved-v3-map-launch-bias-ab-cuda-20261022-01');
const Dense=require(path.join(root,'outputs/dense-neural.js')),Cuda=require('./cuda-exact-v3-runtime.cjs'),originalDenseStep=Dense.step;
Dense.step=(...args)=>Cuda.pass(...args);
const F=require(path.join(root,'outputs/simulation.js')),Learning=require(path.join(root,'outputs/neural-learning.js')),
  Progress=require(path.join(root,'outputs/progress-save.js')),Legacy=require(path.join(root,'outputs/legacy-models.js')),
  originalCommands=Learning.commands,REWARD=require(path.join(root,'outputs/rewards.js'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function summaryCar(car,ppm){return {id:car.id,progressM:car.bestProgress/ppm,laps:car.laps,reason:car.reason,
  gas:car.outputs?.[1]??0,brake:car.outputs?.[2]??0,speedMps:car.vehicle?.speedMps??car.speed??0,
  safe:F.isSafeLearningOutcome(car),fitness:car.fitness,stallPenalty:car.rewardBreakdown.penalties.stall};}
function summarize(cars,sim,ticks){
  const rows=cars.map(car=>summaryCar(car,sim.track.pixelsPerMeter||1)),safe=rows.filter(car=>car.safe).sort((a,b)=>b.progressM-a.progressM||b.fitness-a.fitness),
    raw=rows.slice().sort((a,b)=>b.progressM-a.progressM||b.fitness-a.fitness),reasons={};
  for(const car of rows)reasons[car.reason]=(reasons[car.reason]||0)+1;
  return {generation:sim.history.at(-1)?.generation??sim.generation-1,ticks,bestProgressM:Math.max(...rows.map(car=>car.progressM)),
    meanProgressM:rows.reduce((sum,car)=>sum+car.progressM,0)/rows.length,maxLaps:Math.max(...rows.map(car=>car.laps)),
    oneLapAgents:rows.filter(car=>car.laps>=1).length,twoLapAgents:rows.filter(car=>car.laps>=2).length,safeCount:safe.length,
    safeLeader:safe[0]||null,rawLeader:raw[0]||null,reasonCounts:reasons,rows};
}
function fingerprint(sim){return sha(JSON.stringify(sim.cars.map(car=>({id:car.id,x:car.x,y:car.y,heading:car.heading,
  genome:car.genome,progress:car.progress,bestProgress:car.bestProgress,laps:car.laps}))));}
async function run(label,payload,generations,launchBias){
  Learning.commands=launchBias===0
    ?(graph,brain,genome,enabled=true,edgesEnabled=true)=>originalCommands(graph,brain,genome,enabled,edgesEnabled,0)
    :originalCommands;
  const data=Legacy.tagV3(require(path.join(root,'outputs/data/connectome.json'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    sim=new F.Simulation(data,{modelId:'v3',population:payload.workers[0].state.population,circuitId:'monza',circuits});
  const state=structuredClone(payload.workers[0].state);state.history=[];state.rewardRevision=REWARD.REVISION;
  Progress.restore(sim,state);sim.rewardRevision=REWARD.REVISION;for(const car of sim.cars)car.rewardRevision=REWARD.REVISION;
  if(!sim.cars.every(car=>Array.isArray(car.genome.policyWeights)&&car.genome.policyWeights.length>0))throw Error('Save does not contain the expected learned MaleCNS policy');
  const initialFingerprint=fingerprint(sim);sim.running=true;let finalCars=null,lastLog=Date.now();
  sim.onTrialTick=s=>{
    if(Date.now()-lastLog>=20000){lastLog=Date.now();console.log('LAUNCH_BIAS_AB_PROGRESS '+JSON.stringify({variant:label,
      generation:s.generation,alive:s.cars.filter(car=>car.alive).length,bestProgressM:Math.max(...s.cars.map(car=>car.bestProgress))/(s.track.pixelsPerMeter||1),
      maxLaps:Math.max(...s.cars.map(car=>car.laps))}));}
    if(s.cars.every(car=>!car.alive))finalCars=s.cars.map(car=>({...car,genome:car.genome,outputs:car.outputs?.slice(),vehicle:{...car.vehicle},rewardBreakdown:structuredClone(car.rewardBreakdown),rewardState:{...car.rewardState},brain:null}));
  };
  const history=[];
  try{
    for(let i=0;i<generations;i++){
      const generation=sim.generation,start=Date.now();let ticks=0;
      while(sim.generation===generation&&ticks++<60000)sim.tick();
      if(sim.generation===generation)throw Error(`${label}: natural-generation guard reached; generation not forced`);
      if(!finalCars||finalCars.length!==state.population)throw Error(`${label}: terminal population telemetry missing`);
      const row=summarize(finalCars,sim,ticks);row.wallSeconds=Number(((Date.now()-start)/1000).toFixed(2));
      history.push(row);finalCars=null;
      console.log('LAUNCH_BIAS_AB_GENERATION '+JSON.stringify({variant:label,...row,rows:undefined}));
    }
  }finally{sim.running=false;Learning.commands=originalCommands;}
  return {label,launchBias,population:state.population,seed:state.seed,startGeneration:state.generation,initialFingerprint,history};
}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(!fs.existsSync(savePath))throw Error('Supplied save missing; no fallback save selected');
  if(fs.existsSync(out))throw Error('Refusing to overwrite an existing report');
  const original=fs.readFileSync(savePath),saveSha=sha(original),file=await Progress.decode(original.toString('utf8'),'5.6.0'),
    data=Legacy.tagV3(require(path.join(root,'outputs/data/connectome.json'))),circuits=require(path.join(root,'outputs/data/circuits.json')),
    descriptor=new F.Simulation(data,{modelId:'v3',population:file.payload.workers[0].state.population,circuitId:'monza',circuits}),
    state=file.payload.workers[0].state;
  Progress.validatePayload(file.payload,{graph:descriptor.graph,circuits:descriptor.circuits});
  if(file.payload.modelId!=='v3'||file.payload.circuitId!=='monza'||state.generation!==64||state.seed!==7717||state.rewardRevision!==REWARD.LEGACY_REVISION)
    throw Error('Exact V3/Monza generation-64 progress-3 save required');
  const generations=3,baseline=await run('policy-launch-bias-0',file.payload,generations,0),
    treatment=await run('policy-launch-bias-map-002',file.payload,generations,.02);
  const initialStateMatched=baseline.initialFingerprint===treatment.initialFingerprint,
    saveUnchanged=sha(fs.readFileSync(savePath))===saveSha,gpu=Cuda.stats();
  if(!initialStateMatched||!saveUnchanged||gpu.gpuCalls===0||gpu.cpuFallbacks!==0)
    throw Error('Matched initial state, save integrity, or CUDA verification failed');
  const report={format:'male-cns-saved-v3-map-launch-bias-ab-v1',passed:true,
    learningSucceeded:treatment.history.some(row=>row.twoLapAgents>0),oneLapSucceeded:treatment.history.some(row=>row.oneLapAgents>0),
    settings:{model:'V3',circuit:'Monza',population:state.population,seed:state.seed,startGeneration:state.generation,
      generations,rewardRevision:REWARD.REVISION,controlLaunchBias:0,treatmentMapLaunchBias:.02,historyReset:true},
    save:{sha256:saveSha,unchanged:saveUnchanged},initialStateMatched,baseline,treatment,gpu,
    comparison:{safeProgressDeltaByGeneration:treatment.history.map((row,i)=>(row.safeLeader?.progressM??-Infinity)-(baseline.history[i].safeLeader?.progressM??-Infinity)),
      rawProgressDeltaByGeneration:treatment.history.map((row,i)=>row.bestProgressM-baseline.history[i].bestProgressM),
      lapDeltaByGeneration:treatment.history.map((row,i)=>row.maxLaps-baseline.history[i].maxLaps)},
    sourceHashes:Object.fromEntries(['simulation.js','neural-learning.js','rewards.js','progress-save.js','vehicle-992.js'].map(name=>[name,sha(fs.readFileSync(path.join(root,'outputs',name)))])),
    boundary:'Three natural generations from two identical in-memory copies of the exact supplied save. Only the policy launch bias differs: 0 vs map-specific 0.02. Full V3 graph uses the exact CUDA dense pass with no CPU fallback. This is a short single-save experiment, not convergence proof. Original save, version, tag, release, and distributed binaries are not modified.'};
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('LAUNCH_BIAS_AB_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,oneLapSucceeded:report.oneLapSucceeded,
    safeProgressDeltaByGeneration:report.comparison.safeProgressDeltaByGeneration,rawProgressDeltaByGeneration:report.comparison.rawProgressDeltaByGeneration,
    lapDeltaByGeneration:report.comparison.lapDeltaByGeneration,initialStateMatched,saveUnchanged,gpu,report:path.join(out,'report.json')}));
}
main().catch(error=>{Learning.commands=originalCommands;Dense.step=originalDenseStep;Cuda.close();console.error(error.stack||error);process.exitCode=1;});
process.once('beforeExit',()=>{Learning.commands=originalCommands;Dense.step=originalDenseStep;Cuda.close();});
