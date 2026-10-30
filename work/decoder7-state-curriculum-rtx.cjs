// Research-only V3/decoder7 state-distribution curriculum.
// All context states are captured from real simulator trajectories. Candidate
// actions remain exclusively neural; no route or steering targets are supplied.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const arg=(key,fallback)=>{const item=process.argv.find(value=>value.startsWith(`${key}=`));return item?item.slice(key.length+1):fallback;};
const input=path.resolve(arg('--input',path.join(root,'.impeccable/review/decoder7/seed850813-natural-control-rtx-20261028/decoder7-main-runtime-gen108-research.malecns-save')));
const parentReport=path.resolve(arg('--parent-report',path.join(root,'.impeccable/review/decoder7/seed850813-natural-control-rtx-20261028/decoder7-main-runtime-result.json')));
const output=path.resolve(arg('--output',path.join(root,'.impeccable/review/decoder7/seed850813-state-curriculum-four-stage-20261028')));
const userSave=path.resolve(arg('--user-save','C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save'));
const contextsFile=arg('--contexts-json','');
const distributionFile=arg('--distribution-json','');
const stageReportFile=arg('--stage-report','');
const expectedGeneration=Number(arg('--generation','108'));
const targets=[720,740,760,780];
const samplesPerStage=40;
const localTicks=720;
const historyLimit=96;
const blendValues=arg('--blend-values','0.05,0.1,0.25').split(',').map(Number);
if(!blendValues.length||blendValues.some(value=>!Number.isFinite(value)||value<=0||value>1))throw Error('Blend values must be in (0, 1].');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const fileHash=file=>sha(fs.readFileSync(file));

function installMainCompatibleDecoder6(L,D7){
  const originalBuild=L.build;
  L.build=function(graph){
    const config=graph.policyConfig;
    if(config?.version!==6)return originalBuild(graph);
    graph.policyConfig=null;
    let base;try{base=originalBuild(graph);}finally{graph.policyConfig=config;}
    const n=base.nodes.length,featureCount=n*2,readoutOffset=base.readoutOffset;
    if(base.version!==3||n!==64||base.length!==202)throw Error('Current V3 base policy no longer matches decoder6 assumptions.');
    const thresholdOffset=readoutOffset+featureCount*2,length=thresholdOffset+n+2;
    const mean=Array(length).fill(0),scales=Array(length).fill(.1);
    for(let i=0;i<readoutOffset;i++){mean[i]=base.mean[i];scales[i]=base.scales[i];}
    for(let j=0;j<n;j++){mean[readoutOffset+j*2]=base.mean[readoutOffset+j*2];mean[readoutOffset+j*2+1]=base.mean[readoutOffset+j*2+1];}
    for(let j=0;j<featureCount;j++){scales[readoutOffset+j*2]=j<n?.08:.05;scales[readoutOffset+j*2+1]=j<n?.2:.1;}
    for(let j=0;j<n;j++)scales[thresholdOffset+j]=.03;
    mean[length-2]=base.mean[base.length-2];mean[length-1]=base.mean[base.length-1];
    scales[length-2]=base.scales[base.length-2];scales[length-1]=base.scales[base.length-1];
    const policy={...base,version:6,featureCount,featureNorm:1/Math.sqrt(n),thresholdOffset,nonlinear:true,readoutStride:2,length,mean,scales};
    graph.learning=policy;return policy;
  };
  return ()=>{L.build=originalBuild;};
}

function makeRuntime(inputSave){
  const simulationPath=path.join(root,'outputs/simulation.js');
  const F=require(simulationPath),P=require(path.join(root,'outputs/progress-save.js'));
  const L=require(path.join(root,'outputs/neural-learning.js'));
  const Legacy=require(path.join(root,'outputs/legacy-models.js'));
  const Dense=require(path.join(root,'outputs/dense-neural.js'));
  const D6=require('./decoder6-model.cjs'),D7=require('./decoder7-model.cjs');
  const Rewards=require(path.join(root,'outputs/rewards.js'));
  installMainCompatibleDecoder6(L,D7);D7.install(L);
  const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  const model=Legacy.tagV3(source);model.policyConfig={...D7.POLICY};
  const circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const sim=new F.Simulation(model,{modelId:'v3',population:inputSave.payload.workers[0].state.population,circuitId:inputSave.payload.workers[0].state.circuitId,circuits});
  P.validatePayload(inputSave.payload,{graph:sim.graph,circuits:sim.circuits});
  P.restore(sim,inputSave.payload.workers[0].state);
  const Cuda=require(path.join(root,'work/cuda-exact-v3-runtime.cjs'));
  Dense.step=(...args)=>Cuda.pass(...args);
  return {F,P,L,Dense,Cuda,Rewards,sim,simulationPath};
}

function rehydrateContext(F,graph,genome,context){
  if(!context.sensorHistory?.length)throw Error(`Context ${context.targetProgress} has no neural sensor history.`);
  const brain=F.makeBrain(graph);let heldOutputs=[0,0,0];
  for(const sensors of context.sensorHistory){
    if(!Array.isArray(sensors)||sensors.length!==F.SENSOR_COUNT)throw Error('Captured sensor history has an incompatible shape.');
    heldOutputs=F.neuralStep(graph,brain,genome,sensors);
  }
  const state={...context.state,activity:Array.from(brain.activity)};
  delete state.controlInterval;delete state.nextControlPhase;delete state.heldOutputs;
  const actual=context.state.activity;
  let dot=0,normA=0,normB=0;
  for(let i=0;i<actual.length;i++){dot+=actual[i]*brain.activity[i];normA+=actual[i]*actual[i];normB+=brain.activity[i]*brain.activity[i];}
  const cosine=normA&&normB?dot/Math.sqrt(normA*normB):0;
  return {state,heldOutputs,cosine,historyLength:context.sensorHistory.length};
}

async function main(){
  if(fs.existsSync(output))throw Error('Output directory exists; refusing to overwrite prior evidence.');
  const inputHash=fileHash(input),userSaveHash=fileHash(userSave),baseline=JSON.parse(fs.readFileSync(parentReport,'utf8'));
  if(inputHash!==baseline.inputIntegrity?.inputSha256)throw Error('Input checkpoint hash does not match its recorded parent report.');
  if(userSaveHash!==baseline.inputIntegrity?.userSaveSha256)throw Error('Author save differs from the one recorded by the parent experiment.');
  const P0=require(path.join(root,'outputs/progress-save.js'));
  const appSave=await P0.decode(fs.readFileSync(input,'utf8'),'5.6.0');
  const state=appSave.payload.workers[0].state;
  if(state.generation!==expectedGeneration||state.population!==40||state.circuitId!=='monza'||state.genomes.some(g=>g&&g.adapterVersion!==7))throw Error('Unexpected V3/decoder7 Monza checkpoint.');
  if(state.optimizer.mean.length!==523||state.optimizer.sigma.length!==523)throw Error('Unexpected decoder7 optimizer shape.');
  const originalOptimizer=JSON.parse(JSON.stringify(state.optimizer));
  const {F,P,L,Cuda,sim,simulationPath}=makeRuntime(appSave);
  if(sim.generation!==expectedGeneration||sim.graph.learning.length!==523)throw Error('Restored research runtime mismatch.');
  const startGeneration=sim.generation;let captureTicks=0,selectedContexts=[];
  if(contextsFile){
    const captured=JSON.parse(fs.readFileSync(path.resolve(contextsFile),'utf8'));
    if(captured.inputSha256!==inputHash||JSON.stringify(captured.targets)!==JSON.stringify(targets)||!Array.isArray(captured.contexts)||captured.contexts.length!==targets.length)
      throw Error('Saved real-context set does not match this checkpoint and curriculum.');
    selectedContexts=captured.contexts;
  }else{
    const contexts=new Map(targets.map(target=>[target,[]])),histories=new Map(),sensorRefs=new Map();let lastProgress=performance.now();
    sim.onTrialTick=s=>{
      for(const car of s.cars){
        const ref=sensorRefs.get(car.id);
        if(car.sensorVector&&car.sensorVector!==ref){
          const history=histories.get(car.id)||[];history.push(Array.from(car.sensorVector));
          if(history.length>historyLimit)history.shift();histories.set(car.id,history);sensorRefs.set(car.id,car.sensorVector);
        }
        if(!car.alive)continue;
        for(const target of targets){
          if(car.bestProgress<target||contexts.get(target).some(entry=>entry.carId===car.id))continue;
          const captured=F.capturePracticeState(car);captured.activity=Array.from(captured.activity);
          contexts.get(target).push({carId:car.id,targetProgress:target,capturedProgress:car.bestProgress,
            state:captured,sensorHistory:(histories.get(car.id)||[]).map(values=>values.slice()),
            policyWeights:car.genome.policyWeights.slice(),terminalCar:car});
        }
      }
      if(performance.now()-lastProgress>15000){lastProgress=performance.now();console.log('STATE_CURRICULUM_CAPTURE '+JSON.stringify({generation:s.generation,elapsed:s.elapsed,alive:s.cars.filter(c=>c.alive).length,ticks:captureTicks}));}
    };
    sim.running=true;
    while(sim.generation===startGeneration&&captureTicks++<60000)sim.tick();
    if(sim.generation===startGeneration)throw Error('Natural context-capture generation did not finish.');
    for(const target of targets){
      const choices=contexts.get(target).sort((a,b)=>Number(F.isSafeLearningOutcome(b.terminalCar))-Number(F.isSafeLearningOutcome(a.terminalCar))||b.terminalCar.bestProgress-a.terminalCar.bestProgress);
      const selected=choices[0];if(!selected)throw Error(`No live trajectory reached curriculum context ${target} m.`);
      selected.finalSafe=F.isSafeLearningOutcome(selected.terminalCar);selected.finalProgress=selected.terminalCar.bestProgress;
      selected.reason=selected.terminalCar.reason;selected.sensorCount=selected.sensorHistory.length;delete selected.terminalCar;
      if(selected.sensorCount<8)throw Error(`Insufficient genuine sensor history at ${target} m (${selected.sensorCount}).`);
      selectedContexts.push(selected);
    }
  }
  const baseGenome=state.genomes.find(g=>g?.adapterVersion===7);
  if(!baseGenome)throw Error('Checkpoint has no decoder7 genome for recurrent-state reconstruction.');
  const contextPreflights=selectedContexts.map(context=>{
    const genome=F.cloneGenome(baseGenome);genome.policyWeights=context.policyWeights.slice();
    const reconstructed=rehydrateContext(F,sim.graph,genome,context);
    return {targetProgress:context.targetProgress,historyLength:reconstructed.historyLength,activityCosine:reconstructed.cosine};
  });
  if(contextPreflights.some(item=>item.activityCosine<.7))throw Error(`Recorded sensor history does not reconstruct its own recurrent state closely enough: ${JSON.stringify(contextPreflights)}`);
  fs.mkdirSync(output,{recursive:false});
  fs.writeFileSync(path.join(output,'captured-real-contexts.json'),JSON.stringify({format:'decoder7-real-state-curriculum-v1',inputSha256:inputHash,targets,contexts:selectedContexts},null,2));

  const optimizer=new L.EvolutionStrategy(sim.graph);Object.assign(optimizer,{...originalOptimizer,mean:originalOptimizer.mean.slice(),sigma:originalOptimizer.sigma.slice()});
  const random=F.rng((state.seed^0x6d2b79f5)>>>0);
  let stageResults=[],distribution;
  if(distributionFile){
    if(!stageReportFile)throw Error('--stage-report is required when reusing a saved local ES distribution.');
    distribution=JSON.parse(fs.readFileSync(path.resolve(distributionFile),'utf8'));
    if(JSON.stringify(distribution.originalMean)!==JSON.stringify(originalOptimizer.mean)||JSON.stringify(distribution.originalSigma)!==JSON.stringify(originalOptimizer.sigma)||
       distribution.localMean?.length!==523||distribution.localSigma?.length!==523)throw Error('Saved local ES distribution does not match this checkpoint.');
    const prior=JSON.parse(fs.readFileSync(path.resolve(stageReportFile),'utf8'));stageResults=prior.stageResults;
    if(!Array.isArray(stageResults)||stageResults.length!==targets.length)throw Error('Saved stage report is incomplete.');
    Object.assign(optimizer,{mean:distribution.localMean.slice(),sigma:distribution.localSigma.slice(),updates:stageResults.at(-1).optimizerUpdates,episodes:stageResults.at(-1).optimizerEpisodes});
  }else{
    for(let stage=0;stage<targets.length;stage++){
      const context=selectedContexts[stage],evaluated=[];
      for(let i=0;i<samplesPerStage;i++){
        const genome=F.cloneGenome(baseGenome);genome.policyWeights=optimizer.sample(random,(state.history.at(-1)?.mutationAmount??state.mutation)*.35,state.stagnation);
        const prepared=rehydrateContext(F,sim.graph,genome,context),result=F.evaluatePractice(sim.track,sim.graph,genome,prepared.state,localTicks);
        const agent={...result,fitness:result.fitness,bestProgress:result.progress,progress:result.progress,laps:result.laps,genome,stageIndex:stage,sampleIndex:i};evaluated.push(agent);
      }
      const priorMean=optimizer.mean.slice();optimizer.update(evaluated,F.compareOptimizerAgents);
      const delta=Math.sqrt(optimizer.mean.reduce((sum,value,index)=>sum+(value-priorMean[index])**2,0));
      const ranked=evaluated.slice().sort(F.compareOptimizerAgents),safe=evaluated.filter(item=>item.safe);
      stageResults.push({targetProgress:context.targetProgress,contextCarId:context.carId,contextFinalProgress:context.finalProgress,contextReason:context.reason,
        contextHistoryLength:context.sensorCount,contextActivityReconstructionCosine:contextPreflights[stage].activityCosine,samples:evaluated.length,safe:safe.length,
        bestLocalProgress:ranked[0]?.progress??null,bestLocalSafe:ranked[0]?.safe??false,meanProgress:evaluated.reduce((sum,item)=>sum+item.progress,0)/evaluated.length,
        meanRmsDelta:delta,optimizerUpdates:optimizer.updates,optimizerEpisodes:optimizer.episodes});
      console.log('STATE_CURRICULUM_STAGE '+JSON.stringify(stageResults.at(-1)));
    }
    distribution={originalMean:originalOptimizer.mean,originalSigma:originalOptimizer.sigma,localMean:optimizer.mean,localSigma:optimizer.sigma,
      meanDeltaRms:Math.sqrt(optimizer.mean.reduce((sum,value,index)=>sum+(value-originalOptimizer.mean[index])**2,0)/optimizer.mean.length),
      sigmaDeltaRms:Math.sqrt(optimizer.sigma.reduce((sum,value,index)=>sum+(value-originalOptimizer.sigma[index])**2,0)/optimizer.sigma.length)};
  }
  const distributionPath=path.join(output,'curriculum-distribution.json');fs.writeFileSync(distributionPath,JSON.stringify(distribution,null,2));
  const selectedContextPath=path.join(output,'captured-real-contexts.json');fs.writeFileSync(selectedContextPath,JSON.stringify({format:'decoder7-real-state-curriculum-v1',inputSha256:inputHash,targets,contexts:selectedContexts},null,2));
  const baselineGen=baseline.history.find(item=>item.generation===expectedGeneration+1);
  if(!baselineGen)throw Error('The parent control report does not contain the next natural generation.');
  const naturalBranches=[];
  for(const blend of blendValues){
    const branchRuntime=makeRuntime(appSave),branch=branchRuntime.sim,starting=branch.generation;
    let injected=false,terminalGenerations=[],branchTicks=0,shiftRms=0;
    const standardUpdate=branch.optimizer.update.bind(branch.optimizer);
    branch.optimizer.update=(ranked,compare)=>{
      standardUpdate(ranked,compare);
      if(!injected&&branch.generation===starting){
        let sum=0;
        for(let i=0;i<branch.optimizer.mean.length;i++){
          const delta=optimizer.mean[i]-originalOptimizer.mean[i];branch.optimizer.mean[i]=F.clamp(branch.optimizer.mean[i]+blend*delta,-8,8);
          const scaleDelta=optimizer.sigma[i]-originalOptimizer.sigma[i],limits=branch.graph.learning.scales[i];
          branch.optimizer.sigma[i]=F.clamp(branch.optimizer.sigma[i]+blend*scaleDelta,limits*.5,limits*3);const appliedDelta=blend*delta;sum+=appliedDelta*appliedDelta;
        }
        shiftRms=Math.sqrt(sum/branch.optimizer.mean.length);injected=true;
      }
    };
    branch.onTrialTick=s=>{if(s.cars.every(car=>!car.alive)){
      const cars=s.cars.map(car=>({id:car.id,progress:car.bestProgress,laps:car.laps,fitness:car.fitness,reason:car.reason,safe:F.isSafeLearningOutcome(car)}));
      const safeCars=cars.filter(car=>car.safe);terminalGenerations.push({generation:s.generation,population:cars.length,safeCount:safeCars.length,
        safeFrontier:safeCars.length?Math.max(...safeCars.map(car=>car.progress)):null,rawFrontier:Math.max(...cars.map(car=>car.progress)),maxLaps:Math.max(...cars.map(car=>car.laps)),
        reasonCounts:cars.reduce((counts,car)=>(counts[car.reason]=(counts[car.reason]||0)+1,counts),{})});
    }};
    branch.running=true;
    while(branch.generation<starting+2&&branchTicks++<120000)branch.tick();
    if(branch.generation<starting+2||!injected||terminalGenerations.length!==2)throw Error(`Natural app-flow branch blend ${blend} did not complete both generations.`);
    const first=terminalGenerations.find(item=>item.generation===expectedGeneration),next=terminalGenerations.find(item=>item.generation===expectedGeneration+1);
    if(!first||Math.abs(first.safeFrontier-baseline.history[0].safeProgress)>.001)throw Error(`Generation ${expectedGeneration} differs from the verified control before blend ${blend}.`);
    const savePath=path.join(output,`decoder7-state-curriculum-blend-${String(blend).replace('.','p')}-gen${branch.generation}-research.malecns-save`);
    fs.writeFileSync(savePath,await P.encode(P.fromSimulation(branch),appSave.appVersion));
    const decoded=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0');P.validatePayload(decoded.payload,{graph:branch.graph,circuits:branch.circuits});
    naturalBranches.push({blend,optimizerShiftRms:shiftRms,gen108:first,gen109:next,
      controlGen109:{safeFrontier:baselineGen.safeProgress,safeCount:baselineGen.safeCount,maxLaps:baselineGen.maxLaps},
      outputSave:{path:savePath,sha256:fileHash(savePath),validated:true},ticks:branchTicks});
    console.log('STATE_CURRICULUM_APP_BRANCH '+JSON.stringify(naturalBranches.at(-1)));
  }
  const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
  if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 execution without CPU fallback.');
  const report={variant:'decoder7-four-stage-real-state-distribution-curriculum-app-flow-ab',appVersion:appSave.appVersion,policy:{version:sim.graph.learning.version,parameters:sim.graph.learning.length},
    settings:{circuitId:state.circuitId,seed:state.seed,startingGeneration:state.generation,population:state.population,mutation:state.mutation,targets,samplesPerStage,localTicks,historyLimit,blendValues},
    inputIntegrity:{inputUnchanged:fileHash(input)===inputHash,inputSha256:inputHash,userSaveUnchanged:fileHash(userSave)===userSaveHash,userSaveSha256:userSaveHash},
    captureGeneration:{generation:startGeneration,completedNaturally:true,source:contextsFile?'previously captured from a natural simulator trajectory':'captured during this run',ticks:contextsFile?null:captureTicks},
    reusedEvidence:contextsFile?{contextsPath:path.resolve(contextsFile),contextsSha256:fileHash(path.resolve(contextsFile)),
      ...(stageReportFile?{stageReportPath:path.resolve(stageReportFile),stageReportSha256:fileHash(path.resolve(stageReportFile))}:{})}:null,
    stageResults,localDistribution:{path:distributionPath,sha256:fileHash(distributionPath),meanDeltaRms:distribution.meanDeltaRms,sigmaDeltaRms:distribution.sigmaDeltaRms},
    naturalAppFlowBranches:naturalBranches,
    decision:naturalBranches.some(item=>item.gen109.maxLaps>=2&&item.gen109.safeFrontier>item.controlGen109.safeFrontier)?'candidate-improves-safe-frontier-and-completes-two-laps':'candidate-not-promoted',
    gpu,gpuIdentity,sourceSha256:{simulation:fileHash(simulationPath),learning:fileHash(path.join(root,'outputs/neural-learning.js')),
      progress:fileHash(path.join(root,'outputs/progress-save.js')),rewards:fileHash(path.join(root,'outputs/rewards.js')),
      vehicle:fileHash(path.join(root,'outputs/vehicle-992.js')),dense:fileHash(path.join(root,'outputs/dense-neural.js')),
      decoder6:fileHash(path.join(root,'work/decoder6-model.cjs')),decoder7:fileHash(path.join(root,'work/decoder7-model.cjs')),
      runner:fileHash(__filename)},baseline:{reportSha256:fileHash(parentReport),safeFrontier:baseline.history.at(-1).safeProgress,maxLaps:baseline.history.at(-1).maxLaps},
    limits:'Un solo seed/checkpoint/circuito. Curriculum di ricerca da stati ricorrenti ricostruiti su sensori reali; la validazione nel flusso naturale app copre una sola generazione successiva e non dimostra generalizzazione.'};
  const reportPath=path.join(output,'decoder7-state-curriculum-report.json');fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log('STATE_CURRICULUM_DONE '+JSON.stringify({decision:report.decision,stages:stageResults,naturalAppFlowBranches:naturalBranches,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,report:reportPath}));
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
