'use strict';

// Paired RTX study: compare natural decoder7 evolution with the same saved
// population after a context-local steering shift is applied to the ES mean.
// Research only: production sources, user saves, and release assets are read-only.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const input=path.join(root,'.impeccable/review/decoder7/natural-continuation-gen112-four-updates-rtx-20261028/decoder7-main-runtime-gen116-research.malecns-save');
const parentReport=path.join(root,'.impeccable/review/decoder7/natural-continuation-gen112-four-updates-rtx-20261028/decoder7-main-runtime-result.json');
const baselineReportPath=path.join(root,'.impeccable/review/decoder7/context-mean-steer005-ab-rtx-20261028/report.json');
const userSave='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const output=path.join(root,'.impeccable/review/decoder7/context-mean-target-steer005-ab-rtx-20261028');
const generationCount=4,targetProgress=790,steeringDelta=.05;
const simulationPath=path.join(root,'outputs/simulation.js');
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const fileHash=file=>sha256(fs.readFileSync(file));
const clone=value=>JSON.parse(JSON.stringify(value));

function installMainCompatibleDecoder6(L,D6){
  const originalBuild=L.build;
  L.build=function(graph){
    const config=graph.policyConfig;
    if(config?.version!==6)return originalBuild(graph);
    graph.policyConfig=null;let base;
    try{base=originalBuild(graph);}finally{graph.policyConfig=config;}
    const n=base.nodes.length,featureCount=n*2,readoutOffset=base.readoutOffset;
    if(base.version!==3||n!==64||base.length!==202)throw Error('V3 base policy no longer matches decoder6 assumptions.');
    const thresholdOffset=readoutOffset+featureCount*2,length=thresholdOffset+n+2,mean=Array(length).fill(0),scales=Array(length).fill(.1);
    for(let i=0;i<readoutOffset;i++){mean[i]=base.mean[i];scales[i]=base.scales[i];}
    for(let j=0;j<n;j++){mean[readoutOffset+j*2]=base.mean[readoutOffset+j*2];mean[readoutOffset+j*2+1]=base.mean[readoutOffset+j*2+1];}
    for(let j=0;j<featureCount;j++){scales[readoutOffset+j*2]=j<n?.08:.05;scales[readoutOffset+j*2+1]=j<n?.2:.1;}
    for(let j=0;j<n;j++)scales[thresholdOffset+j]=.03;
    mean[length-2]=base.mean[base.length-2];mean[length-1]=base.mean[base.length-1];
    scales[length-2]=base.scales[base.scales.length-2];scales[length-1]=base.scales[base.scales.length-1];
    graph.learning={...base,version:6,featureCount,featureNorm:1/Math.sqrt(n),thresholdOffset,nonlinear:true,readoutStride:2,length,mean,scales};
    return graph.learning;
  };
  return ()=>{L.build=originalBuild;};
}

function createSimulation(payload,state,F,P,L,Legacy,D7,Rewards,circuits,source){
  const model=Legacy.tagV3(source);model.policyConfig={...D7.POLICY};model.modelLabel='V3 · decoder 7 sperimentale';
  const sim=new F.Simulation(model,{modelId:'v3',population:state.population,circuitId:state.circuitId,circuits});
  P.validatePayload(payload,{graph:sim.graph,circuits:sim.circuits});
  P.restore(sim,clone(state));
  if(sim.generation!==state.generation||sim.population!==40||sim.circuitId!=='monza'||state.rewardRevision!==Rewards.REVISION)
    throw Error('Checkpoint validation failed.');
  return sim;
}

function policyLogit(policy,weights,features,action=0){
  let sum=weights[policy.biasOffset+action];
  for(let j=0;j<features.length;j++)sum+=features[j]*policy.featureNorm*weights[policy.readoutOffset+j*policy.readoutStride+action];
  return sum;
}

async function main(){
  let outputCreated=false;
  if(fs.existsSync(output))throw Error('Output directory exists; refusing to overwrite earlier evidence.');
  fs.mkdirSync(output,{recursive:false});outputCreated=true;
  const inputHash=fileHash(input),userSaveHash=fileHash(userSave),parent=JSON.parse(fs.readFileSync(parentReport,'utf8'));
  const pairedBaseline=JSON.parse(fs.readFileSync(baselineReportPath,'utf8'));
  if(inputHash!==parent.outputSave.sha256)throw Error('Input checkpoint hash does not match its recorded parent report.');
  if(pairedBaseline.integrity.inputSha256!==inputHash||pairedBaseline.control.history.length!==generationCount)
    throw Error('Paired control does not match the exact checkpoint or generation count.');
  const appSave=await require(path.join(root,'outputs/progress-save.js')).decode(fs.readFileSync(input,'utf8'),'5.6.0');
  const state=appSave.payload.workers[0].state;
  const P=require(path.join(root,'outputs/progress-save.js'));
  const L=require(path.join(root,'outputs/neural-learning.js'));
  const Legacy=require(path.join(root,'outputs/legacy-models.js'));
  const Dense=require(path.join(root,'outputs/dense-neural.js'));
  const D6=require('./decoder6-model.cjs');
  const D7=require('./decoder7-model.cjs');
  const Rewards=require(path.join(root,'outputs/rewards.js'));
  const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const restoreBuild=installMainCompatibleDecoder6(L,D6),uninstallDecoder7=D7.install(L);
  const F=require(simulationPath);
  let Cuda=null,originalDenseStep=null;
  try{
    const oldPolicy=D6.F.ensureLearning(D6.F.compileGraph(D6.model(source)));
    const migration=D7.expand(oldPolicy);
    const contextSim=createSimulation(appSave.payload,state,F,P,L,Legacy,D7,Rewards,circuits,source);
    const policy=contextSim.graph.learning;
    if(!migration.mean.every((v,i)=>v===policy.mean[i])||!migration.scales.every((v,i)=>v===policy.scales[i]))
      throw Error('Decoder7 expansion does not match the experiment checkpoint.');
    const candidates=[...contextSim.hallOfFame.map(entry=>({...entry,source:'hall-of-fame'})),
      ...(contextSim.champion&&contextSim.championStats?[{...contextSim.championStats,genome:contextSim.champion,source:'champion'}]:[])]
      .filter(entry=>entry.genome?.adapterVersion===7&&Number.isFinite(entry.bestProgress))
      .sort((a,b)=>(Number(b.laps)||0)-(Number(a.laps)||0)||b.bestProgress-a.bestProgress);
    const candidate=candidates[0];
    if(!candidate||candidate.bestProgress+1e-6<contextSim.safeLearningFrontier.progress)throw Error('No archived safe genome matches the current frontier.');
    contextSim.population=1;contextSim.mutation=0;contextSim.spawn([candidate.genome],false,[]);contextSim.running=true;
    Cuda=require(path.join(root,'work/cuda-exact-v3-runtime.cjs'));
    originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
    const anchorProgress=[100,300,500,600,650,680,700,720,740,760,770,775],anchors=new Map();
    let target=null,terminal=null,ticks=0;
    contextSim.onTrialTick=s=>{
      const car=s.cars[0];
      if(car?.brain?.policyFeatures?.length===policy.featureCount){
        for(const progress of anchorProgress)if(!anchors.has(progress)&&car.bestProgress>=progress)
          anchors.set(progress,{progress:car.bestProgress,steering:car.slowOutputs?.[0]||0,features:Array.from(car.brain.policyFeatures)});
        if(!target&&car.bestProgress>=targetProgress)target={progress:car.bestProgress,steering:car.slowOutputs?.[0]||0,features:Array.from(car.brain.policyFeatures)};
      }
      if(car&&!car.alive)terminal={reason:car.reason,progress:car.bestProgress,laps:car.laps,safe:F.isSafeLearningOutcome(car)};
    };
    while(!terminal&&ticks<60000){contextSim.tick();ticks++;}
    if(!terminal)throw Error('Context replay did not terminate naturally.');
    if(!target||anchorProgress.some(progress=>!anchors.has(progress)))throw Error('Context replay missed one or more target/anchor states.');
    const featureVector=sample=>[...sample.features.map(v=>v*policy.featureNorm),1];
    const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
    const orthogonalize=(vector,basis)=>{const result=vector.slice();for(let pass=0;pass<2;pass++)for(const anchor of basis){const projection=dot(result,anchor);for(let i=0;i<result.length;i++)result[i]-=projection*anchor[i];}return result;};
    const basis=[];
    for(const progress of anchorProgress){const vector=featureVector(anchors.get(progress)),orthogonal=orthogonalize(vector,basis),length=Math.sqrt(dot(orthogonal,orthogonal));if(length>1e-8)basis.push(orthogonal.map(v=>v/length));}
    const targetVector=featureVector(target),direction=orthogonalize(targetVector,basis),response=dot(targetVector,direction);
    if(!(response>1e-7))throw Error('Target context has no steering direction outside the preserved anchors.');
    const baseSteering=target.steering;
    const requestedTargetSteering=Math.max(-.999999,Math.min(.999999,baseSteering+steeringDelta));
    const meanBefore=policyLogit(policy,contextSim.optimizer.mean,target.features);
    const requestedLogitDelta=Math.atanh(requestedTargetSteering)-meanBefore;
    const rawDelta=direction.map(v=>v*requestedLogitDelta/response);
    const readoutIndices=Array.from({length:policy.featureCount},(_,i)=>policy.readoutOffset+i*policy.readoutStride);
    const appliedDelta=rawDelta.map((v,i)=>v);
    let shrink=1;for(let i=0;i<readoutIndices.length;i++)if(appliedDelta[i])shrink=Math.min(shrink,Math.max(0,(8-Math.abs(contextSim.optimizer.mean[readoutIndices[i]]))/Math.abs(appliedDelta[i])));
    const biasIndex=policy.biasOffset;
    if(appliedDelta.at(-1))shrink=Math.min(shrink,Math.max(0,(8-Math.abs(contextSim.optimizer.mean[biasIndex]))/Math.abs(appliedDelta.at(-1))));
    if(!(shrink>0))throw Error('Mean steering patch is clipped at the parameter bound.');
    const patchedDelta=rawDelta.map(v=>v*Math.min(1,shrink)*(1-1e-12));
    const meanPatched=contextSim.optimizer.mean.slice();
    for(let i=0;i<readoutIndices.length;i++)meanPatched[readoutIndices[i]]+=patchedDelta[i];
    meanPatched[biasIndex]+=patchedDelta.at(-1);
    if(!L.valid(contextSim.graph,meanPatched))throw Error('Patched ES mean failed policy validation.');
    const anchorMeanOutputDeltas=anchorProgress.map(progress=>{
      const features=anchors.get(progress).features,before=Math.tanh(policyLogit(policy,contextSim.optimizer.mean,features));
      const after=Math.tanh(policyLogit(policy,meanPatched,features));
      return {requested:progress,observed:anchors.get(progress).progress,before,after,delta:after-before};
    });
    const patch={target:{progress:target.progress,candidateSteering:baseSteering,requestedMeanSteering:requestedTargetSteering,features:target.features.length},
      anchors:anchorProgress.map(progress=>({requested:progress,observed:anchors.get(progress).progress,steering:anchors.get(progress).steering})),
      anchorBasisRank:basis.length,orthogonalTargetNormSquared:response,requestedSteeringDelta:steeringDelta,requestedLogitDelta,
      parameterShrink:Math.min(1,shrink),appliedMeanLogitDelta:requestedLogitDelta*Math.min(1,shrink),meanSteeringAtTargetBefore:Math.tanh(meanBefore),
      meanSteeringAtTargetAfter:Math.tanh(policyLogit(policy,meanPatched,target.features)),anchorMeanOutputDeltas,
      changedParameters:meanPatched.reduce((n,v,i)=>n+(v!==contextSim.optimizer.mean[i]?1:0),0)};

    const runBranch=async(label,patched)=>{
      const sim=createSimulation(appSave.payload,state,F,P,L,Legacy,D7,Rewards,circuits,source);
      if(patched)sim.optimizer.mean=meanPatched.slice();
      const initialMean=sim.optimizer.mean.slice();
      sim.running=true;
      const history=[];let cars=[],lastProgress=performance.now();
      sim.onTrialTick=s=>{
        if(s.cars.every(car=>!car.alive))cars=s.cars.map(car=>({id:car.id,progress:car.bestProgress,laps:car.laps,fitness:car.fitness,reason:car.reason,safe:F.isSafeLearningOutcome(car)}));
        if(performance.now()-lastProgress>20000){lastProgress=performance.now();console.log('CONTEXT_MEAN_PROGRESS '+JSON.stringify({branch:label,generation:s.generation,elapsed:+s.elapsed.toFixed(1),alive:s.cars.filter(car=>car.alive).length,maxProgress:Math.max(...s.cars.map(car=>car.bestProgress))}));}
      };
      for(let update=0;update<generationCount;update++){
        cars=[];const generation=sim.generation;let ticks=0;
        while(sim.generation===generation&&ticks++<60000)sim.tick();
        if(sim.generation===generation)throw Error(`${label}: generation ${generation} did not terminate naturally.`);
        const row={generation,results:cars,safeCount:cars.filter(car=>car.safe).length,
          collisionCount:cars.filter(car=>!car.safe).length,safeProgress:Math.max(-Infinity,...cars.filter(car=>car.safe).map(car=>car.progress)),
          rawProgress:Math.max(-Infinity,...cars.map(car=>car.progress)),laps:Math.max(0,...cars.map(car=>car.laps)),
          safeFrontier:sim.safeLearningFrontier.progress,optimizerUpdates:sim.optimizer.updates,optimizerEpisodes:sim.optimizer.episodes,
          nextEsSamples:sim.optimizerSampleIds?.size||0};
        if(!Number.isFinite(row.safeProgress))row.safeProgress=null;
        history.push(row);
        fs.writeFileSync(path.join(output,'partial.json'),JSON.stringify({branch:label,history},null,2));
        console.log('CONTEXT_MEAN_GENERATION '+JSON.stringify({branch:label,generation,safeCount:row.safeCount,safeProgress:row.safeProgress,frontier:row.safeFrontier,laps:row.laps,nextEsSamples:row.nextEsSamples}));
      }
      return {label,initialOptimizerMeanSha256:sha256(Buffer.from(JSON.stringify(initialMean))),history};
    };

    const preRunGpuCalls=Cuda.stats().gpuCalls;
    const treatment=await runBranch('context-mean-aligned-to-candidate-plus-0.05',true);
    const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
    if(gpu.gpuCalls<=preRunGpuCalls||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 execution with no CPU fallback.');
    const control=pairedBaseline.control;
    const deltas=control.history.map((row,i)=>({generation:row.generation,treatedGeneration:treatment.history[i].generation,
      safeCount:treatment.history[i].safeCount-row.safeCount,safeProgressM:((treatment.history[i].safeProgress??0)-(row.safeProgress??0)),
      safeFrontierM:treatment.history[i].safeFrontier-row.safeFrontier,laps:treatment.history[i].laps-row.laps}));
    const persistentFrontierGain=deltas.slice(-2).every(row=>row.safeFrontierM>=2);
    const anyLapGain=deltas.some(row=>row.laps>0);
    const report={format:'decoder7-contextual-ES-mean-alignment-paired-study-v1',appVersion:appSave.appVersion,
      method:'Capture neural context at 790 m and twelve earlier anchors from the safe frontier genome; set the ES mean steering output at the target context to the safe genome output plus 0.05 by orthogonalizing against the anchor basis. Compare against the already completed natural control using the identical checkpoint, seed, RNG, mutation, population, rewards, and physics.',
      settings:{circuit:'Monza',startingGeneration:state.generation,population:state.population,seed:state.seed,generations:generationCount,policyParameters:policy.length,targetProgressM:targetProgress,requestedSteeringDelta:steeringDelta,pairedBaselineReport:baselineReportPath,pairedBaselineSha256:fileHash(baselineReportPath)},
      candidate:{source:candidate.source,progress:candidate.bestProgress,laps:candidate.laps,safeFrontier:contextSim.safeLearningFrontier.progress},
      contextReplay:{terminal,ticks,patch},control,treatment,deltas,decision:anyLapGain?'promising; replay across additional seeds required':persistentFrontierGain?'promising; replay across additional seeds required':'not promoted; no robust lap or persistent >=2 m safe-frontier gain',
      integrity:{inputSha256:inputHash,inputUnchanged:fileHash(input)===inputHash,userSaveSha256:userSaveHash,userSaveUnchanged:fileHash(userSave)===userSaveHash,
        appVersion:appSave.appVersion,productionSourceSha256:fileHash(simulationPath),learningSourceSha256:fileHash(path.join(root,'outputs/neural-learning.js'))},
      gpu,gpuIdentity,wallSeconds:((Date.now()-startTime)/1000),
      limits:'One trained checkpoint, one circuit, one seed, four natural generations in the treatment. The paired control is a previous run from the identical checkpoint. The context alignment is an experimental ES-mean initialization, not a promoted learned model; it does not establish cross-seed generalization.'};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    fs.rmSync(path.join(output,'partial.json'),{force:true});
    console.log('CONTEXT_MEAN_DONE '+JSON.stringify({decision:report.decision,deltas,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,wallSeconds:report.wallSeconds,report:path.join(output,'report.json')}));
  }catch(error){
    if(outputCreated)fs.writeFileSync(path.join(output,'error.json'),JSON.stringify({error:error.stack||String(error),inputSha256:inputHash,userSaveSha256:userSaveHash},null,2));
    throw error;
  }finally{
    if(originalDenseStep)Dense.step=originalDenseStep;
    if(Cuda)Cuda.dispose?.();
    uninstallDecoder7();restoreBuild();
  }
}

const startTime=Date.now();
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
