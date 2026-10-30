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
const independentSeedArg=process.argv.find(value=>value.startsWith('--independent-seed='));
const independentSeed=independentSeedArg?Number(independentSeedArg.slice('--independent-seed='.length)):null;
if(independentSeed!==null&&(!Number.isInteger(independentSeed)||independentSeed<0||independentSeed>0xffffffff))throw Error('Independent seed must be an unsigned 32-bit integer.');
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
const Rewards=require(path.join(root,'outputs/rewards.js'));
const arg=(key,fallback)=>{const item=process.argv.find(value=>value.startsWith(`${key}=`));return item?item.slice(key.length+1):fallback;};
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
  const state=appSave.payload.workers[0].state;
  if(state.generation!==expectedStartingGeneration||state.population!==40||state.circuitId!=='monza'||state.rewardRevision!==Rewards.REVISION||state.genomes.some(g=>g!==null&&g.adapterVersion!==7))throw Error('Unexpected decoder7 continuation checkpoint.');

  const restoreBuild=installMainCompatibleDecoder6();
  const uninstallDecoder7=D7.install(L);
  const defaultD7Commands=L.commands;
  const signedMotorDecoder=process.argv.includes('--signed-motor-decoder');
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
  const steeringFocusScaleArg=process.argv.find(value=>value.startsWith('--steering-focus-scale='));
  const steeringFocusScale=steeringFocusScaleArg?Number(steeringFocusScaleArg.slice('--steering-focus-scale='.length)):1;
  if(!Number.isFinite(steeringFocusScale)||steeringFocusScale<.25||steeringFocusScale>4)throw Error('Steering focus scale must be in [.25, 4].');
  const contextMutation=process.argv.includes('--context-mutation');
  const sparseSteeringOverride=process.argv.includes('--sparse-context-steering');
  const runMode=signedMotorDecoder?'signed-longitudinal-decoder':fitnessBandMeters>0?'safe-progress-fitness-band':sparseSteeringOverride?'sparse-context-steering-mutation':focusSteeringOverride?'steering-focused-mutation':focusCombinedOverride?'combined-steering-longitudinal-mutation':contextMutation?'context-preserving-mutation':'natural-evolution';
  const sparseFeatureCount=8;
  const mutationFocusAudit={calls:0,changedByAction:[0,0,0],nonActionChanges:0,changedCoefficients:0,selectedFeatures:{}};
  // Keep ordinary mutations unchanged; only retarget an explicitly requested
  // stalled-frontier longitudinal focus in this isolated decoder experiment.
  const applyRequestedFocus=focus=>focusSteeringOverride&&focus==='longitudinal'?'steering':focusCombinedOverride&&focus==='longitudinal'?'combined':focus;
  const recordFocusOverride=(graph,before,after,requestedFocus)=>{
    if((focusSteeringOverride||focusCombinedOverride)&&requestedFocus==='longitudinal')recordFocusedMutation(graph,before,after);
  };
  const recordFocusedMutation=(graph,before,after)=>{
    mutationFocusAudit.calls++;
    const p=graph.learning;
    for(let i=0;i<after.length;i++)if(after[i]!==before[i]){
      let action=-1;
      if(i>=p.readoutOffset&&i<p.thresholdOffset)action=(i-p.readoutOffset)%p.readoutStride;
      else if(i>=p.biasOffset&&i<p.biasOffset+3)action=i-p.biasOffset;
      if(action>=0&&action<3)mutationFocusAudit.changedByAction[action]++;
      else mutationFocusAudit.nonActionChanges++;
      mutationFocusAudit.changedCoefficients++;
      if(sparseSteeringOverride&&action===0){const feature=Math.floor((i-p.readoutOffset)/p.readoutStride);mutationFocusAudit.selectedFeatures[feature]=(mutationFocusAudit.selectedFeatures[feature]||0)+1;}
    }
  };
  const sparseSteeringMutation=(graph,values,r,amount,experience)=>{
    const p=graph.learning;
    if(p?.actionCount!==3||p.readoutStride!==3)return originalSafeMotorMutation(graph,values,r,amount*.35);
    const scale=Math.max(0,amount)/.16*.35;
    if(!scale)return values.slice();
    const centres=experience?.centres?.filter(c=>c.values?.length===p.featureCount&&c.values.every(Number.isFinite)&&c.count>0)||[];
    const scores=Array(p.featureCount).fill(0);
    if(centres.length){
      const total=centres.reduce((sum,c)=>sum+c.count,0)||1;
      const means=Array(p.featureCount).fill(0);
      for(const c of centres)for(let j=0;j<p.featureCount;j++)means[j]+=c.values[j]*c.count/total;
      for(const c of centres)for(let j=0;j<p.featureCount;j++)scores[j]+=(c.values[j]-means[j])**2*c.count/total;
      for(let j=0;j<p.featureCount;j++)scores[j]=Math.sqrt(scores[j]+.025*means[j]*means[j]);
    }
    let pool=Array.from({length:p.featureCount},(_,i)=>i).sort((a,b)=>scores[b]-scores[a]||a-b).slice(0,Math.min(32,p.featureCount));
    const chosen=[];
    while(chosen.length<Math.min(sparseFeatureCount,p.featureCount)&&pool.length){
      const weights=pool.map(index=>Math.max(1e-6,scores[index]));let draw=r()*weights.reduce((sum,v)=>sum+v,0),at=weights.length-1;
      for(let i=0;i<weights.length;i++){draw-=weights[i];if(draw<=0){at=i;break;}}
      chosen.push(pool[at]);pool.splice(at,1);
    }
    const child=values.slice(),energy=Math.sqrt(p.featureCount/Math.max(1,chosen.length));
    for(const feature of chosen){const index=p.readoutOffset+feature*p.readoutStride;const u1=Math.max(1e-9,r()),u2=r(),z=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);child[index]=Math.max(-8,Math.min(8,child[index]+z*p.scales[index]*scale*energy));}
    return child;
  };
  if(sparseSteeringOverride)L.safeMotorMutation=(graph,values,r,amount,experience)=>{
    const next=sparseSteeringMutation(graph,values,r,amount,experience);
    recordFocusedMutation(graph,values,next);
    return next;
  };
  else if(contextMutation)L.safeMotorMutation=(graph,values,r,amount,experience,focus)=>{
    const next=D7.contextSafeMotorMutation(graph,values,r,amount,experience,applyRequestedFocus(focus));
    recordFocusOverride(graph,values,next,focus);
    return next;
  };
  else if(focusCombinedOverride||focusSteeringOverride)L.safeMotorMutation=(graph,values,r,amount,experience,focus)=>{
    const targetedSteering=focusSteeringOverride&&focus==='longitudinal';
    const next=originalSafeMotorMutation(graph,values,r,targetedSteering?amount*steeringFocusScale:amount,experience,applyRequestedFocus(focus));
    recordFocusOverride(graph,values,next,focus);
    return next;
  };
  let Cuda=null,originalDenseStep=null,outputCreated=false;
  const started=performance.now();
  try{
    const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
    const model=Legacy.tagV3(source);
    model.policyConfig={...D7.POLICY};
    model.modelLabel='V3 · decoder 7 sperimentale, runtime app corrente';
    const circuits=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
    const sim=new F.Simulation(model,{modelId:'v3',population:state.population,circuitId:state.circuitId,circuits});

    // Prove node identity and initialization against the exact decoder6
    // experiment used to migrate the checkpoint before spending GPU time.
    const oldGraph=D6.F.compileGraph(D6.model(source));
    const oldPolicy=D6.F.ensureLearning(oldGraph);
    const expected=D7.expand(oldPolicy),actual=sim.graph.learning;
    if(!sameArray(Array.from(actual.nodes),Array.from(expected.nodes))||
       !sameArray(actual.mean,expected.mean)||!sameArray(actual.scales,expected.scales))
      throw Error('Decoder7 migration base does not exactly match the checkpoint readout/optimizer initialization.');
    P.validatePayload(appSave.payload,{graph:sim.graph,circuits:sim.circuits});
    // Replicate an experiment from the identical saved population and optimizer,
    // while resetting only the stochastic stream to an independently selected seed.
    if(independentSeed!==null){state.seed=independentSeed;state.rngState=independentSeed;P.validateTraining(state,sim.graph,sim.circuits);}
    P.restore(sim,state);
    if(sim.safeLearningFrontier.progress<0||sim.generation!==expectedStartingGeneration)throw Error('Restored safe frontier or generation is invalid.');
    if(process.argv.includes('--preflight')){
      const transferredInitial=D7.transfer(oldPolicy.mean,oldPolicy,actual),preflightBrain=F.makeBrain(sim.graph);
      for(let index=0;index<actual.nodes.length;index++)preflightBrain.activity[actual.nodes[index]]=Math.sin(index*1.13)*.2;
      const initialDefault=defaultD7Commands(sim.graph,preflightBrain,{adapterVersion:7,policyWeights:transferredInitial},true,true);
      const initialSigned=D7.signedCommands(L,sim.graph,preflightBrain,{adapterVersion:7,policyWeights:transferredInitial},true,true,defaultD7Commands);
      const signedDecoderInitializationEquivalent=initialDefault.every((value,index)=>Math.abs(value-initialSigned[index])<1e-12)&&Math.min(initialSigned[1],initialSigned[2])===0;
      if(!signedDecoderInitializationEquivalent)throw Error('Signed longitudinal decoder does not preserve the initial V6→V7 transfer.');
      const fitnessBandComparatorChecks=fitnessBandMeters>0?{
        fitnessWithinBand:F.compareLearningAgents({reason:'troppo lenta / senza progresso',laps:0,bestProgress:795,fitness:-5000},{reason:'troppo lenta / senza progresso',laps:0,bestProgress:790,fitness:-4500})>0,
        progressOutsideBand:F.compareLearningAgents({reason:'troppo lenta / senza progresso',laps:0,bestProgress:795,fitness:-5000},{reason:'troppo lenta / senza progresso',laps:0,bestProgress:760,fitness:-2000})<0,
        safetyPrecedesBand:F.compareLearningAgents({reason:'troppo lenta / senza progresso',laps:0,bestProgress:795,fitness:-5000},{reason:'urto',laps:0,bestProgress:999,fitness:10000})<0}:null;
      if(fitnessBandComparatorChecks&&Object.values(fitnessBandComparatorChecks).some(value=>!value))throw Error('Fitness-band comparator preflight failed.');
      console.log('DECODER7_MAIN_PREFLIGHT '+JSON.stringify({checkpointValid:true,generation:sim.generation,population:sim.population,
        rewardRevision:sim.rewardRevision,policyVersion:actual.version,parameters:actual.length,seed:sim.seed,rngState:sim.random.getState(),
        decoder6NodeIdentityExact:sameArray(Array.from(actual.nodes),Array.from(expected.nodes)),
        decoder6MeanExact:sameArray(actual.mean,expected.mean),decoder6ScaleExact:sameArray(actual.scales,expected.scales),
        signedDecoderInitializationEquivalent,signedMotorDecoder,steeringGain,safeFrontier:sim.safeLearningFrontier.progress,fitnessBandMeters:fitnessBandMeters||null,fitnessBandComparatorChecks,inputSha256:inputHash,userSaveSha256:userSaveHash,
        runtimeSha256:fileHash(simulationPath),runtimeOverlaySha256:sha256(simulationRuntimeSource)}));
      return;
    }
    if(process.argv.includes('--replay-frontier')){
      const candidates=[...sim.hallOfFame.map(entry=>({...entry,source:'hall-of-fame'})),
        ...(sim.champion&&sim.championStats?[{...sim.championStats,genome:sim.champion,source:'champion'}]:[])]
        .filter(entry=>entry.genome?.adapterVersion===7&&Number.isFinite(entry.bestProgress))
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
      const snapshot=car=>{
        const loc=F.locate(sim.track,car.x,car.y);
        return{seconds:+car.lifetime.toFixed(3),progress:+car.bestProgress.toFixed(3),speedKmh:+((car.vehicle?.speedMps??car.speed/(car.pixelsPerMeter||1))*3.6).toFixed(2),
          steering:+(car.slowOutputs?.[0]||0).toFixed(4),throttle:+(car.slowOutputs?.[1]||0).toFixed(4),brake:+(car.slowOutputs?.[2]||0).toFixed(4),
          gear:car.vehicle?.gear??null,rpm:car.vehicle?.rpm??null,yawRate:+(car.yawRate||0).toFixed(4),longitudinalG:+(car.longitudinalG||0).toFixed(3),lateralG:+(car.lateralG||0).toFixed(3),
          slipAngle:+(car.slipAngle||0).toFixed(4),position:{x:+car.x.toFixed(2),y:+car.y.toFixed(2),heading:+car.heading.toFixed(4),along:+(loc.along??0).toFixed(2),distance:+(loc.distance??0).toFixed(2)},
          roadInputs:car.inputs?.slice(-4)??[],physicsInputs:car.physicsInputs?.slice(0,7)??[],roadPhysicsInputs:car.physicsInputs?.slice(7)??[]};
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
      if((focusSteeringOverride||sparseSteeringOverride)&&(mutationFocusAudit.calls<1||mutationFocusAudit.changedByAction[0]<1||mutationFocusAudit.changedByAction[1]!==0||mutationFocusAudit.changedByAction[2]!==0||mutationFocusAudit.nonActionChanges!==0))throw Error('Steering-focus mutation audit failed.');
    const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
      let motorResponseSweep=null;
      const mutationCandidates=[];
      if(process.argv.includes('--motor-response-sweep')){
        const baseline=L.commands(sim.graph,terminalCar.brain,terminalCar.genome,true,true),levels=[];
        for(const factor of [.35,.6,1]){
          const random=F.rng(9017+Math.round(factor*1000)),samples=[];
          for(let index=0;index<64;index++){
            const policyWeights=L.localMutation(sim.graph,terminalCar.genome.policyWeights,random,.32*factor,true,'longitudinal');
            const commands=L.commands(sim.graph,terminalCar.brain,{adapterVersion:7,policyWeights},true,true);
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
    let history=[],cars=[],lastProgress=performance.now(),maxThrottle=0,maxBrake=0,maxSteering=0;
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
      if(s.cars.every(c=>!c.alive))cars=s.cars.map(c=>({id:c.id,progress:c.bestProgress,fitness:c.fitness,laps:c.laps,reason:c.reason,safe:F.isSafeLearningOutcome(c)}));
    };
    for(let update=0;update<4;update++){
      maxThrottle=0;maxBrake=0;maxSteering=0;cars=[];
      const generation=sim.generation;let ticks=0;
      while(sim.generation===generation&&ticks++<60000)sim.tick();
      if(sim.generation===generation)throw Error('Natural generation unfinished; refusing forced evolve.');
      const rawRanked=cars.slice().sort((a,b)=>b.fitness-a.fitness);
      const safeRanked=cars.filter(c=>c.safe).sort((a,b)=>b.progress-a.progress||b.fitness-a.fitness);
      const optimizerRanked=cars.map(c=>({...c,bestProgress:c.progress})).sort(F.compareOptimizerAgents);
      const item={...sim.history.at(-1),maxThrottle,maxBrake,maxSteering,cars,
        safeProgress:safeRanked.length?safeRanked[0].progress:null,safeCount:safeRanked.length,
        collisionCount:cars.filter(c=>!c.safe).length,
        topFitnessReasons:rawRanked.slice(0,10).reduce((a,c)=>(a[c.reason]=(a[c.reason]||0)+1,a),{}),
        topOptimizerReasons:optimizerRanked.slice(0,10).reduce((a,c)=>(a[c.reason]=(a[c.reason]||0)+1,a),{}),
        safeFrontier:sim.safeLearningFrontier.progress,optimizerUpdates:sim.optimizer.updates,optimizerEpisodes:sim.optimizer.episodes,
        nextGenerationFrontierDiagnostics:sim.lastFrontierDiagnostics||null};
      history.push(item);
      fs.writeFileSync(path.join(output,'decoder7-main-runtime-partial.json'),JSON.stringify({history},null,2));
      console.log('DECODER7_MAIN_GENERATION '+JSON.stringify({generation:item.generation,safeProgress:item.safeProgress,rawProgress:item.bestProgress,safe:item.safeCount,collisions:item.collisionCount,laps:item.maxLaps,topOptimizerReasons:item.topOptimizerReasons,frontier:item.safeFrontier,stagnation:item.stagnation,wallSeconds:(performance.now()-started)/1000}));
    }

    if((focusSteeringOverride||sparseSteeringOverride)&&(mutationFocusAudit.calls<1||mutationFocusAudit.changedByAction[0]<1||mutationFocusAudit.changedByAction[1]!==0||mutationFocusAudit.changedByAction[2]!==0||mutationFocusAudit.nonActionChanges!==0))throw Error('Steering-focus mutation audit failed.');
    if(focusCombinedOverride&&(mutationFocusAudit.calls<1||mutationFocusAudit.changedByAction.some(count=>count<1)||mutationFocusAudit.nonActionChanges!==0))throw Error('Combined-focus mutation audit failed.');
    const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
    if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 CUDA execution with no CPU fallback.');
    const savePath=path.join(output,`decoder7-main-runtime-gen${sim.generation}-research.malecns-save`);
    fs.writeFileSync(savePath,await P.encode(P.fromSimulation(sim),appSave.appVersion));
    const outputSave=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0');
    P.validatePayload(outputSave.payload,{graph:sim.graph,circuits:sim.circuits});
    const simPath=path.join(root,'outputs/simulation.js');
    const result={variant:`decoder7-current-runtime-${runMode}`,appVersion:appSave.appVersion,
      settings:{population:state.population,mutation:state.mutation,circuitId:state.circuitId,seed:state.seed,startingGeneration:state.generation,
        runMode,independentRngSeed:independentSeed,
        frontierMutationFocusOverride:focusCombinedOverride?'longitudinal→combined steering/gas/brake':focusSteeringOverride?'longitudinal→steering only':null,
        steeringFocusScale:focusSteeringOverride?steeringFocusScale:null,contextPreservingMutation:contextMutation,
        fitnessTieBandMeters:fitnessBandMeters||null,signedMotorDecoder,steeringGain,sparseContextSteeringMutation:sparseSteeringOverride?{selectedPerMutation:sparseFeatureCount,selection:"top-32 empirical neural-context variance with weighted sampling",energyMatched:true}:null,mutationFocusAudit,localSteeringDiagnostic:{bias:localSteerBias,brakeScale:localBrakeScale,startsAtProgress:localSteerFrom}},
      policy:{version:sim.graph.learning.version,actions:sim.graph.learning.actionCount,parameters:sim.graph.learning.length},
      history,gpu,gpuIdentity,wallSeconds:(performance.now()-started)/1000,
      checkpointLineage:{inputPath:input,inputSha256:inputHash,parentReportPath:controlReport,parentVariant:recorded.variant,parentOutputSha256:recorded.outputSave.sha256,startingGeneration:state.generation},
      inputIntegrity:{inputUnchanged:fileHash(input)===inputHash,inputSha256:inputHash,userSaveUnchanged:fileHash(userSave)===userSaveHash,userSaveSha256:userSaveHash},
      sourceSha256:{simulation:fileHash(simPath),simulationRuntimeOverlay:sha256(simulationRuntimeSource),learning:fileHash(path.join(root,'outputs/neural-learning.js')),progress:fileHash(path.join(root,'outputs/progress-save.js')),rewards:fileHash(path.join(root,'outputs/rewards.js')),vehicle:fileHash(path.join(root,'outputs/vehicle-992.js')),dense:fileHash(path.join(root,'outputs/dense-neural.js')),decoderModel:fileHash(path.join(root,'work/decoder7-model.cjs')),runner:fileHash(__filename),cudaHarness:fileHash(path.join(root,'work/cuda-exact-v3-runtime.cjs'))},
      outputSave:{path:savePath,sha256:fileHash(savePath),bytes:fs.statSync(savePath).size,validated:true},
      limits:'Ricerca isolata sul runtime corrente; il decoder7 non è compatibile con la release Windows 5.6.0. Non modifica l’app né il salvataggio originale; nessun percorso guida o evoluzione forzata.'};
    fs.writeFileSync(path.join(output,'decoder7-main-runtime-result.json'),JSON.stringify(result,null,2));
    fs.rmSync(path.join(output,'decoder7-main-runtime-partial.json'),{force:true});
    console.log('DECODER7_MAIN_DONE '+JSON.stringify({gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,inputUnchanged:result.inputIntegrity.inputUnchanged,userSaveUnchanged:result.inputIntegrity.userSaveUnchanged,history:history.map(h=>({generation:h.generation,safeProgress:h.safeProgress,safeCount:h.safeCount,collisions:h.collisionCount,laps:h.maxLaps})),outputSave:result.outputSave,wallSeconds:result.wallSeconds}));
  }catch(error){
    if(outputCreated)fs.writeFileSync(path.join(output,'decoder7-main-runtime-error.json'),JSON.stringify({error:error.stack||String(error),inputSha256:inputHash,userSaveSha256:userSaveHash,wallSeconds:(performance.now()-started)/1000},null,2));
    throw error;
  }finally{
    if(originalDenseStep)Dense.step=originalDenseStep;
    if(Cuda)Cuda.dispose?.();
    uninstallDecoder7();restoreBuild();
  }
}

main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
