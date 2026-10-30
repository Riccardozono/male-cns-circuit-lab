'use strict';

// Isolated reward-revision experiment on the already migrated decoder-7
// checkpoint. It applies progress-7-moving-pace to a progress-3 save. The
// current reward revision also changes slow-recovery termination semantics, so
// only the initial state/policy/RNG are paired; episode durations may diverge.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const D6=require('./decoder6-model.cjs');
const D7=require('./decoder7-model.cjs');
const {P:LegacyP,L}=D6;
const input=path.join(root,'.impeccable/review/decoder7/four-updates-rtx-20261028/decoder7-gen68-result.malecns-save');
const paired=path.join(root,'.impeccable/review/decoder7/continuation-updates-rtx-20261028/decoder7-continuation-partial.json');
const output=path.join(root,'.impeccable/review/decoder7/progress7-reward-rtx-20261028-rerun');
const rewardPath=path.join(root,'outputs/rewards.js');
const progressPath=path.join(root,'outputs/progress-save.js');
const densePath=path.join(root,'outputs/dense-neural.js');
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stable=value=>JSON.stringify(value);
const optimizerSnapshot=value=>({mean:value.mean,sigma:value.sigma,updates:value.updates,episodes:value.episodes});
const started=performance.now();
let Cuda=null,DenseRef=null,originalDense=null,uninstall=null;

function compileProgressSave(simulation,learning){
  let source=fs.readFileSync(progressPath,'utf8');
  const anchor="factory(require('./simulation.js'),require('./neural-learning.js'),require('node:crypto'))";
  if(source.split(anchor).length!==2)throw Error('Progress-save loader anchor is not unique.');
  source=source.replace(anchor,'factory(globalThis.__decoder7RewardSimulation,globalThis.__decoder7RewardLearning,require(\'node:crypto\'))');
  globalThis.__decoder7RewardSimulation=simulation;
  globalThis.__decoder7RewardLearning=learning;
  try{
    const filename=path.join(root,'work','__decoder7-progress7-save-runtime.cjs');
    const mod=new Module(filename,module);
    mod.filename=filename;
    mod.paths=Module._nodeModulePaths(path.dirname(filename));
    mod._compile(source,filename);
    return mod.exports;
  }finally{
    delete globalThis.__decoder7RewardSimulation;
    delete globalThis.__decoder7RewardLearning;
  }
}

async function main(){
  if(fs.existsSync(output))throw Error('Output already exists; refusing to overwrite a prior experiment.');
  if(!fs.existsSync(input)||!fs.existsSync(paired))throw Error('Required decoder-7 input/checkpoint or paired reference is missing.');
  const inputHash=sha256(input);
  const previousResult=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/decoder7/four-updates-rtx-20261028/decoder7-result.json'),'utf8'));
  if(inputHash!==previousResult.outputSave.sha256)throw Error('Decoder-7 generation-68 checkpoint hash does not match its recorded result.');
  const appSave=await LegacyP.decode(fs.readFileSync(input,'utf8'),'5.6.0');
  const oldState=appSave.payload.workers[0].state;
  if(oldState.generation!==68||oldState.population!==40||oldState.rewardRevision!=='progress-3'||oldState.genomes.some(g=>g?.adapterVersion!==7))throw Error('Unexpected decoder-7 checkpoint identity.');

  const base=D6.runtime;
  const simPath=path.join(base,'outputs/simulation.js');
  let simSource=fs.readFileSync(simPath,'utf8');
  const oldRewardImport="  const Rewards=typeof module!=='undefined'&&module.exports?require('./rewards.js'):root.MaleCNSRewards;";
  const cpuLoop="for(let iter=0;iter<iterations;iter++){brain.sum.set(injection);if(edgesEnabled)for(let e=0;e<graph.from.length;e++){const source=graph.from[e];brain.sum[graph.to[e]]+=.9*graph.weights[e]*brain.activity[source]*(gains?gains[graph.learning.groups[source]]:1);}for(let i=0;i<graph.n;i++)brain.next[i]=.45*brain.activity[i]+.55*Math.tanh(brain.sum[i]);[brain.activity,brain.next]=[brain.next,brain.activity];}";
  if(simSource.split(oldRewardImport).length!==2||simSource.split(cpuLoop).length!==2)throw Error('Decoder-7 source anchors are not unique.');
  const rewardBinding=`  const Rewards=require(${JSON.stringify(rewardPath)});`;
  simSource=simSource.replace(oldRewardImport,rewardBinding);
  simSource=simSource.replace(rewardBinding,`${rewardBinding}\n  const Dense=require(${JSON.stringify(densePath)});`);
  simSource=simSource.replace(cpuLoop,'if(Dense&&brain.sum instanceof Float64Array&&brain.activity instanceof Float64Array&&brain.next instanceof Float64Array)Dense.step(graph,brain,iterations,edgesEnabled,gains);else '+cpuLoop);

  const simModule=new Module(simPath,module);
  simModule.filename=simPath;
  simModule.paths=Module._nodeModulePaths(path.dirname(simPath));
  simModule._compile(simSource,simPath);
  DenseRef=require(densePath);
  const F=simModule.exports;
  const Rewards=require(rewardPath);
  if(Rewards.REVISION!=='progress-7-moving-pace')throw Error('Unexpected current reward revision.');
  uninstall=D7.install(L);
  const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const data=D7.model(source);
  const sim=new F.Simulation(data,{population:oldState.population,circuitId:oldState.circuitId,circuits:catalog});
  const CurrentP=compileProgressSave(F,L);

  // Validate the untouched input under the current schema before any research
  // migration, then preserve the live genotypes and optimizer byte-for-byte.
  CurrentP.validatePayload(appSave.payload,{graph:sim.graph,circuits:sim.circuits});
  const payload=JSON.parse(JSON.stringify(appSave.payload));
  const state=payload.workers[0].state;
  const genotypeHash=crypto.createHash('sha256').update(stable(state.genomes)).digest('hex');
  const optimizerHash=crypto.createHash('sha256').update(stable(optimizerSnapshot(state.optimizer))).digest('hex');
  const rngState=state.rngState;
  const generation=state.generation;

  // Prior scores are from progress-3 and cannot be compared to progress-7.
  // Keep the current generation's exact 40 policies/optimizer/RNG, but clear
  // old score-bearing archives and history instead of mislabeling them.
  state.rewardRevision=Rewards.REVISION;
  state.history=[];
  state.bestEver=null;
  state.champion=null;
  state.championStats=null;
  state.hallOfFame=[];
  state.externalChampion=null;
  payload.globalChampion=null;
  CurrentP.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});
  CurrentP.restore(sim,state);
  sim.rewardRevision=Rewards.REVISION;
  if(crypto.createHash('sha256').update(stable(sim.cars.map(c=>c.genome))).digest('hex')!==genotypeHash)throw Error('Restored population differs from the migrated input population.');
  if(crypto.createHash('sha256').update(stable(optimizerSnapshot(sim.optimizer))).digest('hex')!==optimizerHash)throw Error('Restored optimizer differs from the input checkpoint.');
  if(sim.generation!==generation||sim.random.getState()!==rngState)throw Error('Generation or RNG state changed during reward migration.');
  if(process.argv.includes('--preflight-only')){
    console.log('DECODER7_PROGRESS7_PREFLIGHT_PASS '+JSON.stringify({inputSha256:inputHash,generation,population:sim.population,rewardRevision:sim.rewardRevision,policyVersion:sim.graph.learning.version,parameters:sim.graph.learning.length,genotypeSha256:genotypeHash,optimizerSha256:optimizerHash,rngStatePreserved:true}));
    return;
  }

  fs.mkdirSync(output,{recursive:false});
  const pairedResult=JSON.parse(fs.readFileSync(paired,'utf8'));
  const baselineGen68=pairedResult.history.find(h=>h.generation===68);
  if(!baselineGen68||baselineGen68.cars?.length!==state.population)throw Error('Paired progress-3 generation 68 record is incomplete.');

  Cuda=require('./cuda-exact-v3-runtime.cjs');
  originalDense=DenseRef.step;
  DenseRef.step=(...args)=>Cuda.pass(...args);
  let history=[],cars=[],pairedComparison=null,lastProgress=performance.now(),maxThrottle=0,maxBrake=0,maxSteering=0;
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(car.speed/(car.pixelsPerMeter||1)>2){
      maxThrottle=Math.max(maxThrottle,car.slowOutputs?.[1]||0);
      maxBrake=Math.max(maxBrake,car.slowOutputs?.[2]||0);
      maxSteering=Math.max(maxSteering,Math.abs(car.slowOutputs?.[0]||0));
    }
    if(performance.now()-lastProgress>20000){
      lastProgress=performance.now();
      console.log('DECODER7_PROGRESS7_RUNNING '+JSON.stringify({generation:s.generation,elapsed:s.elapsed,alive:s.cars.filter(c=>c.alive).length,progress:Math.max(...s.cars.map(c=>c.bestProgress))}));
    }
    if(s.cars.every(c=>!c.alive))cars=s.cars.map(c=>({
      id:c.id,progress:c.bestProgress,fitness:c.fitness,laps:c.laps,reason:c.reason,
      penalties:c.rewardBreakdown?.penalties?{stall:c.rewardBreakdown.penalties.stall,slowProgress:c.rewardBreakdown.penalties.slowProgress,noLap:c.rewardBreakdown.penalties.noLap}:null
    }));
  };

  for(let update=0;update<4;update++){
    maxThrottle=0;maxBrake=0;maxSteering=0;cars=[];
    const current=sim.generation;let ticks=0;
    while(sim.generation===current&&ticks++<60000)sim.tick();
    if(sim.generation===current)throw Error('Natural generation unfinished; refusing forced evolve.');
    const item={...sim.history.at(-1),maxThrottle,maxBrake,maxSteering,cars,
      agentsAt750:cars.filter(c=>c.progress>=750).length,
      agentsAt800:cars.filter(c=>c.progress>=800).length,
      agentsAt1200:cars.filter(c=>c.progress>=1200).length};
    if(cars.length!==state.population)throw Error('Generation result omitted one or more agents.');
    if(current===68){
      const lhs=cars.slice().sort((a,b)=>a.id-b.id),rhs=baselineGen68.cars.slice().sort((a,b)=>a.id-b.id);
      if(lhs.some((car,i)=>car.id!==rhs[i].id))throw Error('Agent identities do not align with the paired progress-3 generation.');
      const deltas=lhs.map((car,i)=>({id:car.id,progress3:rhs[i].progress,progress7:car.progress,delta:car.progress-rhs[i].progress,laps3:rhs[i].laps,laps7:car.laps,reason3:rhs[i].reason,reason7:car.reason}));
      const more=deltas.filter(x=>x.delta>1e-10),less=deltas.filter(x=>x.delta< -1e-10),same=deltas.filter(x=>Math.abs(x.delta)<=1e-10);
      pairedComparison={generation:68,initialGenomePopulationMatches:true,initialOptimizerMatches:true,seed:state.seed,population:state.population,
        exactPhysicalOutcomesMatch:deltas.every(x=>Math.abs(x.delta)<=1e-10&&x.laps3===x.laps7&&x.reason3===x.reason7),
        progress3Best:Math.max(...rhs.map(x=>x.progress)),progress7Best:Math.max(...lhs.map(x=>x.progress)),
        meanProgress3:rhs.reduce((s,x)=>s+x.progress,0)/rhs.length,meanProgress7:lhs.reduce((s,x)=>s+x.progress,0)/lhs.length,
        moreProgress:more.length,lessProgress:less.length,sameProgress:same.length,
        changedLapOutcomes:deltas.filter(x=>x.laps3!==x.laps7).length,changedTerminationReasons:deltas.filter(x=>x.reason3!==x.reason7).length,
        deltas,interpretation:'Reward-revision comparison, not a physics-invariant replay: progress-7 changes slow-recovery termination, so episode durations and later vehicle trajectories can differ.'};
      item.pairedPhysicalReplayMatchesProgress3=pairedComparison.exactPhysicalOutcomesMatch;
      item.progress7PaceTerminationChanged=pairedComparison.changedTerminationReasons>0||pairedComparison.changedLapOutcomes>0||more.length+less.length>0;
      fs.writeFileSync(path.join(output,'paired-gen68-comparison.json'),JSON.stringify(pairedComparison,null,2));
    }
    history.push(item);
    fs.writeFileSync(path.join(output,'partial.json'),JSON.stringify({history},null,2));
    console.log('DECODER7_PROGRESS7_GENERATION '+JSON.stringify({generation:item.generation,bestProgress:item.bestProgress,meanProgress:item.meanProgress,laps:item.maxLaps,at750:item.agentsAt750,at800:item.agentsAt800,at1200:item.agentsAt1200,maxThrottle,maxBrake,maxSteering,stallPenalty:item.rewardBreakdown?.penalties?.stall,pairedPhysicalReplayMatchesProgress3:item.pairedPhysicalReplayMatchesProgress3??null,wallSeconds:(performance.now()-started)/1000}));
  }

  const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
  if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 CUDA execution without CPU fallback.');
  const result={
    variant:'decoder7-three-action-heads-progress7-reward-migration',
    appVersion:appSave.appVersion,
    reward:{inputRevision:'progress-3',trainingRevision:Rewards.REVISION,sourceSha256:sha256(rewardPath)},
    settings:{population:state.population,mutation:state.mutation,circuitId:state.circuitId,seed:state.seed,startingGeneration:generation},
    policy:{version:sim.graph.learning.version,actions:sim.graph.learning.actionCount,parameters:sim.graph.learning.length},
    migration:{historyCleared:true,oldScoreArchivesCleared:true,genotypeSha256BeforeAndAfter:genotypeHash,optimizerSha256BeforeAndAfter:optimizerHash,rngStatePreserved:rngState,generationPreserved:generation},
    pairedComparison,history,gpu,gpuIdentity,wallSeconds:(performance.now()-started)/1000,
    inputIntegrity:{inputUnchanged:sha256(input)===inputHash,inputSha256:inputHash},
    sourceSha256:{simulation:sha256(simPath),learning:sha256(path.join(base,'outputs/neural-learning.js')),progressLegacy:sha256(path.join(base,'outputs/progress-save.js')),progressCurrent:sha256(progressPath),vehicle:sha256(path.join(base,'outputs/vehicle-992.js')),rewardTraining:sha256(rewardPath),decoderModel:sha256(path.join(root,'work/decoder7-model.cjs'))},
    limits:'Research-only reward migration. Decoder 7 and progress-7-moving-pace are not compatible with the published 5.6.0 app/save contract. progress-7 changes slow-recovery termination, so physical trajectories can diverge from the progress-3 paired control. No route cues, ideal actions, user save edits, forced generation completion, or production-source changes.'
  };
  const savePath=path.join(output,'decoder7-progress7-gen72-result.malecns-save');
  fs.writeFileSync(savePath,await CurrentP.encode(CurrentP.fromSimulation(sim),appSave.appVersion));
  result.outputSave={path:savePath,sha256:sha256(savePath),bytes:fs.statSync(savePath).size};
  result.inputIntegrity.inputUnchanged=sha256(input)===inputHash;
  if(!result.inputIntegrity.inputUnchanged)throw Error('The decoder-7 input save changed during training.');
  const reread=await CurrentP.decode(fs.readFileSync(savePath,'utf8'),'5.6.0');
  CurrentP.validatePayload(reread.payload,{graph:sim.graph,circuits:sim.circuits});
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));
  console.log('DECODER7_PROGRESS7_DONE '+JSON.stringify({gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,inputUnchanged:result.inputIntegrity.inputUnchanged,history:history.map(h=>({generation:h.generation,bestProgress:h.bestProgress,maxLaps:h.maxLaps,at800:h.agentsAt800})),outputSave:result.outputSave,wallSeconds:result.wallSeconds}));
}

main().catch(error=>{
  const failure={completed:false,error:error.stack||String(error),gpu:Cuda?.stats?.()??null,gpuIdentity:Cuda?.identity?.()??null,wallSeconds:(performance.now()-started)/1000};
  try{if(fs.existsSync(output))fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify(failure,null,2));}catch{}
  console.error(error.stack||error);
  process.exitCode=1;
}).finally(()=>{
  if(originalDense&&DenseRef)DenseRef.step=originalDense;
  if(Cuda)Cuda.close();
  if(uninstall)uninstall();
});
