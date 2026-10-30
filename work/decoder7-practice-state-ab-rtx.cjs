'use strict';

// Isolated decoder7 continuation using the current application simulator,
// save validator, reward module, and neural runtime. The adapter below rebuilds
// the exact 64-neuron decoder6 base on the current v3 implementation.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const simulationPath=path.join(root,'outputs/simulation.js');
const fitnessBandArg=process.argv.find(value=>value.startsWith('--fitness-band='));
const fitnessBandMeters=fitnessBandArg?Number(fitnessBandArg.slice('--fitness-band='.length)):0;
const steeringGainArg=process.argv.find(value=>value.startsWith('--steering-gain='));
const steeringGain=steeringGainArg?Number(steeringGainArg.slice('--steering-gain='.length)):1;
if(!Number.isFinite(steeringGain)||steeringGain<=0||steeringGain>12)throw Error('Steering gain must be in (0, 12].');
const localSteerBiasArg=process.argv.find(value=>value.startsWith('--local-steer-bias='));
const localSteerBias=localSteerBiasArg?Number(localSteerBiasArg.slice('--local-steer-bias='.length)):0;
const localSteerFromArg=process.argv.find(value=>value.startsWith('--local-steer-from='));
const localSteerFrom=localSteerFromArg?Number(localSteerFromArg.slice('--local-steer-from='.length)):Infinity;
if(!Number.isFinite(localSteerBias)||Math.abs(localSteerBias)>.5||(!Number.isFinite(localSteerFrom)&&localSteerFrom!==Infinity))throw Error('Invalid local steering diagnostic settings.');
const localBrakeScaleArg=process.argv.find(value=>value.startsWith('--local-brake-scale='));
const localBrakeScale=localBrakeScaleArg?Number(localBrakeScaleArg.slice('--local-brake-scale='.length)):1;
if(!Number.isFinite(localBrakeScale)||localBrakeScale<0||localBrakeScale>2)throw Error('Local brake scale must be between 0 and 2.');
const contextSteerDeltaArg=process.argv.find(value=>value.startsWith('--neural-context-steer-delta='));
const contextSteerDelta=contextSteerDeltaArg?Number(contextSteerDeltaArg.slice('--neural-context-steer-delta='.length)):0;
const contextSteerTargetArg=process.argv.find(value=>value.startsWith('--neural-context-steer-target='));
const contextSteerTarget=contextSteerTargetArg?Number(contextSteerTargetArg.slice('--neural-context-steer-target='.length)):780;
if(!Number.isFinite(contextSteerDelta)||Math.abs(contextSteerDelta)>.1||!Number.isFinite(contextSteerTarget)||contextSteerTarget<=0)throw Error('Invalid neural-context steering diagnostic settings.');
let steeringGateActive=false;
let simulationRuntimeSource=fs.readFileSync(simulationPath,'utf8');
const generalizedActionReadoutCrossover=process.argv.includes('--generalized-action-readout-crossover');
if(generalizedActionReadoutCrossover){
  const legacy=`    const steering=pick();\n    for(let j=0;j<policy.nodes.length;j++)weights[policy.readoutOffset+j*2]=steering[policy.readoutOffset+j*2];\n    weights[weights.length-2]=steering[weights.length-2];\n    const longitudinal=pick();\n    for(let j=0;j<policy.nodes.length;j++)weights[policy.readoutOffset+j*2+1]=longitudinal[policy.readoutOffset+j*2+1];\n    weights[weights.length-1]=longitudinal[weights.length-1];`;
  const generalized=`    const actionCount=policy.actionCount??2,featureCount=policy.featureCount??policy.nodes.length,stride=policy.readoutStride??2,biasOffset=policy.biasOffset??weights.length-actionCount;\n    for(let action=0;action<actionCount;action++){const source=pick();for(let feature=0;feature<featureCount;feature++){const index=policy.readoutOffset+feature*stride+action;weights[index]=source[index];}weights[biasOffset+action]=source[biasOffset+action];}`;
  if(simulationRuntimeSource.split(legacy).length!==2)throw Error('Expected exactly one legacy action-readout crossover block.');
  simulationRuntimeSource=simulationRuntimeSource.replace(legacy,generalized);
}
const retainLivePracticeSnapshots=process.argv.includes('--retain-live-practice-snapshots');
if(retainLivePracticeSnapshots){
  const terminalCapture='for(const parent of learningRanked.slice(0,practiceEliteBudget))parent.practiceState=capturePracticeState(parent);';
  const liveOnlyCapture='for(const parent of learningRanked.slice(0,practiceEliteBudget))if(parent.alive&&!parent.practiceState)parent.practiceState=capturePracticeState(parent);';
  if(simulationRuntimeSource.split(terminalCapture).length!==2)throw Error('Expected exactly one terminal practice-state overwrite.');
  simulationRuntimeSource=simulationRuntimeSource.replace(terminalCapture,liveOnlyCapture);
}const refreshLivePracticeSnapshots=process.argv.includes('--refresh-live-practice-snapshots');
if(refreshLivePracticeSnapshots){
  if(simulationRuntimeSource.split('!car.practiceState&&').length!==2)throw Error('Expected exactly one first-live-state capture guard.');
  simulationRuntimeSource=simulationRuntimeSource.replace('!car.practiceState&&','');
}const optimizerSampleRateArg=process.argv.find(value=>value.startsWith('--optimizer-sample-rate='));
const optimizerSampleRate=optimizerSampleRateArg?Number(optimizerSampleRateArg.slice('--optimizer-sample-rate='.length)):.1;
if(!Number.isFinite(optimizerSampleRate)||optimizerSampleRate<.1||optimizerSampleRate>.75)throw Error('Optimizer sample rate must be between 0.1 and 0.75.');
if(optimizerSampleRate!==.1){
  const baseline='Math.floor(this.population*.1)';
  if(simulationRuntimeSource.split(baseline).length!==2)throw Error('Expected exactly one baseline optimizer sample-rate expression.');
  simulationRuntimeSource=simulationRuntimeSource.replace(baseline,`Math.floor(this.population*${optimizerSampleRate})`);
}
const antitheticOptimizerSamples=process.argv.includes('--antithetic-optimizer-samples');
if(antitheticOptimizerSamples){
  const sampleCall='child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);';
  if(simulationRuntimeSource.split(sampleCall).length!==3)throw Error('Expected exactly two optimizer sampling call sites.');
  simulationRuntimeSource=simulationRuntimeSource.replaceAll(sampleCall,'child.policyWeights=sampleOptimizerWeights(this.optimizer,this.random,mutationAmount*.35,this.stagnation);');
  const helperAnchor='const optimizerSampleTarget=usesLearningOutcome&&baseMutation>0&&!noSafeLearningCandidate';
  if(simulationRuntimeSource.split(helperAnchor).length!==2)throw Error('Expected exactly one per-generation optimizer sample target.');
  const helper=`let pendingOptimizerSample=null,optimizerSampleCalls=0,optimizerSamplePairs=0;
       const sampleOptimizerWeights=(optimizer,random,amount,stagnation)=>{
         optimizerSampleCalls++;
         const fresh=optimizer.sample(random,amount,stagnation);
         if(pendingOptimizerSample){const paired=optimizer.sample(random,amount,stagnation,pendingOptimizerSample);pendingOptimizerSample=null;optimizerSamplePairs++;return paired;}
         pendingOptimizerSample=fresh.slice();return fresh;
       };
       `;
  simulationRuntimeSource=simulationRuntimeSource.replace(helperAnchor,helper+helperAnchor);
  const generationAnchor='this.generation++;this.spawn(genomes,false,optimizerSampleIdsForNext);';
  if(simulationRuntimeSource.split(generationAnchor).length!==2)throw Error('Expected exactly one generation spawn point.');
  simulationRuntimeSource=simulationRuntimeSource.replace(generationAnchor,`this.lastOptimizerPairStats={calls:optimizerSampleCalls,pairs:optimizerSamplePairs,unpaired:pendingOptimizerSample?1:0};${generationAnchor}`);
}
const optimizerFrontierAnchorArg=process.argv.find(value=>value.startsWith('--optimizer-frontier-anchor='));
const optimizerFrontierAnchorRate=optimizerFrontierAnchorArg?Number(optimizerFrontierAnchorArg.slice('--optimizer-frontier-anchor='.length)):0;
if(!Number.isFinite(optimizerFrontierAnchorRate)||optimizerFrontierAnchorRate<0||optimizerFrontierAnchorRate>.9)throw Error('Optimizer frontier-anchor rate must be between 0 and 0.9.');
if(optimizerFrontierAnchorRate>0){
  const baseline='if(this.mutation>0&&!noSafeLearningCandidate)this.optimizer?.update(optimizerRanked,usesLearningOutcome?compareOptimizerAgents:undefined);';
  if(simulationRuntimeSource.split(baseline).length!==2)throw Error('Expected exactly one optimizer-update expression for the frontier-anchor overlay.');
  const anchor=`if(this.mutation>0&&!noSafeLearningCandidate)this.optimizer?.update(optimizerRanked,usesLearningOutcome?compareOptimizerAgents:undefined);\n      if(usesLearningOutcome&&safeProgressLeader?.genome?.policyWeights){const rate=${optimizerFrontierAnchorRate};for(let i=0;i<this.optimizer.mean.length;i++)this.optimizer.mean[i]=this.optimizer.mean[i]*(1-rate)+safeProgressLeader.genome.policyWeights[i]*rate;}`;
  simulationRuntimeSource=simulationRuntimeSource.replace(baseline,anchor);
}
const frontierMarginArg=process.argv.find(value=>value.startsWith('--safe-frontier-margin='));
const safeFrontierMarginOverride=frontierMarginArg?Number(frontierMarginArg.slice('--safe-frontier-margin='.length)):null;
if(safeFrontierMarginOverride!==null&&(!Number.isFinite(safeFrontierMarginOverride)||safeFrontierMarginOverride<=0||safeFrontierMarginOverride>2.5))throw Error('Safe frontier margin override must be in (0, 2.5].');
if(safeFrontierMarginOverride!==null){
  const currentTolerance='Math.max(this.track.pixelsPerMeter||1,this.track.total*.0005)';
  if(simulationRuntimeSource.split(currentTolerance).length!==4)throw Error('Expected exactly three safe-frontier tolerance expressions for the research overlay.');
  simulationRuntimeSource=simulationRuntimeSource.replaceAll(currentTolerance,String(safeFrontierMarginOverride));
}
const preserveExplorationAge=process.argv.includes('--preserve-exploration-age');
const researchSearchAgeArg=process.argv.find(value=>value.startsWith('--research-search-age='));
const researchSearchAgeOverride=researchSearchAgeArg?Number(researchSearchAgeArg.slice('--research-search-age='.length)):null;
if(researchSearchAgeOverride!==null&&(!Number.isInteger(researchSearchAgeOverride)||researchSearchAgeOverride<0||researchSearchAgeOverride>100000))throw Error('Research exploration age must be a nonnegative integer.');
if(preserveExplorationAge&&safeFrontierMarginOverride===null)throw Error('Preserved exploration age requires the safe-frontier threshold research overlay.');
if(!preserveExplorationAge&&researchSearchAgeOverride!==null)throw Error('Research exploration age override requires --preserve-exploration-age.');
if(preserveExplorationAge){
  const originalAgeReferences=simulationRuntimeSource.split('this.stagnation').length-1;
  if(originalAgeReferences!==20)throw Error(`Expected 20 simulator stagnation references; found ${originalAgeReferences}.`);
  simulationRuntimeSource=simulationRuntimeSource.replaceAll('this.stagnation','this.researchExplorationAge');
  const initializers='this.hallOfFame=[];this.researchExplorationAge=0;';
  if(simulationRuntimeSource.split(initializers).length!==3)throw Error('Expected constructor and reset exploration-age initializers.');
  simulationRuntimeSource=simulationRuntimeSource.replaceAll(initializers,'this.hallOfFame=[];this.stagnation=0;this.researchExplorationAge=0;');
  const generationUpdate='this.researchExplorationAge=drivingImproved?0:this.researchExplorationAge+1;';
  if(simulationRuntimeSource.split(generationUpdate).length!==2)throw Error('Expected exactly one generation stagnation update.');
  simulationRuntimeSource=simulationRuntimeSource.replace(generationUpdate,'this.stagnation=drivingImproved?0:this.stagnation+1;this.researchExplorationAge++;');
  const historyField='stagnation:this.researchExplorationAge';
  if(simulationRuntimeSource.split(historyField).length!==2)throw Error('Expected exactly one stagnation history field.');
  simulationRuntimeSource=simulationRuntimeSource.replace(historyField,'stagnation:this.stagnation');
}
if(fitnessBandMeters>0){
  const current='if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;';
  if(!simulationRuntimeSource.includes(current))throw Error('Expected safe-progress comparator was not found for the fitness-band overlay.');
  const replacement=`if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9){const band=${fitnessBandMeters};if(Math.abs(aProgress-bProgress)>band)return bProgress-aProgress;const bandAFitness=Number.isFinite(a?.fitness)?a.fitness:-Infinity,bandBFitness=Number.isFinite(b?.fitness)?b.fitness:-Infinity;if(bandAFitness!==bandBFitness)return bandBFitness-bandAFitness;return bProgress-aProgress;}`;
  simulationRuntimeSource=simulationRuntimeSource.replace(current,replacement);
}
const simulationModule=new Module(simulationPath,module);
simulationModule.filename=simulationPath;simulationModule.paths=Module._nodeModulePaths(path.dirname(simulationPath));
simulationModule._compile(simulationRuntimeSource,simulationPath);
const F=simulationModule.exports;
const P=require(path.join(root,'outputs/progress-save.js'));
const L=require(path.join(root,'outputs/neural-learning.js'));
const Legacy=require(path.join(root,'outputs/legacy-models.js'));
const Dense=require(path.join(root,'outputs/dense-neural.js'));
const D6=require('./decoder6-model.cjs');
const D7=require('./decoder7-model.cjs');
const D8=require('./decoder8-temporal-model.cjs');
const Rewards=require(path.join(root,'outputs/rewards.js'));
const arg=(key,fallback)=>{const item=process.argv.find(value=>value.startsWith(`${key}=`));return item?item.slice(key.length+1):fallback;};
const riskRepairRate=Number(arg('--risk-repair-rate','0.06'));
if(!Number.isFinite(riskRepairRate)||riskRepairRate<0||riskRepairRate>.25)throw Error('Risk-repair offspring rate must be between 0 and 0.25.');
const populationOverride=Number(arg('--population','40'));
if(!Number.isInteger(populationOverride)||populationOverride<4||populationOverride>100)throw Error('Population override must be an integer from 4 to 100.');
const expectedStartingGeneration=Number(arg('--generation','76'));
const input=path.resolve(arg('--input',path.join(root,'.impeccable/review/decoder7/joint-mutation-ab-rtx-20261028/control-gen76-result.malecns-save')));
const controlReport=path.resolve(arg('--parent-report',path.join(root,'.impeccable/review/decoder7/joint-mutation-ab-rtx-20261028/control-result.json')));
const output=path.resolve(arg('--output',path.join(root,'.impeccable/review/decoder7/main-runtime-gen76-rtx-20261028')));
const userSave='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const fileHash=file=>sha256(fs.readFileSync(file));
const sameArray=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);

function installMainCompatibleDecoder6(){
  const originalBuild=L.build;
  L.build=function(graph){
    const config=graph.policyConfig;
    if(config?.version!==6)return originalBuild(graph);
    // The current engine builds the same reduced V3 64-neuron linear readout
    // when no profile override is present. Expand it exactly as the isolated
    // decoder6 builder did, then let decoder7 add its separate brake head.
    graph.policyConfig=null;
    let base;
    try{base=originalBuild(graph);}finally{graph.policyConfig=config;}
    const n=base.nodes.length,featureCount=n*2,readoutOffset=base.readoutOffset;
    if(base.version!==3||n!==64||base.length!==202)throw Error('Current V3 base policy no longer matches decoder6 assumptions.');
    const thresholdOffset=readoutOffset+featureCount*2,length=thresholdOffset+n+2;
    const mean=Array(length).fill(0),scales=Array(length).fill(.1);
    for(let i=0;i<readoutOffset;i++){mean[i]=base.mean[i];scales[i]=base.scales[i];}
    for(let j=0;j<n;j++){
      mean[readoutOffset+j*2]=base.mean[readoutOffset+j*2];
      mean[readoutOffset+j*2+1]=base.mean[readoutOffset+j*2+1];
    }
    for(let j=0;j<featureCount;j++){
      scales[readoutOffset+j*2]=j<n?.08:.05;
      scales[readoutOffset+j*2+1]=j<n?.2:.1;
    }
    for(let j=0;j<n;j++)scales[thresholdOffset+j]=.03;
    mean[length-2]=base.mean[base.length-2];mean[length-1]=base.mean[base.length-1];
    scales[length-2]=base.scales[base.length-2];scales[length-1]=base.scales[base.length-1];
    const policy={...base,version:6,featureCount,featureNorm:1/Math.sqrt(n),thresholdOffset,nonlinear:true,readoutStride:2,length,mean,scales};
    graph.learning=policy;return policy;
  };
  return ()=>{L.build=originalBuild;};
}

async function main(){
  if(fs.existsSync(output))throw Error('Output directory exists; refusing to overwrite earlier evidence.');
  const inputHash=fileHash(input),userSaveHash=fileHash(userSave);
  const recorded=JSON.parse(fs.readFileSync(controlReport,'utf8'));
  if(inputHash!==recorded.outputSave.sha256)throw Error('Input checkpoint hash differs from the recorded control result.');
  const appSave=await P.decode(fs.readFileSync(input,'utf8'),'5.6.0');
  const useTemporalDecoder=process.argv.includes('--temporal-readout');
  let state=appSave.payload.workers[0].state;
  const expectedAdapterVersion=useTemporalDecoder?8:7;
  if(state.generation!==expectedStartingGeneration||state.population<4||state.population>100||state.circuitId!=='monza'||state.rewardRevision!==Rewards.REVISION||state.genomes.some(g=>g!==null&&g.adapterVersion!==expectedAdapterVersion))throw Error(`Unexpected decoder${expectedAdapterVersion} continuation checkpoint.`);

  const restoreBuild=installMainCompatibleDecoder6();
  const uninstallDecoder7=D7.install(L);
  const uninstallDecoder8=useTemporalDecoder?D8.install(L):()=>{};
  const defaultD7Commands=L.commands;
  const signedMotorDecoder=process.argv.includes('--signed-motor-decoder');
  const riskRepairEnabled=process.argv.includes('--risk-repair');
  if(signedMotorDecoder||steeringGain!==1||localSteerBias!==0||localBrakeScale!==1)L.commands=(graph,...args)=>{
    const commands=signedMotorDecoder?D7.signedCommands(L,graph,...args,defaultD7Commands):defaultD7Commands(graph,...args);
    if(steeringGain!==1)commands[0]=Math.max(-1,Math.min(1,commands[0]*steeringGain));
    if(steeringGateActive){
      if(localSteerBias!==0)commands[0]=Math.max(-1,Math.min(1,commands[0]+localSteerBias));
      if(localBrakeScale!==1)commands[2]=Math.max(0,Math.min(1,commands[2]*localBrakeScale));
    }
    return commands;
  };
  const originalSafeMotorMutation=L.safeMotorMutation;
  const focusCombinedOverride=process.argv.includes('--focus-combined');
  const focusSteeringOverride=process.argv.includes('--focus-steering');
  const contextMutation=process.argv.includes('--context-mutation');
  const mutationFocusAudit={calls:0,changedByAction:[0,0,0],nonActionChanges:0,contextCalls:0,contextAwareCalls:0,contextFallbackCalls:0,contextCentresSeen:0,maxContextCentres:0};
  const applyRequestedFocus=focus=>focusSteeringOverride?'steering':focusCombinedOverride?'combined':focus;
  const recordFocusedMutation=(graph,before,after)=>{
    mutationFocusAudit.calls++;
    const p=graph.learning;
    for(let i=0;i<after.length;i++)if(after[i]!==before[i]){
      let action=-1;
      if(i>=p.readoutOffset&&i<p.thresholdOffset)action=(i-p.readoutOffset)%p.readoutStride;
      else if(i>=p.biasOffset&&i<p.biasOffset+3)action=i-p.biasOffset;
      if(action>=0&&action<3)mutationFocusAudit.changedByAction[action]++;
      else mutationFocusAudit.nonActionChanges++;
    }
  };
  if(contextMutation)L.safeMotorMutation=(graph,values,r,amount,experience,focus)=>{
    const centreCount=experience?.centres?.filter(c=>c.values?.length===graph.learning.featureCount&&c.values.every(Number.isFinite)&&c.count>0).length||0;
    mutationFocusAudit.contextCalls++;mutationFocusAudit.contextCentresSeen+=centreCount;
    mutationFocusAudit.maxContextCentres=Math.max(mutationFocusAudit.maxContextCentres,centreCount);
    if(centreCount)mutationFocusAudit.contextAwareCalls++;else mutationFocusAudit.contextFallbackCalls++;
    const next=D7.contextSafeMotorMutation(graph,values,r,amount,experience,applyRequestedFocus(focus));
    if(focusSteeringOverride||focusCombinedOverride)recordFocusedMutation(graph,values,next);
    return next;
  };
  else if(focusCombinedOverride||focusSteeringOverride)L.safeMotorMutation=(graph,values,r,amount,experience,focus)=>{
    const next=originalSafeMotorMutation(graph,values,r,amount,experience,applyRequestedFocus(focus));
    recordFocusedMutation(graph,values,next);
    return next;
  };
  let Cuda=null,originalDenseStep=null,outputCreated=false;
  const started=performance.now();
  try{
    const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
    const model=Legacy.tagV3(source);
    model.policyConfig={...(useTemporalDecoder?D8.POLICY:D7.POLICY)};
    model.modelLabel=useTemporalDecoder?'V3 · decoder 8 temporale sperimentale':'V3 · decoder 7 sperimentale, runtime app corrente';
    const circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
    const sim=new F.Simulation(model,{modelId:'v3',population:state.population,circuitId:state.circuitId,circuits,riskRepairEnabled,riskRepairOffspringRate:riskRepairRate});

    // Prove node identity and initialization against the exact decoder6
    // experiment used to migrate the checkpoint before spending GPU time.
    const oldGraph=D6.F.compileGraph(D6.model(source));
    const oldPolicy=D6.F.ensureLearning(oldGraph);
    const decoder7Policy=D7.expand(oldPolicy),expected=useTemporalDecoder?D8.expand(decoder7Policy):decoder7Policy,actual=sim.graph.learning;
    if(!sameArray(Array.from(actual.nodes),Array.from(expected.nodes))||
       !sameArray(actual.mean,expected.mean)||!sameArray(actual.scales,expected.scales))
      throw Error('Decoder7 migration base does not exactly match the checkpoint readout/optimizer initialization.');
    if(useTemporalDecoder&&appSave.payload.graph.policyVersion!==8){
      appSave.payload=D8.migratePayload(appSave.payload,decoder7Policy,actual,sim.graph,P);
      state=appSave.payload.workers[0].state;
    }
    P.validatePayload(appSave.payload,{graph:sim.graph,circuits:sim.circuits});
    P.restore(sim,state);
    let populationExpansion={original:sim.population,target:populationOverride,added:0,mutationFocus:'combined action heads'};
    if(populationOverride!==sim.population){
      if(populationOverride<sim.cars.length)throw Error('Population override cannot discard restored genomes.');
      const sourceGenomes=sim.cars.map(car=>F.cloneGenome(car.genome)),expanded=sourceGenomes.slice();
      while(expanded.length<populationOverride){
        const source=sourceGenomes[Math.floor(sim.random()*sourceGenomes.length)];let child=F.cloneGenome(source);
        if(child.policyWeights)child.policyWeights=L.safeMotorMutation(sim.graph,child.policyWeights,sim.random,sim.mutation,null,'combined');
        else child=F.mutateGenome(child,sim.random,sim.mutation);
        expanded.push(child);
      }
      populationExpansion.added=expanded.length-sourceGenomes.length;sim.population=populationOverride;sim.spawn(expanded,false,[]);
    }
    if(preserveExplorationAge)sim.researchExplorationAge=researchSearchAgeOverride??sim.stagnation;
    if(sim.safeLearningFrontier.progress<0||sim.generation!==expectedStartingGeneration)throw Error('Restored safe frontier or generation is invalid.');
    if(process.argv.includes('--preflight')){
      const transferredInitial=D7.transfer(oldPolicy.mean,oldPolicy,decoder7Policy),preflightBrain=F.makeBrain(sim.graph),decoder7Graph={...sim.graph,learning:decoder7Policy};
      for(let index=0;index<actual.nodes.length;index++)preflightBrain.activity[actual.nodes[index]]=Math.sin(index*1.13)*.2;
      const initialDefault=defaultD7Commands(decoder7Graph,preflightBrain,{adapterVersion:7,policyWeights:transferredInitial},true,true);
      const initialSigned=D7.signedCommands(L,decoder7Graph,preflightBrain,{adapterVersion:7,policyWeights:transferredInitial},true,true,defaultD7Commands);
      const signedDecoderInitializationEquivalent=initialDefault.every((value,index)=>Math.abs(value-initialSigned[index])<1e-12)&&Math.min(initialSigned[1],initialSigned[2])===0;
      if(!signedDecoderInitializationEquivalent)throw Error('Signed longitudinal decoder does not preserve the initial V6→V7 transfer.');
      const temporalWeights=useTemporalDecoder?D8.transfer(transferredInitial,decoder7Policy,actual):null;
      const temporalOutput=useTemporalDecoder?L.commands(sim.graph,preflightBrain,{adapterVersion:8,policyWeights:temporalWeights},true,true):initialDefault;
      const temporalDecoderInitializationEquivalent=initialDefault.every((value,index)=>Math.abs(value-temporalOutput[index])<1e-12);
      if(useTemporalDecoder&&!temporalDecoderInitializationEquivalent)throw Error('Decoder 8 initialization does not preserve decoder7 outputs.');
      const fitnessBandComparatorChecks=fitnessBandMeters>0?{
        fitnessWithinBand:F.compareLearningAgents({reason:'troppo lenta / senza progresso',laps:0,bestProgress:795,fitness:-5000},{reason:'troppo lenta / senza progresso',laps:0,bestProgress:790,fitness:-4500})>0,
        progressOutsideBand:F.compareLearningAgents({reason:'troppo lenta / senza progresso',laps:0,bestProgress:795,fitness:-5000},{reason:'troppo lenta / senza progresso',laps:0,bestProgress:760,fitness:-2000})<0,
        safetyPrecedesBand:F.compareLearningAgents({reason:'troppo lenta / senza progresso',laps:0,bestProgress:795,fitness:-5000},{reason:'urto',laps:0,bestProgress:999,fitness:10000})<0}:null;
      if(fitnessBandComparatorChecks&&Object.values(fitnessBandComparatorChecks).some(value=>!value))throw Error('Fitness-band comparator preflight failed.');
      console.log('DECODER7_MAIN_PREFLIGHT '+JSON.stringify({checkpointValid:true,generation:sim.generation,population:sim.population,
        rewardRevision:sim.rewardRevision,policyVersion:actual.version,parameters:actual.length,
        decoder6NodeIdentityExact:sameArray(Array.from(actual.nodes),Array.from(expected.nodes)),
        decoder6MeanExact:sameArray(actual.mean,expected.mean),decoder6ScaleExact:sameArray(actual.scales,expected.scales),
        signedDecoderInitializationEquivalent,temporalDecoderInitializationEquivalent,signedMotorDecoder,useTemporalDecoder,riskRepairEnabled,riskRepairOffspringRate:riskRepairRate,populationExpansion,steeringGain,optimizerSampleRate,optimizerFrontierAnchorRate,safeFrontier:sim.safeLearningFrontier.progress,fitnessBandMeters:fitnessBandMeters||null,fitnessBandComparatorChecks,inputSha256:inputHash,userSaveSha256:userSaveHash,
        safeFrontierMarginOverrideMeters:safeFrontierMarginOverride,preserveExplorationAge,researchExplorationAgeStart:preserveExplorationAge?sim.researchExplorationAge:null,actualStagnationStart:sim.stagnation,
        runtimeSha256:fileHash(simulationPath),runtimeOverlaySha256:sha256(simulationRuntimeSource)}));
      return;
    }
    if(process.argv.includes('--replay-frontier')){
      const candidates=[...sim.hallOfFame.map(entry=>({...entry,source:'hall-of-fame'})),
        ...(sim.champion&&sim.championStats?[{...sim.championStats,genome:sim.champion,source:'champion'}]:[])]
        .filter(entry=>entry.genome?.adapterVersion===expectedAdapterVersion&&Number.isFinite(entry.bestProgress))
        .sort((a,b)=>(Number(b.laps)||0)-(Number(a.laps)||0)||b.bestProgress-a.bestProgress);
      const candidate=candidates[0];
      if(!candidate||candidate.bestProgress+1e-6<sim.safeLearningFrontier.progress)throw Error('No archived genome matches the restored safe frontier.');
      const restoredSafeFrontier=sim.safeLearningFrontier.progress;
      sim.population=1;sim.mutation=0;sim.spawn([candidate.genome]);sim.running=true;
      fs.mkdirSync(output,{recursive:false});outputCreated=true;
      Cuda=require(path.join(root,'work/cuda-exact-v3-runtime.cjs'));
      originalDenseStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
      const trace=[],contextAnchorProgress=[100,300,500,600,650,680,700,720,740,760,770,775],contextAnchors=new Map();let contextTarget=null,terminal=null,terminalCar=null,ticks=0,lastProgress=performance.now();
      const position=F.locate(sim.track,sim.cars[0].x,sim.cars[0].y);
      const initialCarKeys=Object.keys(sim.cars[0]);
      const readoutAttribution=car=>{
        const p=sim.graph.learning,weights=car.genome?.policyWeights,features=car.brain?.policyFeatures;
        if(!p||!Array.isArray(weights)||!features||features.length!==p.featureCount)return null;
        const n=p.nodes.length,sums=Array.from({length:3},()=>({linear:0,thresholded:0,temporalLinear:0,temporalThresholded:0})),balance=[{positive:0,negative:0,absolute:0},{positive:0,negative:0,absolute:0},{positive:0,negative:0,absolute:0}],terms=[[],[],[]];
        for(let j=0;j<features.length;j++){
          const baseFeature=j>=(p.temporalOffset??Infinity)?j-p.temporalOffset:j,temporal=j>=(p.temporalOffset??Infinity),actionOffset=p.readoutOffset+j*p.readoutStride,
            branch=temporal?(baseFeature<n?'temporalLinear':'temporalThresholded'):(baseFeature<n?'linear':'thresholded'),neuron=baseFeature%n;
          for(let action=0;action<3;action++){
            const coefficient=weights[actionOffset+action],contribution=features[j]*coefficient*p.featureNorm;
            sums[action][branch]+=contribution;
            if(contribution>0)balance[action].positive+=contribution;else balance[action].negative+=contribution;
            balance[action].absolute+=Math.abs(contribution);
            terms[action].push({feature:j,neuron:sim.graph.bodyIds[p.nodes[neuron]],branch,value:+features[j].toFixed(5),coefficient:+coefficient.toFixed(5),contribution:+contribution.toFixed(7)});
          }
        }
        const bias=weights.slice(p.biasOffset,p.biasOffset+3),logits=sums.map((x,i)=>x.linear+x.thresholded+x.temporalLinear+x.temporalThresholded+bias[i]);
        const predicted=p.version===8
          ?[Math.tanh(logits[0]),Math.max(0,Math.tanh(logits[1])),Math.max(0,Math.tanh(logits[2]))]
          :logits.map(Math.tanh);
        const balanceReport=balance.map(x=>({positive:+x.positive.toFixed(7),negative:+x.negative.toFixed(7),absolute:+x.absolute.toFixed(7),net:+(x.positive+x.negative).toFixed(7),cancellation:x.absolute?+(1-Math.abs(x.positive+x.negative)/x.absolute).toFixed(5):0}));
        return{policyVersion:p.version,featureNorm:p.featureNorm,linearThresholdedSums:sums,contributionBalance:balanceReport,bias: bias.map(x=>+x.toFixed(7)),logits:logits.map(x=>+x.toFixed(7)),predicted,actual:car.slowOutputs?.slice()||null,
          maxDescendingActivity:Math.max(...Array.from(p.nodes,index=>Math.abs(car.brain.activity[index]||0))),
          topContributions:terms.map(list=>list.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,8))};
      };      const snapshot=car=>{
        const loc=F.locate(sim.track,car.x,car.y);
        const segment=sim.track.segments.find(item=>loc.along>=item.start&&loc.along<item.start+item.length)||sim.track.segments.at(-1);
        const tangent=segment?Math.atan2(segment.b.y-segment.a.y,segment.b.x-segment.a.x):null;
        const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
        return{seconds:+car.lifetime.toFixed(3),progress:+car.bestProgress.toFixed(3),speedKmh:+((car.vehicle?.speedMps??car.speed/(car.pixelsPerMeter||1))*3.6).toFixed(2),
          steering:+(car.slowOutputs?.[0]||0).toFixed(4),throttle:+(car.slowOutputs?.[1]||0).toFixed(4),brake:+(car.slowOutputs?.[2]||0).toFixed(4),
          neuralRawOutputs:car.slowOutputs?.slice()||null,effectiveNormalizedOutputs:car.outputs?.slice()||null,
          gear:car.vehicle?.gear??null,rpm:car.vehicle?.rpm??null,yawRate:+(car.yawRate||0).toFixed(4),longitudinalG:+(car.longitudinalG||0).toFixed(3),lateralG:+(car.lateralG||0).toFixed(3),
          slipAngle:+(car.slipAngle||0).toFixed(4),position:{x:+car.x.toFixed(2),y:+car.y.toFixed(2),heading:+car.heading.toFixed(4),along:+(loc.along??0).toFixed(2),distance:+(loc.distance??0).toFixed(2)},
          trackGeometry:{signedCrossTrackOffset:segment?+(((segment.b.x-segment.a.x)*(car.y-loc.y)-(segment.b.y-segment.a.y)*(car.x-loc.x))/Math.max(1e-9,segment.length)).toFixed(3):null,
            headingError:tangent===null?null:+angleDelta(car.heading,tangent).toFixed(4),halfWidth:sim.track.halfWidth,width:F.trackWidthAt(sim.track,loc.along),onRoad:F.onRoad(sim.track,car.x,car.y)},
          visualSensorAngles:F.ANGLES.slice(),visualSensorRanges:F.sensorDistances(sim.track,car),visualSensorInputs:car.inputs?.slice()??[],
          vehiclePhysicsInputs:car.physicsInputs?.slice(0,7)??[],roadPhysicsInputs:car.physicsInputs?.slice(7)??[],neuralReadout:readoutAttribution(car)};
      };
      sim.onTrialTick=s=>{
        const car=s.cars[0];ticks++;
        if((localSteerBias!==0||localBrakeScale!==1)&&car&&car.bestProgress>=localSteerFrom)steeringGateActive=true;
        if(contextSteerDelta!==0&&car?.brain?.policyFeatures?.length===sim.graph.learning.featureCount){
          for(const progress of contextAnchorProgress)if(!contextAnchors.has(progress)&&car.bestProgress>=progress)contextAnchors.set(progress,{progress:car.bestProgress,steering:car.slowOutputs?.[0]||0,features:Array.from(car.brain.policyFeatures)});
          if(!contextTarget&&car.bestProgress>=contextSteerTarget)contextTarget={progress:car.bestProgress,steering:car.slowOutputs?.[0]||0,features:Array.from(car.brain.policyFeatures)};
        }
        if(car&&(car.bestProgress>=650||!car.alive)&&ticks%5===0)trace.push(snapshot(car));
        if(car&&!car.alive){terminalCar=car;terminal={reason:car.reason,progress:car.bestProgress,laps:car.laps,fitness:car.fitness,baseFitness:car.baseFitness,
          reward:car.reward,penalty:car.penalty,rewardBreakdown:car.rewardBreakdown,seconds:car.lifetime};}
        if(performance.now()-lastProgress>20000){lastProgress=performance.now();console.log('DECODER7_REPLAY_PROGRESS '+JSON.stringify({ticks,progress:car?.bestProgress,alive:car?.alive}));}
      };
      while(!terminal&&ticks<60000)sim.tick();
      if(!terminal)throw Error('Frontier replay did not terminate naturally within the tick guard.');
      let neuralContextPatch=null,contextPatchedTerminal=null,contextPatchedTrace=[];
      if(contextSteerDelta!==0){
        if(!contextTarget||contextAnchorProgress.some(progress=>!contextAnchors.has(progress)))throw Error('Replay did not capture the target and anchor neural contexts.');
        const policy=sim.graph.learning,featureVector=sample=>[...sample.features.map(value=>value*policy.featureNorm),1],dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0),orthogonalize=(vector,basis)=>{
          const result=vector.slice();for(let pass=0;pass<2;pass++)for(const anchor of basis){const projection=dot(result,anchor);for(let i=0;i<result.length;i++)result[i]-=projection*anchor[i];}return result;
        };
        const basis=[];
        for(const progress of contextAnchorProgress){const vector=featureVector(contextAnchors.get(progress)),orthogonal=orthogonalize(vector,basis),length=Math.sqrt(dot(orthogonal,orthogonal));if(length>1e-8)basis.push(orthogonal.map(value=>value/length));}
        const targetVector=featureVector(contextTarget),direction=orthogonalize(targetVector,basis),response=dot(targetVector,direction);
        if(!(response>1e-7))throw Error('Target neural context has no usable direction outside the preserved anchors.');
        const baseSteering=contextTarget.steering,baseLogit=Math.atanh(Math.max(-.999999,Math.min(.999999,baseSteering))),targetLogit=Math.atanh(Math.max(-.999999,Math.min(.999999,baseSteering+contextSteerDelta))),requestedLogitDelta=targetLogit-baseLogit;
        const rawDelta=direction.map(value=>value*requestedLogitDelta/response),patchedGenome=F.cloneGenome(candidate.genome),weights=patchedGenome.policyWeights.slice(),indices=Array.from({length:policy.featureCount},(_,index)=>policy.readoutOffset+index*policy.readoutStride);indices.push(policy.biasOffset);
        let shrink=1;for(let j=0;j<indices.length;j++)if(rawDelta[j])shrink=Math.min(shrink,Math.max(0,(8-Math.abs(weights[indices[j]]))/Math.abs(rawDelta[j])));
        if(!(shrink>0))throw Error('Neural-context steering patch is clipped by the policy parameter bounds.');
        for(let j=0;j<indices.length;j++)weights[indices[j]]+=rawDelta[j]*Math.min(1,shrink)*(1-1e-12);
        patchedGenome.policyWeights=weights;
        const appliedLogitDelta=requestedLogitDelta*Math.min(1,shrink),anchorResponseDeltas=contextAnchorProgress.map(progress=>dot(featureVector(contextAnchors.get(progress)),direction)*appliedLogitDelta/response);
        neuralContextPatch={target:{progress:contextTarget.progress,steering:baseSteering,features:contextTarget.features.length},anchors:contextAnchorProgress.map(progress=>({progress:contextAnchors.get(progress).progress,steering:contextAnchors.get(progress).steering})),anchorBasisRank:basis.length,targetOrthogonalNormSquared:response,requestedSteeringDelta:contextSteerDelta,appliedSteeringDelta:Math.tanh(baseLogit+appliedLogitDelta)-baseSteering,requestedLogitDelta,appliedLogitDelta,anchorResponseDeltas,changedParameters:weights.reduce((count,value,index)=>count+(value!==candidate.genome.policyWeights[index]?1:0),0)};
        if(!L.valid(sim.graph,patchedGenome.policyWeights))throw Error('Context steering patch produced invalid policy parameters.');
        sim.spawn([patchedGenome]);sim.running=true;let patchedTicks=0,patchedCar=null;
        sim.onTrialTick=s=>{
          const car=s.cars[0];patchedTicks++;
          if(car&&(car.bestProgress>=650||!car.alive)&&patchedTicks%5===0)contextPatchedTrace.push(snapshot(car));
          if(car&&!car.alive){patchedCar=car;contextPatchedTerminal={reason:car.reason,progress:car.bestProgress,laps:car.laps,fitness:car.fitness,baseFitness:car.baseFitness,
            reward:car.reward,penalty:car.penalty,rewardBreakdown:car.rewardBreakdown,seconds:car.lifetime};}
        };
        while(!contextPatchedTerminal&&patchedTicks<60000)sim.tick();
        if(!contextPatchedTerminal)throw Error('Context-mutated policy replay did not terminate naturally.');
        neuralContextPatch.safe=F.isSafeLearningOutcome(patchedCar);neuralContextPatch.ticks=patchedTicks;
      }
      if(focusSteeringOverride&&(mutationFocusAudit.calls<1||mutationFocusAudit.changedByAction[0]<1||mutationFocusAudit.changedByAction[1]!==0||mutationFocusAudit.changedByAction[2]!==0||mutationFocusAudit.nonActionChanges!==0))throw Error('Steering-focus mutation audit failed.');
    const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
      let motorResponseSweep=null;
      const mutationCandidates=[];
      if(process.argv.includes('--motor-response-sweep')){
        const baseline=L.commands(sim.graph,terminalCar.brain,terminalCar.genome,true,true),levels=[];
        for(const factor of [.35,.6,1]){
          const random=F.rng(9017+Math.round(factor*1000)),samples=[];
          for(let index=0;index<64;index++){
            const policyWeights=L.localMutation(sim.graph,terminalCar.genome.policyWeights,random,.32*factor,true,'longitudinal');
            const commands=L.commands(sim.graph,terminalCar.brain,{adapterVersion:expectedAdapterVersion,policyWeights},true,true);
            samples.push({steering:commands[0],throttle:commands[1],brake:commands[2],forward:commands[1]-commands[2],policyWeights});
          }
          const ordered=samples.slice().sort((a,b)=>b.forward-a.forward);
          mutationCandidates.push({factor,policyWeights:ordered[0].policyWeights});
          levels.push({mutationScale:factor,samples:samples.length,
            steeringInvariant:samples.every(item=>Math.abs(item.steering-baseline[0])<1e-12),
            throttlePositive:samples.filter(item=>item.throttle>.05).length,
            brakeReleased:samples.filter(item=>item.brake<.05).length,
            bothThrottleAndBrakeReleased:samples.filter(item=>item.throttle>.05&&item.brake<.05).length,
            forwardRange:[Math.min(...samples.map(item=>item.forward)),Math.max(...samples.map(item=>item.forward))],
            bestForward:ordered.slice(0,3).map(({policyWeights,...item})=>item)});
        }
        motorResponseSweep={baseline:{steering:baseline[0],throttle:baseline[1],brake:baseline[2]},levels};
      }
      const probeResults=[];
      for(const probe of mutationCandidates){
        const genome={...terminalCar.genome,policyWeights:probe.policyWeights};
        sim.population=1;sim.mutation=0;sim.spawn([genome]);sim.running=true;
        let probeTerminal=null,probeCar=null,probeTicks=0;
        sim.onTrialTick=s=>{
          const car=s.cars[0];probeTicks++;
          if(car&&!car.alive){probeCar=car;probeTerminal={reason:car.reason,progress:car.bestProgress,laps:car.laps,fitness:car.fitness,seconds:car.lifetime,
            steering:car.slowOutputs?.[0]||0,throttle:car.slowOutputs?.[1]||0,brake:car.slowOutputs?.[2]||0};}
        };
        while(!probeTerminal&&probeTicks<60000)sim.tick();
        if(!probeTerminal)throw Error('Motor-response candidate did not terminate naturally.');
        probeResults.push({mutationScale:probe.factor,terminal:probeTerminal,ticks:probeTicks,
          safe:F.isSafeLearningOutcome(probeCar),rewardBreakdown:probeCar.rewardBreakdown});
      }
      const report={variant:'current-runtime-safe-frontier-diagnostic-replay',decoderMode:signedMotorDecoder?'signed-longitudinal-half-difference':'independent-gas-brake-heads',steeringGain,
        localSteeringDiagnostic:{bias:localSteerBias,brakeScale:localBrakeScale,startsAtProgress:localSteerFrom},neuralContextPatch,contextPatchedTerminal,contextPatchedTrace,startGeneration:state.generation,
        candidate:{source:candidate.source,bestProgress:candidate.bestProgress,laps:candidate.laps,fitness:candidate.fitness},
        safeFrontierBeforeReplay:restoredSafeFrontier,terminal,ticks,initialCarKeys,
        startPosition:position,trace,motorResponseSweep,probeResults,gpu,gpuIdentity,inputIntegrity:{inputUnchanged:fileHash(input)===inputHash,userSaveUnchanged:fileHash(userSave)===userSaveHash},
        sourceSha256:{simulation:fileHash(path.join(root,'outputs/simulation.js')),learning:fileHash(path.join(root,'outputs/neural-learning.js')),rewards:fileHash(path.join(root,'outputs/rewards.js')),runner:fileHash(__filename)},
        limits:'Singolo replay deterministico di un genoma archiviato; non aggiorna i pesi e non completa/forza l’episodio.'};
      const reportPath=path.join(output,'decoder7-main-runtime-frontier-replay.json');
      fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
      console.log('DECODER7_REPLAY_DONE '+JSON.stringify({candidate:report.candidate,terminal,ticks,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,report:reportPath}));
      return;
    }
    sim.running=true;

    fs.mkdirSync(output,{recursive:false});outputCreated=true;
    Cuda=require(path.join(root,'work/cuda-exact-v3-runtime.cjs'));
    originalDenseStep=Dense.step;
    Dense.step=(...args)=>Cuda.pass(...args);
    let history=[],cars=[],practiceSnapshotAudit=[],lastProgress=performance.now(),maxThrottle=0,maxBrake=0,maxSteering=0;
    sim.onTrialTick=s=>{
      for(const car of s.cars)if(car.speed/(car.pixelsPerMeter||1)>2){
        maxThrottle=Math.max(maxThrottle,car.slowOutputs?.[1]||0);
        maxBrake=Math.max(maxBrake,car.slowOutputs?.[2]||0);
        maxSteering=Math.max(maxSteering,Math.abs(car.slowOutputs?.[0]||0));
      }
      if(performance.now()-lastProgress>20000){
        lastProgress=performance.now();
        console.log('DECODER7_MAIN_PROGRESS '+JSON.stringify({generation:s.generation,elapsed:s.elapsed,alive:s.cars.filter(c=>c.alive).length,progress:Math.max(...s.cars.map(c=>c.bestProgress))}));
      }
      if(s.cars.every(c=>!c.alive)){practiceSnapshotAudit=s.cars.map(c=>({id:c.id,present:Boolean(c.practiceState),along:c.practiceState?.along??null,speed:c.practiceState?.speed??null,terminalSpeed:c.speed,terminalAlive:c.alive}));cars=s.cars.map(c=>({id:c.id,progress:c.bestProgress,fitness:c.fitness,laps:c.laps,reason:c.reason,safe:F.isSafeLearningOutcome(c)}));}
    };
    for(let update=0;update<4;update++){
      maxThrottle=0;maxBrake=0;maxSteering=0;cars=[];practiceSnapshotAudit=[];
      const generation=sim.generation;let ticks=0;
      while(sim.generation===generation&&ticks++<60000)sim.tick();
      if(sim.generation===generation)throw Error('Natural generation unfinished; refusing forced evolve.');
      const rawRanked=cars.slice().sort((a,b)=>b.fitness-a.fitness);
      const safeRanked=cars.filter(c=>c.safe).sort((a,b)=>b.progress-a.progress||b.fitness-a.fitness);
      const optimizerRanked=cars.map(c=>({...c,bestProgress:c.progress})).sort(F.compareOptimizerAgents);
      const item={...sim.history.at(-1),maxThrottle,maxBrake,maxSteering,cars,practiceSnapshotAudit,practiceEvaluations:sim.practiceEvaluations,practiceResults:sim.practiceResults,stagnation:sim.stagnation,researchExplorationAge:preserveExplorationAge?sim.researchExplorationAge:null,
        safeProgress:safeRanked.length?safeRanked[0].progress:null,safeCount:safeRanked.length,
        collisionCount:cars.filter(c=>!c.safe).length,
        topFitnessReasons:rawRanked.slice(0,10).reduce((a,c)=>(a[c.reason]=(a[c.reason]||0)+1,a),{}),
        topOptimizerReasons:optimizerRanked.slice(0,10).reduce((a,c)=>(a[c.reason]=(a[c.reason]||0)+1,a),{}),
        safeFrontier:sim.safeLearningFrontier.progress,optimizerUpdates:sim.optimizer.updates,optimizerEpisodes:sim.optimizer.episodes,
        nextGenerationFrontierDiagnostics:sim.lastFrontierDiagnostics||null,optimizerPairStats:sim.lastOptimizerPairStats||null};
      history.push(item);
      fs.writeFileSync(path.join(output,'decoder7-main-runtime-partial.json'),JSON.stringify({history},null,2));
      console.log('DECODER7_MAIN_GENERATION '+JSON.stringify({generation:item.generation,safeProgress:item.safeProgress,rawProgress:item.bestProgress,safe:item.safeCount,collisions:item.collisionCount,laps:item.maxLaps,topOptimizerReasons:item.topOptimizerReasons,frontier:item.safeFrontier,stagnation:item.stagnation,researchExplorationAge:item.researchExplorationAge,wallSeconds:(performance.now()-started)/1000}));
    }

    if(focusSteeringOverride&&(mutationFocusAudit.calls<1||mutationFocusAudit.changedByAction[0]<1||mutationFocusAudit.changedByAction[1]!==0||mutationFocusAudit.changedByAction[2]!==0||mutationFocusAudit.nonActionChanges!==0))throw Error('Steering-focus mutation audit failed.');
    const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
    if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 CUDA execution with no CPU fallback.');
    const savePath=path.join(output,`decoder7-main-runtime-gen${sim.generation}-research.malecns-save`);
    fs.writeFileSync(savePath,await P.encode(P.fromSimulation(sim),appSave.appVersion));
    const outputSave=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0');
    P.validatePayload(outputSave.payload,{graph:sim.graph,circuits:sim.circuits});
    const simPath=path.join(root,'outputs/simulation.js');
    const result={variant:antitheticOptimizerSamples?'decoder7-current-runtime-antithetic-es-samples-research':useTemporalDecoder?'decoder8-current-neural-temporal-readout-research':optimizerFrontierAnchorRate>0?'decoder7-current-runtime-es-frontier-anchor-research':optimizerSampleRate!==.1?'decoder7-current-runtime-es-sample-rate-research':preserveExplorationAge?'decoder7-current-runtime-frontier-threshold-preserved-exploration-age-research':safeFrontierMarginOverride!==null?'decoder7-current-runtime-safe-frontier-margin-research':populationExpansion.added>0?'decoder7-current-runtime-expanded-population-research':riskRepairEnabled?'decoder7-current-runtime-near-frontier-risk-repair':signedMotorDecoder?'decoder7-current-runtime-signed-longitudinal-decoder':fitnessBandMeters?'decoder7-current-runtime-safe-progress-fitness-band':focusSteeringOverride?'decoder7-current-runtime-steering-focused-frontier-mutation-verified':'decoder7-current-runtime-combined-steering-longitudinal-research',appVersion:appSave.appVersion,
      settings:{population:sim.population,startingPopulation:state.population,populationExpansion,mutation:state.mutation,circuitId:state.circuitId,seed:state.seed,startingGeneration:state.generation,optimizerSampleRate,antitheticOptimizerSamples,optimizerFrontierAnchorRate,useTemporalDecoder,generalizedActionReadoutCrossover,
        frontierMutationFocusOverride:focusCombinedOverride?'longitudinal→combined steering/gas/brake':focusSteeringOverride?'longitudinal→steering only':null,contextPreservingMutation:contextMutation,riskRepairEnabled,riskRepairOffspringRate:riskRepairRate,
        fitnessTieBandMeters:fitnessBandMeters||null,signedMotorDecoder,steeringGain,safeFrontierMarginOverrideMeters:safeFrontierMarginOverride,preserveExplorationAge,researchExplorationAgeStart:preserveExplorationAge?researchSearchAgeOverride??state.stagnation:null,mutationFocusAudit,localSteeringDiagnostic:{bias:localSteerBias,brakeScale:localBrakeScale,startsAtProgress:localSteerFrom}},
      policy:{version:sim.graph.learning.version,actions:sim.graph.learning.actionCount,parameters:sim.graph.learning.length},
      practiceSnapshotMode:refreshLivePracticeSnapshots?'refresh-live-then-retain':retainLivePracticeSnapshots?'retain-first-live-snapshot':'current-terminal-overwrite',history,gpu,gpuIdentity,wallSeconds:(performance.now()-started)/1000,
      inputIntegrity:{inputUnchanged:fileHash(input)===inputHash,inputSha256:inputHash,userSaveUnchanged:fileHash(userSave)===userSaveHash,userSaveSha256:userSaveHash},
      sourceSha256:{simulation:fileHash(simPath),simulationRuntimeOverlay:sha256(simulationRuntimeSource),learning:fileHash(path.join(root,'outputs/neural-learning.js')),progress:fileHash(path.join(root,'outputs/progress-save.js')),rewards:fileHash(path.join(root,'outputs/rewards.js')),vehicle:fileHash(path.join(root,'outputs/vehicle-992.js')),dense:fileHash(path.join(root,'outputs/dense-neural.js')),decoderModel:fileHash(path.join(root,'work/decoder7-model.cjs')),temporalDecoder:fileHash(path.join(root,'work/decoder8-temporal-model.cjs')),runner:fileHash(__filename),cudaHarness:fileHash(path.join(root,'work/cuda-exact-v3-runtime.cjs'))},
      outputSave:{path:savePath,sha256:fileHash(savePath),bytes:fs.statSync(savePath).size,validated:true},
      limits:useTemporalDecoder?'Ricerca isolata decoder8, compatibile solo con questa copia migrata e non con la release Windows 5.6.0 o con i salvataggi decoder7. Il salvataggio di ingresso e quello personale non sono modificati; nessun percorso guida o evoluzione forzata.':'Ricerca isolata sul runtime corrente; il decoder7 non è compatibile con la release Windows 5.6.0. Non modifica l’app né il salvataggio originale; nessun percorso guida o evoluzione forzata.'};
    fs.writeFileSync(path.join(output,'decoder7-main-runtime-result.json'),JSON.stringify(result,null,2));
    fs.rmSync(path.join(output,'decoder7-main-runtime-partial.json'),{force:true});
    console.log('DECODER7_MAIN_DONE '+JSON.stringify({gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,inputUnchanged:result.inputIntegrity.inputUnchanged,userSaveUnchanged:result.inputIntegrity.userSaveUnchanged,history:history.map(h=>({generation:h.generation,safeProgress:h.safeProgress,safeCount:h.safeCount,collisions:h.collisionCount,laps:h.maxLaps})),outputSave:result.outputSave,wallSeconds:result.wallSeconds}));
  }catch(error){
    if(outputCreated)fs.writeFileSync(path.join(output,'decoder7-main-runtime-error.json'),JSON.stringify({error:error.stack||String(error),inputSha256:inputHash,userSaveSha256:userSaveHash,wallSeconds:(performance.now()-started)/1000},null,2));
    throw error;
  }finally{
    if(originalDenseStep)Dense.step=originalDenseStep;
    if(Cuda)Cuda.dispose?.();
    uninstallDecoder8();uninstallDecoder7();restoreBuild();
  }
}

main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
