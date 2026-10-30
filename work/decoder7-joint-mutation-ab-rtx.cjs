'use strict';

// Paired research comparison of the D7 one-head motor mutation against a
// correlated three-head mutation. Physics, sensor routing, reward revision,
// population and exact starting save are shared; only safeMotorMutation differs.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const D6=require('./decoder6-model.cjs');
const D7=require('./decoder7-model.cjs');
const {P:LegacyP,L}=D6;
const input=path.join(root,'.impeccable/review/decoder7/progress7-reward-rtx-20261028-rerun/decoder7-progress7-gen72-result.malecns-save');
const output=path.join(root,'.impeccable/review/decoder7/joint-mutation-ab-rtx-20261028');
const rewardPath=path.join(root,'outputs/rewards.js');
const progressPath=path.join(root,'outputs/progress-save.js');
const densePath=path.join(root,'outputs/dense-neural.js');
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stable=value=>JSON.stringify(value);
const optimizerSnapshot=value=>({mean:value.mean,sigma:value.sigma,updates:value.updates,episodes:value.episodes});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const started=performance.now();
let Cuda=null,DenseRef=null,originalDense=null,uninstall=null;

function compileProgressSave(simulation,learning){
  let source=fs.readFileSync(progressPath,'utf8');
  const anchor="factory(require('./simulation.js'),require('./neural-learning.js'),require('node:crypto'))";
  if(source.split(anchor).length!==2)throw Error('Progress-save loader anchor is not unique.');
  source=source.replace(anchor,'factory(globalThis.__decoder7JointSimulation,globalThis.__decoder7JointLearning,require(\'node:crypto\'))');
  globalThis.__decoder7JointSimulation=simulation;
  globalThis.__decoder7JointLearning=learning;
  try{
    const filename=path.join(root,'work','__decoder7-joint-progress-save-runtime.cjs');
    const mod=new Module(filename,module);
    mod.filename=filename;
    mod.paths=Module._nodeModulePaths(path.dirname(filename));
    mod._compile(source,filename);
    return mod.exports;
  }finally{
    delete globalThis.__decoder7JointSimulation;
    delete globalThis.__decoder7JointLearning;
  }
}

function jointSafeMotorMutation(graph,values,random,amount,counters){
  const p=graph.learning;
  if(p?.actionCount!==3||p.readoutStride!==3||!Number.isFinite(amount))throw Error('Joint mutation requires the D7 three-action policy.');
  const intensity=Math.max(0,amount)/.16*.35/Math.sqrt(3);
  if(!intensity)return values.slice();
  const child=values.slice();
  const rho=random()<.5?.55:-.55;
  const independentScale=Math.sqrt(1-rho*rho);
  const mutateTriple=(offset,scale)=>{
    const u1=Math.max(1e-9,random()),u2=random(),radius=Math.sqrt(-2*Math.log(u1)),angle=2*Math.PI*u2;
    const zSteer=radius*Math.cos(angle),zIndependent=radius*Math.sin(angle);
    const zLong=rho*zSteer+independentScale*zIndependent;
    child[offset]=clamp(child[offset]+zSteer*scale*p.scales[offset]*intensity,-8,8);
    child[offset+1]=clamp(child[offset+1]+zLong*scale*p.scales[offset+1]*intensity,-8,8);
    child[offset+2]=clamp(child[offset+2]-zLong*scale*p.scales[offset+2]*intensity,-8,8);
  };
  for(let j=0;j<p.featureCount;j++)mutateTriple(p.readoutOffset+j*p.readoutStride,1);
  mutateTriple(p.biasOffset,1);
  const changed=new Set();
  for(let i=0;i<child.length;i++)if(child[i]!==values[i])changed.add(i);
  const firstMotor=p.readoutOffset,lastMotor=p.thresholdOffset,biasStart=p.biasOffset;
  const invalid=[...changed].filter(i=>!((i>=firstMotor&&i<lastMotor)||i>=biasStart));
  if(invalid.length)throw Error('Joint mutation changed sensory/gain/threshold parameters.');
  if(changed.size===0)throw Error('Joint mutation produced no parameter changes.');
  counters.calls++;
  counters.changedCoefficients+=changed.size;
  for(const i of changed){
    const action=i>=biasStart?i-biasStart:(i-firstMotor)%p.readoutStride;
    counters.changedActions[action]++;
  }
  return child;
}

async function main(){
  if(fs.existsSync(output))throw Error('Output already exists; refusing to overwrite a prior experiment.');
  if(!fs.existsSync(input))throw Error('Progress-7 decoder-7 checkpoint is missing.');
  const inputHash=sha256(input);
  const progress7Result=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/decoder7/progress7-reward-rtx-20261028-rerun/result.json'),'utf8'));
  if(inputHash!==progress7Result.outputSave.sha256)throw Error('Starting checkpoint hash does not match its recorded result.');
  const inputFile=await LegacyP.decode(fs.readFileSync(input,'utf8'),'5.6.0');
  const initialPayload=JSON.parse(JSON.stringify(inputFile.payload));
  const state=initialPayload.workers[0].state;
  if(state.generation!==72||state.population!==40||state.rewardRevision!=='progress-7-moving-pace'||state.genomes.some(g=>g?.adapterVersion!==7))throw Error('Unexpected A/B input checkpoint.');

  const base=D6.runtime,simPath=path.join(base,'outputs/simulation.js');
  let simSource=fs.readFileSync(simPath,'utf8');
  const oldRewardImport="  const Rewards=typeof module!=='undefined'&&module.exports?require('./rewards.js'):root.MaleCNSRewards;";
  const cpuLoop="for(let iter=0;iter<iterations;iter++){brain.sum.set(injection);if(edgesEnabled)for(let e=0;e<graph.from.length;e++){const source=graph.from[e];brain.sum[graph.to[e]]+=.9*graph.weights[e]*brain.activity[source]*(gains?gains[graph.learning.groups[source]]:1);}for(let i=0;i<graph.n;i++)brain.next[i]=.45*brain.activity[i]+.55*Math.tanh(brain.sum[i]);[brain.activity,brain.next]=[brain.next,brain.activity];}";
  if(simSource.split(oldRewardImport).length!==2||simSource.split(cpuLoop).length!==2)throw Error('Decoder-7 source anchors are not unique.');
  const rewardBinding=`  const Rewards=require(${JSON.stringify(rewardPath)});`;
  simSource=simSource.replace(oldRewardImport,rewardBinding);
  simSource=simSource.replace(rewardBinding,`${rewardBinding}\n  const Dense=require(${JSON.stringify(densePath)});`);
  simSource=simSource.replace(cpuLoop,'if(Dense&&brain.sum instanceof Float64Array&&brain.activity instanceof Float64Array&&brain.next instanceof Float64Array)Dense.step(graph,brain,iterations,edgesEnabled,gains);else '+cpuLoop);
  const simModule=new Module(simPath,module);simModule.filename=simPath;simModule.paths=Module._nodeModulePaths(path.dirname(simPath));simModule._compile(simSource,simPath);
  DenseRef=require(densePath);
  const F=simModule.exports,Rewards=require(rewardPath);
  if(Rewards.REVISION!==state.rewardRevision)throw Error('Reward revision does not match the shared checkpoint.');
  uninstall=D7.install(L);
  const singleHeadMutation=L.safeMotorMutation;
  const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const sim=new F.Simulation(D7.model(source),{population:state.population,circuitId:state.circuitId,circuits:catalog});
  const CurrentP=compileProgressSave(F,L);
  CurrentP.validatePayload(initialPayload,{graph:sim.graph,circuits:sim.circuits});
  const genotypeHash=crypto.createHash('sha256').update(stable(state.genomes)).digest('hex');
  const optimizerHash=crypto.createHash('sha256').update(stable(optimizerSnapshot(state.optimizer))).digest('hex');
  const rngState=state.rngState,generation=state.generation;
  CurrentP.restore(sim,state);sim.rewardRevision=state.rewardRevision;
  if(crypto.createHash('sha256').update(stable(sim.cars.map(c=>c.genome))).digest('hex')!==genotypeHash)throw Error('Initial A/B genomes changed on restore.');
  if(crypto.createHash('sha256').update(stable(optimizerSnapshot(sim.optimizer))).digest('hex')!==optimizerHash)throw Error('Initial A/B optimizer changed on restore.');
  if(sim.generation!==generation||sim.random.getState()!==rngState)throw Error('Initial A/B generation or RNG changed on restore.');

  // Unit-style invariant check on the actual checkpoint graph before either
  // arm runs. Zero amount is identity; nonzero variation touches all motor
  // heads and no injection, gain or neuronal-threshold coefficients.
  const probe=state.genomes.find(g=>g?.adapterVersion===7)?.policyWeights;
  const probeRng=F.rng(7717),probeCounters={calls:0,changedCoefficients:0,changedActions:[0,0,0]};
  const zero=jointSafeMotorMutation(sim.graph,probe,probeRng,0,probeCounters);
  if(stable(zero)!==stable(probe))throw Error('Zero-mutation identity failed.');
  const perturbed=jointSafeMotorMutation(sim.graph,probe,probeRng,.16,probeCounters);
  if(probeCounters.calls!==1||probeCounters.changedActions.some(x=>x===0)||perturbed.length!==probe.length)throw Error('Joint mutation coverage preflight failed.');
  if(process.argv.includes('--preflight-only')){
    console.log('DECODER7_JOINT_PREFLIGHT_PASS '+JSON.stringify({inputSha256:inputHash,generation,population:state.population,rewardRevision:state.rewardRevision,policyVersion:sim.graph.learning.version,parameters:sim.graph.learning.length,genotypeSha256:genotypeHash,optimizerSha256:optimizerHash,rngStatePreserved:true,zeroMutationIdentity:true,changedCoefficients:probeCounters.changedCoefficients,changedActions:probeCounters.changedActions}));
    return;
  }

  fs.mkdirSync(output,{recursive:false});
  Cuda=require('./cuda-exact-v3-runtime.cjs');
  originalDense=DenseRef.step;DenseRef.step=(...args)=>Cuda.pass(...args);
  const armResults={};
  const runArm=async(name,mutation)=>{
    L.safeMotorMutation=mutation;
    const counters={calls:0,changedCoefficients:0,changedActions:[0,0,0]};
    const original=mutation===singleHeadMutation?singleHeadMutation:L.safeMotorMutation;
    if(name==='joint')L.safeMotorMutation=(g,w,r,a,e,f)=>jointSafeMotorMutation(g,w,r,a,counters);
    else L.safeMotorMutation=(g,w,r,a,e,f)=>{counters.calls++;return original(g,w,r,a,e,f);};
    if(name!=='control')CurrentP.restore(sim,state);
    sim.rewardRevision=state.rewardRevision;sim.running=true;
    let cars=[],maxThrottle=0,maxBrake=0,maxSteering=0,lastProgress=performance.now();
    sim.onTrialTick=s=>{
      for(const car of s.cars)if(car.speed/(car.pixelsPerMeter||1)>2){
        maxThrottle=Math.max(maxThrottle,car.slowOutputs?.[1]||0);
        maxBrake=Math.max(maxBrake,car.slowOutputs?.[2]||0);
        maxSteering=Math.max(maxSteering,Math.abs(car.slowOutputs?.[0]||0));
      }
      if(performance.now()-lastProgress>25000){
        lastProgress=performance.now();
        console.log('DECODER7_JOINT_'+name.toUpperCase()+'_RUNNING '+JSON.stringify({generation:s.generation,elapsed:s.elapsed,alive:s.cars.filter(c=>c.alive).length,progress:Math.max(...s.cars.map(c=>c.bestProgress))}));
      }
      if(s.cars.every(c=>!c.alive))cars=s.cars.map(c=>({id:c.id,progress:c.bestProgress,fitness:c.fitness,laps:c.laps,reason:c.reason}));
    };
    const history=[];
    for(let i=0;i<4;i++){
      cars=[];maxThrottle=0;maxBrake=0;maxSteering=0;
      const current=sim.generation;let ticks=0;
      while(sim.generation===current&&ticks++<60000)sim.tick();
      if(sim.generation===current)throw Error(name+' natural generation unfinished; refusing forced evolve.');
      if(cars.length!==sim.population)throw Error(name+' omitted one or more terminal agents.');
      const row={...sim.history.at(-1),cars,maxThrottle,maxBrake,maxSteering,
        safeCars:cars.filter(c=>!['urto','uscita di pista','progresso non valido'].includes(c.reason)).length,
        rawBest:Math.max(...cars.map(c=>c.progress)),
        safeBest:Math.max(...cars.filter(c=>!['urto','uscita di pista','progresso non valido'].includes(c.reason)).map(c=>c.progress),0),
        agentsAt750:cars.filter(c=>c.progress>=750).length,
        agentsAt800:cars.filter(c=>c.progress>=800).length,
        learningFrontier:{...sim.learningFrontier},
        frontierDiagnostics:sim.lastFrontierDiagnostics??null};
      history.push(row);
      fs.writeFileSync(path.join(output,name+'-partial.json'),JSON.stringify({history,mutationCounters:counters},null,2));
      console.log('DECODER7_JOINT_'+name.toUpperCase()+'_GENERATION '+JSON.stringify({generation:row.generation,best:row.bestProgress,rawBest:row.rawBest,safeBest:row.safeBest,mean:row.meanProgress,laps:row.maxLaps,safeCars:row.safeCars,at750:row.agentsAt750,at800:row.agentsAt800,mutations:counters.calls,changedCoefficients:counters.changedCoefficients,changedActions:counters.changedActions,frontier:row.learningFrontier,wallSeconds:(performance.now()-started)/1000}));
    }
    const savePath=path.join(output,name+'-gen'+sim.generation+'-result.malecns-save');
    fs.writeFileSync(savePath,await CurrentP.encode(CurrentP.fromSimulation(sim),inputFile.appVersion));
    const reread=await CurrentP.decode(fs.readFileSync(savePath,'utf8'),inputFile.appVersion);
    CurrentP.validatePayload(reread.payload,{graph:sim.graph,circuits:sim.circuits});
    const arm={name,history,mutationCounters:counters,outputSave:{path:savePath,sha256:sha256(savePath),bytes:fs.statSync(savePath).size},
      gpu:Cuda.stats(),gpuIdentity:Cuda.identity(),wallSeconds:(performance.now()-started)/1000};
    armResults[name]=arm;
    fs.writeFileSync(path.join(output,name+'-result.json'),JSON.stringify(arm,null,2));
    return arm;
  };

  await runArm('control',singleHeadMutation);
  CurrentP.restore(sim,state);sim.rewardRevision=state.rewardRevision;
  const joint=await runArm('joint',jointSafeMotorMutation);
  L.safeMotorMutation=singleHeadMutation;
  const control=armResults.control;
  const comparison=control.history.map((c,i)=>{
    const t=joint.history[i];
    return {generation:c.generation,control:{safeBest:c.safeBest,rawBest:c.rawBest,mean:c.meanProgress,laps:c.maxLaps,safeCars:c.safeCars,at750:c.agentsAt750,at800:c.agentsAt800},
      joint:{safeBest:t.safeBest,rawBest:t.rawBest,mean:t.meanProgress,laps:t.maxLaps,safeCars:t.safeCars,at750:t.agentsAt750,at800:t.agentsAt800},
      delta:{safeBest:t.safeBest-c.safeBest,rawBest:t.rawBest-c.rawBest,mean:t.meanProgress-c.meanProgress,safeCars:t.safeCars-c.safeCars,at750:t.agentsAt750-c.agentsAt750,at800:t.agentsAt800-c.agentsAt800}};
  });
  const finalGpu=Cuda.stats(),finalGpuIdentity=Cuda.identity();
  if(finalGpu.gpuCalls<=0||finalGpu.cpuFallbacks!==0||finalGpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 CUDA execution without CPU fallback.');
  const result={variant:'decoder7-progress7-coordinated-motor-mutation-ab',appVersion:inputFile.appVersion,
    start:{sha256:inputHash,generation,population:state.population,rewardRevision:state.rewardRevision,policyVersion:sim.graph.learning.version,parameters:sim.graph.learning.length,genotypeSha256:genotypeHash,optimizerSha256:optimizerHash,rngState},
    mutation:{control:'existing D7 one-action-at-a-time safe mutation',treatment:'correlated steering/gas/brake readout noise at matched total mutation energy, no changes to sensor/gain/threshold coefficients',zeroMutationIdentity:true,threeHeadsChangedInPreflight:probeCounters.changedActions},
    comparison,arms:armResults,gpu:finalGpu,gpuIdentity:finalGpuIdentity,
    inputIntegrity:{inputUnchanged:sha256(input)===inputHash,inputSha256:inputHash},
    sourceSha256:{simulation:sha256(simPath),learning:sha256(path.join(base,'outputs/neural-learning.js')),rewards:sha256(rewardPath),progress:sha256(progressPath),vehicle:sha256(path.join(base,'outputs/vehicle-992.js')),decoderModel:sha256(path.join(root,'work/decoder7-model.cjs')),runner:sha256(path.join(root,'work/decoder7-joint-mutation-ab-rtx.cjs'))},
    limits:'Research-only D7 experiment from an already trained V3/Monza checkpoint. It does not establish two-lap learning, cold-start learning, generalization, or compatibility with the published 5.6.0 app. No route cues, ideal actions, or user save edits.'};
  if(!result.inputIntegrity.inputUnchanged)throw Error('Starting checkpoint changed during the A/B.');
  fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(result,null,2));
  console.log('DECODER7_JOINT_AB_DONE '+JSON.stringify({gpuCalls:finalGpu.gpuCalls,cpuFallbacks:finalGpu.cpuFallbacks,inputUnchanged:result.inputIntegrity.inputUnchanged,comparison,controlSave:control.outputSave,jointSave:joint.outputSave,wallSeconds:result.arms.joint.wallSeconds}));
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
