'use strict';
// Matched, in-memory V3/Monza replay from the user's exact generation-64 save.
// The treatment changes only one mutation constraint: a motor readout may be
// explored at a measured terminal neural context. No route/action rule is added.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const useCuda=process.env.MALECNS_STALLED_ESCAPE_CUDA==='1';
const Dense=useCuda?require('../outputs/dense-neural.js'):null,Cuda=useCuda?require('./cuda-exact-v3-runtime.cjs'):null;
if(useCuda){const cpuStep=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);}
const out=path.resolve(process.env.MALECNS_STALLED_ESCAPE_REPORT_DIR||path.join(root,'.impeccable/review/learning-ml/saved-v3-pop100-targeted-ab-20261021-01'));
const generationsPerArm=Number(process.env.MALECNS_STALLED_ESCAPE_GENERATIONS||3);
assert.ok(Number.isInteger(generationsPerArm)&&generationsPerArm>=3&&generationsPerArm<=8,'Use 3-8 natural generations per arm');
const controlPopulation=Number(process.env.MALECNS_STALLED_ESCAPE_CONTROL_POPULATION||40);
assert.ok(Number.isInteger(controlPopulation)&&controlPopulation>=40&&controlPopulation<=100,'Control population must be 40-100');
const treatmentPopulation=Number(process.env.MALECNS_STALLED_ESCAPE_TREATMENT_POPULATION||100);
assert.ok(Number.isInteger(treatmentPopulation)&&treatmentPopulation>=40&&treatmentPopulation<=100,'Treatment population must be 40-100');
const populationOnly=process.env.MALECNS_STALLED_ESCAPE_POPULATION_ONLY==='1';
const rewardRevisionTreatment=process.env.MALECNS_STALLED_ESCAPE_REWARD_REVISION||null;
const rewardRevisionOnly=Boolean(rewardRevisionTreatment);
const rewardRevisionBoth=process.env.MALECNS_STALLED_ESCAPE_REWARD_REVISION_BOTH==='1';
const fitnessFirstNoLap=process.env.MALECNS_STALLED_ESCAPE_FITNESS_FIRST_NO_LAP==='1';
const optimizerSampleFraction=Number(process.env.MALECNS_STALLED_ESCAPE_ES_SAMPLE_FRACTION||.1);
assert.ok(Number.isFinite(optimizerSampleFraction)&&optimizerSampleFraction>=.1&&optimizerSampleFraction<=.9,'ES sample fraction must be in [.1, .9]');
const optimizerSampleFractionControl=Number(process.env.MALECNS_STALLED_ESCAPE_ES_SAMPLE_FRACTION_CONTROL||.1);
assert.ok(Number.isFinite(optimizerSampleFractionControl)&&optimizerSampleFractionControl>=.1&&optimizerSampleFractionControl<=.9,'Control ES sample fraction must be in [.1, .9]');
const optimizerSampleLongitudinalOnly=process.env.MALECNS_STALLED_ESCAPE_ES_LONGITUDINAL_ONLY==='1';
const progressWeightNoLap=Number(process.env.MALECNS_STALLED_ESCAPE_PROGRESS_WEIGHT_NO_LAP||0);
assert.ok(Number.isFinite(progressWeightNoLap)&&progressWeightNoLap>=0&&progressWeightNoLap<=20,'No-lap progress weight must be in [0, 20]');
const progressBucketNoLapMeters=Number(process.env.MALECNS_STALLED_ESCAPE_PROGRESS_BUCKET_NO_LAP_METERS||0);
assert.ok(Number.isFinite(progressBucketNoLapMeters)&&progressBucketNoLapMeters>=0&&progressBucketNoLapMeters<=1000,'No-lap progress bucket must be in [0, 1000] metres');
assert.ok(!(progressWeightNoLap>0&&progressBucketNoLapMeters>0),'Use either weighted or bucketed no-lap ranking, not both');
const postCheckpointSeed=process.env.MALECNS_STALLED_ESCAPE_POST_CHECKPOINT_SEED===undefined?null:Number(process.env.MALECNS_STALLED_ESCAPE_POST_CHECKPOINT_SEED);
assert.ok(postCheckpointSeed===null||Number.isSafeInteger(postCheckpointSeed)&&postCheckpointSeed>0,'Post-checkpoint evolutionary seed must be a positive safe integer');
const jointEscape=process.env.MALECNS_STALLED_ESCAPE_JOINT==='1';
const unsafeFrontierParent=process.env.MALECNS_STALLED_ESCAPE_UNSAFE_FRONTIER_PARENT==='1';
const unsafeEdgeSteering=process.env.MALECNS_STALLED_ESCAPE_UNSAFE_EDGE_STEERING==='1';
const targetedEscape=process.env.MALECNS_STALLED_ESCAPE_TARGETED==='1';
const targetedJointEscape=process.env.MALECNS_STALLED_ESCAPE_TARGETED_JOINT==='1';
const targetedLongitudinalScale=Number(process.env.MALECNS_STALLED_ESCAPE_TARGETED_LONGITUDINAL_SCALE||1);
const targetedSteeringOnly=process.env.MALECNS_STALLED_ESCAPE_TARGETED_STEERING_ONLY==='1';
const targetedSteeringScale=Number(process.env.MALECNS_STALLED_ESCAPE_TARGETED_STEERING_SCALE||1);
const retainUnsafeFrontierParent=process.env.MALECNS_STALLED_ESCAPE_RETAIN_UNSAFE_FRONTIER==='1';
const exactTerminalContext=process.env.MALECNS_STALLED_ESCAPE_EXACT_TERMINAL==='1';
const stagedJointAfterGeneration=process.env.MALECNS_STALLED_ESCAPE_STAGED_JOINT_AFTER===undefined?null:Number(process.env.MALECNS_STALLED_ESCAPE_STAGED_JOINT_AFTER);
assert.ok(stagedJointAfterGeneration===null||Number.isInteger(stagedJointAfterGeneration)&&stagedJointAfterGeneration>=64,'Staged joint mutation must start at generation 64 or later');
const edgeSteering=process.env.MALECNS_STALLED_ESCAPE_EDGE_STEERING==='1';
const edgeMutationAction=process.env.MALECNS_STALLED_ESCAPE_EDGE_ACTION||'steering';
assert.ok(['steering','longitudinal'].includes(edgeMutationAction),'Edge mutation action must be steering or longitudinal');
const edgeLongitudinalReleaseOnly=process.env.MALECNS_STALLED_ESCAPE_EDGE_RELEASE_ONLY==='1';
assert.ok(!edgeLongitudinalReleaseOnly||edgeMutationAction==='longitudinal','Release-only mutation requires longitudinal action');
const edgeSteeringScale=Number(process.env.MALECNS_STALLED_ESCAPE_EDGE_STEERING_SCALE||1);
assert.ok(Number.isFinite(edgeSteeringScale)&&edgeSteeringScale>0&&edgeSteeringScale<=1,'Edge steering scale must be in (0, 1]');
assert.ok(!targetedSteeringOnly||(targetedEscape&&unsafeFrontierParent),'Targeted crash-context steering requires targeted mutation and unsafe-frontier exploration');
assert.ok(Number.isFinite(targetedSteeringScale)&&targetedSteeringScale>0&&targetedSteeringScale<=8,'Targeted steering scale must be in (0, 8]');
assert.ok(Number.isFinite(targetedLongitudinalScale)&&targetedLongitudinalScale>0&&targetedLongitudinalScale<=4,'Targeted longitudinal mutation scale must be in (0, 4]');
assert.ok(!retainUnsafeFrontierParent||unsafeFrontierParent,'Retaining an unsafe exploration parent requires unsafe-frontier exploration');
const sideRiskRate=Number(process.env.MALECNS_STALLED_ESCAPE_SIDE_RISK_RATE||0);
assert.ok(Number.isFinite(sideRiskRate)&&sideRiskRate>=0&&sideRiskRate<=200,'Side-risk rate must be in [0, 200]');
const traceOnly=process.env.MALECNS_STALLED_ESCAPE_TRACE_ONLY==='1';
const treatmentOnly=process.env.MALECNS_STALLED_ESCAPE_TREATMENT_ONLY==='1';
assert.equal(fs.existsSync(savePath),true,'User V3/Monza save is required');
assert.equal(fs.existsSync(out),false,'Refusing to overwrite a previous experiment');
const raw=fs.readFileSync(savePath),sha=value=>crypto.createHash('sha256').update(value).digest('hex'),saveSha=sha(raw);
const simFile=path.join(root,'outputs/simulation.js'),learningFile=path.join(root,'outputs/neural-learning.js');
const simSource=fs.readFileSync(simFile,'utf8'),learningSource=fs.readFileSync(learningFile,'utf8');
const expectedSaveSha='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
function replaceExactly(text,before,after,count=1){assert.equal(text.split(before).length-1,count,`Expected ${count} source matches for ${before}`);return text.replace(before,after);}
function makeLearning(escapeStalledContext){
  let text=learningSource,jointPhase=false;
  if(escapeStalledContext&&!targetedEscape&&!edgeSteering){
    const anchor='    for(const centre of sorted.slice(0,1)){';
    text=replaceExactly(text,anchor,"    if(focus!=='longitudinal')for(const centre of sorted.slice(0,1)){");
    if(jointEscape)text=replaceExactly(text,"    const focusedActions=focus==='longitudinal'?[1]:focus==='steering'?[0]:null;","    const focusedActions=focus==='longitudinal'?[0,1]:focus==='steering'?[0]:null;");
  }
  const compiled=new Module(learningFile,module);compiled.filename=learningFile;compiled.paths=Module._nodeModulePaths(path.dirname(learningFile));compiled._compile(text,learningFile);
  const learning=compiled.exports,stats={longitudinalEscapeMutations:0,targetedContextMutations:0,targetedSteeringMutations:0,edgeContextSamples:0,focusedReadoutMutations:0};
  if(escapeStalledContext&&edgeSteering){
    const remember=learning.rememberActivity,mutate=learning.safeMotorMutation,dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
    const orthogonal=(vector,basis)=>{const result=vector.slice();for(let pass=0;pass<2;pass++)for(const b of basis){const projection=dot(result,b);for(let j=0;j<result.length;j++)result[j]-=projection*b[j];}return result;};
    const motorVector=features=>[...features.map(value=>value/Math.sqrt(features.length)),1];
    learning.rememberActivity=(brain,car)=>{
      remember(brain);const features=brain.policyFeatures,speed=Number(car?.vehicle?.speedMps??car?.speed)||0,nearAsymmetry=Number(car?.physicsInputs?.[7])||0,brake=Number(car?.slowOutputs?.[2])||0;
      if(!features?.length||speed<(unsafeEdgeSteering?10:2.5)||Math.abs(nearAsymmetry)<.4||(!unsafeEdgeSteering&&brake<.05))return;
      const experience=brain.policyExperience||(brain.policyExperience={centres:[],samples:0}),contexts=experience.edgeContexts||(experience.edgeContexts=[]);
      contexts.push({values:Array.from(features),nearAsymmetry,speedMps:speed,brake});if(contexts.length>32)contexts.shift();stats.edgeContextSamples++;
    };
    learning.safeMotorMutation=(graph,values,r,amount,experience,focus)=>{
      const contexts=experience?.edgeContexts;if(focus!==edgeMutationAction||!contexts?.length)return mutate(graph,values,r,amount,experience,focus);
      const p=graph.learning,target=contexts[Math.floor(r()*contexts.length)],targetVector=motorVector(target.values),centres=experience.centres?.filter(c=>c.values?.length===p.nodes.length&&c.values.every(Number.isFinite)&&c.count>0)||[];
      const nearest=centres.reduce((best,centre)=>{const distance=centre.values.reduce((sum,value,index)=>sum+(value-target.values[index])**2,0);return !best||distance<best.distance?{centre,distance}:best;},null)?.centre,basis=[];
      for(const centre of centres){if(centre===nearest)continue;const projected=orthogonal(motorVector(centre.values),basis),length=Math.sqrt(dot(projected,projected));if(length>1e-7)basis.push(projected.map(value=>value/length));}
      const direction=orthogonal(targetVector,basis),response=dot(direction,targetVector);
      if(!(response>1e-7))return mutate(graph,values,r,amount,experience,focus);
      const actionIndex=edgeMutationAction==='steering'?0:1,scale=Math.max(0,amount)/.16,sign=edgeLongitudinalReleaseOnly?1:(r()<.5?-1:1),deltaOutput=sign*(.08+r()*.2)*scale*edgeSteeringScale,delta=direction.map(value=>value*deltaOutput/response),child=values.slice(),indices=Array.from({length:p.nodes.length},(_,j)=>p.readoutOffset+j*2+actionIndex);indices.push(values.length-2+actionIndex);
      const deltaNorm=Math.sqrt(dot(delta,delta));let shrink=deltaNorm>6?6/deltaNorm:1;for(let j=0;j<indices.length;j++)if(delta[j])shrink=Math.min(shrink,(8-Math.abs(values[indices[j]]))/Math.abs(delta[j]));
      for(let j=0;j<indices.length;j++)child[indices[j]]+=delta[j]*shrink*(1-1e-12);
      stats.targetedContextMutations++;stats.focusedReadoutMutations++;return child;
    };
  }else if(escapeStalledContext&&targetedEscape){
    const mutate=learning.safeMotorMutation,dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
    const orthogonal=(vector,basis)=>{const result=vector.slice();for(let pass=0;pass<2;pass++)for(const b of basis){const projection=dot(result,b);for(let j=0;j<result.length;j++)result[j]-=projection*b[j];}return result;};
    const motorVector=features=>[...features.map(value=>value/Math.sqrt(features.length)),1];
    learning.safeMotorMutation=(graph,values,r,amount,experience,focus,terminalFeatures)=>{
      const targetFocus=targetedSteeringOnly?'steering':'longitudinal';
      if(focus!==targetFocus||!terminalFeatures||terminalFeatures.length!==graph.learning.nodes.length||!experience?.centres?.length)return mutate(graph,values,r,amount,experience,focus);
      const p=graph.learning,centres=experience.centres.filter(c=>c.values?.length===p.nodes.length&&c.values.every(Number.isFinite)&&c.count>0);
      if(centres.length<2)return mutate(graph,values,r,amount,experience,focus);
      const nearest=centres.reduce((best,c)=>{const distance=c.values.reduce((sum,value,index)=>sum+(value-terminalFeatures[index])**2,0);return !best||distance<best.distance?{centre:c,distance}:best;},null);
      if(!nearest)return mutate(graph,values,r,amount,experience,focus);
      const target=exactTerminalContext?null:nearest.centre,targetFeatures=exactTerminalContext?terminalFeatures:target.values,
        targetVector=motorVector(targetFeatures),basis=[];
      for(const centre of centres){if(centre===target)continue;const projected=orthogonal(motorVector(centre.values),basis),length=Math.sqrt(dot(projected,projected));if(length>1e-7)basis.push(projected.map(value=>value/length));}
      const direction=orthogonal(targetVector,basis),response=dot(direction,targetVector);
      if(!(response>1e-7))return mutate(graph,values,r,amount,experience,focus);
      const child=values.slice(),actions=targetedSteeringOnly?[0]:targetedJointEscape||jointPhase?[0,1]:[1];
      for(const action of actions){
        const deltaOutput=action===1?(0.06+r()*0.18)*targetedLongitudinalScale:(r()-0.5)*0.24*(targetedSteeringOnly?targetedSteeringScale:1),delta=direction.map(value=>value*deltaOutput/response),indices=Array.from({length:p.nodes.length},(_,j)=>p.readoutOffset+j*2+action);indices.push(values.length-2+action);
        let shrink=1;for(let j=0;j<indices.length;j++)if(delta[j])shrink=Math.min(shrink,(8-Math.abs(values[indices[j]]))/Math.abs(delta[j]));
        for(let j=0;j<indices.length;j++)child[indices[j]]+=delta[j]*shrink*(1-1e-12);
      }
      if(targetedSteeringOnly)stats.targetedSteeringMutations++;else stats.longitudinalEscapeMutations++;
      stats.targetedContextMutations++;return child;
    };
  }else if(escapeStalledContext){const mutate=learning.safeMotorMutation;learning.safeMotorMutation=(...args)=>{if(args[5]==='longitudinal')stats.longitudinalEscapeMutations++;return mutate(...args);};}
  return {learning,stats,setJointPhase(value){jointPhase=Boolean(value);}};
}
function makeEngine(escapeStalledContext,fitnessFirst=false,sampleFraction=.1,sampleLongitudinalOnly=false,noLapProgressWeight=0,noLapProgressBucketMeters=0){
  const {learning,stats,setJointPhase}=makeLearning(escapeStalledContext),compiled=new Module(simFile,module);compiled.filename=simFile;compiled.paths=Module._nodeModulePaths(path.dirname(simFile));
  const nativeRequire=compiled.require.bind(compiled);compiled.require=request=>request==='./neural-learning.js'?learning:nativeRequire(request);
  let engineSource=simSource;
  if(escapeStalledContext&&unsafeFrontierParent){
    const original="      const frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'longitudinal':null;\n      let frontierParent=progressExplorer||(stagnantFrontier?safeProgressLeader:null);\n      let frontierParentSource=progressExplorer?'live-progress-explorer':frontierParent?'live-safe-leader':null;";
    const focus=unsafeEdgeSteering?`stagnantFrontier&&(unsafeProgressExplorer||safeLeaderStopped)?'${edgeMutationAction}':null`:targetedSteeringOnly?"stagnantFrontier&&(unsafeProgressExplorer||safeLeaderStopped)?'steering':null":"stagnantFrontier&&(unsafeProgressExplorer||safeLeaderStopped)?'longitudinal':null";
    const experimental=`      const unsafeProgressExplorer=stagnantFrontier&&progressLeader&&!isSafeLearningOutcome(progressLeader)&&safeProgressLeader&&progressLeader.bestProgress>safeProgressLeader.bestProgress+EVOLUTION_RULES.progressTieTolerance?progressLeader:null;\n      const frontierMutationFocus=${focus};\n      let frontierParent=progressExplorer||(stagnantFrontier?(unsafeProgressExplorer||safeProgressLeader):null);\n      let frontierParentSource=progressExplorer?'live-progress-explorer':unsafeProgressExplorer?'live-unsafe-progress-explorer':frontierParent?'live-safe-leader':null;`;
    engineSource=replaceExactly(engineSource,original,experimental);
  }
  if(escapeStalledContext&&retainUnsafeFrontierParent){
    const populationAnchor='      const genomes=[cloneGenome(selectionWinner?.genome||this.champion||(usesLearningOutcome&&baseMutation>0?makeLearningGenome(this.graph,this.random):winner.genome))];';
    const retain=`      const genomes=[cloneGenome(selectionWinner?.genome||this.champion||(usesLearningOutcome&&baseMutation>0?makeLearningGenome(this.graph,this.random):winner.genome))];
      if(unsafeProgressExplorer&&genomes.length<this.population&&!genomes.some(g=>JSON.stringify(g)===JSON.stringify(unsafeProgressExplorer.genome)))genomes.push(cloneGenome(unsafeProgressExplorer.genome));`;
    engineSource=replaceExactly(engineSource,populationAnchor,retain);
  }
  if(escapeStalledContext&&edgeSteering){
    engineSource=replaceExactly(engineSource,'Learning.rememberActivity(car.brain);','Learning.rememberActivity(car.brain,car);');
    if(!unsafeFrontierParent)engineSource=replaceExactly(engineSource,"frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'longitudinal':null;",`frontierMutationFocus=stagnantFrontier&&safeLeaderStopped?'${edgeMutationAction}':null;`);
  }
  if(escapeStalledContext&&targetedEscape)engineSource=replaceExactly(engineSource,'frontierParent.brain?.policyExperience,frontierMutationFocus)','frontierParent.brain?.policyExperience,frontierMutationFocus,frontierParent.brain?.policyFeatures)');
  if(escapeStalledContext&&sideRiskRate>0){
    const original=`    Rewards.step(track,car,{along:nearest.along,onRoad:track.explicitBoundaries?onRoad(track,car.x,car.y):nearest.distance<=track.halfWidth+5,\n      collision:collided(track,car),forwardClearance:raycast(track,car.x,car.y,car.heading),dt});`;
    const instrumented=`    const sideAsymmetry=Math.max(0,Math.min(1,Math.abs(Number(car.physicsInputs?.[7])||0))),sideAverage=Math.max(0,Math.min(1,Number(car.physicsInputs?.[10])||0)),sideRange=track.halfWidth<20?Math.max(32,Math.min(SENSOR_MAX,track.halfWidth*5)):SENSOR_MAX,sideClearanceM=sideAverage*sideRange*(1-sideAsymmetry)/(track.pixelsPerMeter||1),sideSpeed=Math.abs(car.vehicle?.speedMps??car.speed??0),sideExposure=Math.max(0,Math.min(1,(1.5-sideClearanceM)/1.5))*Math.max(0,Math.min(1,(sideSpeed-8)/16)),sideRiskCost=${sideRiskRate}*dt*sideExposure;\n    if(sideRiskCost>0&&car.rewardBreakdown?.penalties?.risk!==undefined){car.__edgeRiskPenalty=(Number(car.__edgeRiskPenalty)||0)+sideRiskCost;car.__edgeRiskProgressPenaltyM=(Number(car.__edgeRiskProgressPenaltyM)||0)+sideRiskCost*track.total/Rewards.RULES.progressPerLap;car.rewardBreakdown.penalties.risk+=sideRiskCost;car.penalty+=sideRiskCost;car.fitness=car.reward-car.penalty;}\n${original}`;
    engineSource=replaceExactly(engineSource,original,instrumented);
    const rankOriginal='if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;';
    const rankRiskAdjusted='if(aLaps===0){const aRiskAdjustedProgress=aProgress-(Number(a?.__edgeRiskProgressPenaltyM)||0),bRiskAdjustedProgress=bProgress-(Number(b?.__edgeRiskProgressPenaltyM)||0);if(Math.abs(aRiskAdjustedProgress-bRiskAdjustedProgress)>1e-9)return bRiskAdjustedProgress-aRiskAdjustedProgress;}';
    engineSource=replaceExactly(engineSource,rankOriginal,rankRiskAdjusted);
  }
  if(fitnessFirst)engineSource=replaceExactly(engineSource,'if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;','if(false&&aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;');
  if(noLapProgressWeight>0){
    const anchor='if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;',
      weighted=`if(aLaps===0){const aScore=(Number.isFinite(a?.fitness)?a.fitness:-Infinity)+${noLapProgressWeight}*aProgress,bScore=(Number.isFinite(b?.fitness)?b.fitness:-Infinity)+${noLapProgressWeight}*bProgress;if(Math.abs(aScore-bScore)>1e-9)return bScore-aScore;}`;
    engineSource=replaceExactly(engineSource,anchor,weighted);
  }
  if(noLapProgressBucketMeters>0){
    const anchor='if(aLaps===0&&Math.abs(aProgress-bProgress)>1e-9)return bProgress-aProgress;',
      bucketed=`if(aLaps===0){const aBucket=Math.floor(aProgress/${noLapProgressBucketMeters}),bBucket=Math.floor(bProgress/${noLapProgressBucketMeters});if(aBucket!==bBucket)return bBucket-aBucket;}`;
    engineSource=replaceExactly(engineSource,anchor,bucketed);
  }
  if(sampleFraction!==.1)engineSource=replaceExactly(engineSource,'Math.floor(this.population*.1)',`Math.floor(this.population*${sampleFraction})`);
  if(sampleLongitudinalOnly){
    const anchor=`        if(optimizerSampleCount<optimizerSampleTarget&&this.optimizer&&winner.genome.policyWeights){
          const child=cloneGenome(selectionWinner?.genome||winner.genome);
          child.policyWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation);
          genomes.push(child);optimizerSampleCount++;continue;
        }`;
    const masked=`        if(optimizerSampleCount<optimizerSampleTarget&&this.optimizer&&winner.genome.policyWeights){
          const child=cloneGenome(selectionWinner?.genome||winner.genome),sampledWeights=this.optimizer.sample(this.random,mutationAmount*.35,this.stagnation),policy=this.graph.learning;
          for(let j=0;j<policy.nodes.length;j++){const index=policy.readoutOffset+j*2+1;child.policyWeights[index]=sampledWeights[index];}
          child.policyWeights[child.policyWeights.length-1]=sampledWeights[sampledWeights.length-1];
          genomes.push(child);optimizerSampleCount++;continue;
        }`;
    engineSource=replaceExactly(engineSource,anchor,masked);
  }
  compiled._compile(engineSource,simFile);
  return {Simulation:compiled.exports.Simulation,compareAgents:compiled.exports.compareAgents,locate:compiled.exports.locate,onRoad:compiled.exports.onRoad,trackWidthAt:compiled.exports.trackWidthAt,rng:compiled.exports.rng,stats,setJointPhase};
}
const Legacy=require('../outputs/legacy-models.js'),Progress=require('../outputs/progress-save.js'),Rewards=require('../outputs/rewards.js'),circuits=require('../outputs/data/circuits.json'),compact=require('../outputs/data/connectome.json');
function makeData(){return Legacy.tagV3(compact);}
function safe(car){const p=car.rewardBreakdown?.penalties||{};return !['urto','fuori pista','progresso non valido','collision','off track','invalid progress'].includes(String(car.reason||'').trim().toLowerCase())&&!(Number(p.collision)>0)&&!(Number(p.offTrack)>0)&&!(Number(p.invalid)>0);}
async function main(){
  assert.equal(process.versions.node,'24.19.0','Pinned Node 24.19.0 runtime required');
  const currentHashes={simulation:sha(simSource),learning:sha(learningSource)};
  const decoded=await Progress.decode(raw.toString('utf8'),'5.6.0'),state=decoded.payload.workers[0].state;
  assert.equal(decoded.appVersion,'5.6.0');assert.equal(decoded.payload.modelId,'v3');assert.equal(decoded.payload.circuitId,'monza');
  assert.equal(state.generation,64);assert.equal(state.population,40);assert.equal(state.seed,7717);assert.equal(state.rewardRevision,'progress-3');
  assert.equal(saveSha,expectedSaveSha,'The user save differs from the explicitly supplied, previously verified V3/Monza file');
  if(rewardRevisionTreatment)assert.ok(Rewards.SUPPORTED_REVISIONS.includes(rewardRevisionTreatment),'Unsupported treatment reward revision');
  // A reward revision applied to both arms is a matched condition, not a
  // reward-only experiment. Keep the requested mutation treatment enabled in
  // that case; otherwise the report can claim targeted settings while silently
  // running an ordinary reward-only A/B.
  const treatmentEscapeEnabled=!populationOnly&&(!rewardRevisionOnly||rewardRevisionBoth);
  const engines={control:makeEngine(false,false,optimizerSampleFractionControl),treatment:makeEngine(treatmentEscapeEnabled,fitnessFirstNoLap,optimizerSampleFraction,optimizerSampleLongitudinalOnly,progressWeightNoLap,progressBucketNoLapMeters)};
  function run(label,engine,isTreatment=false){
    const descriptor=new engine.Simulation(makeData(),{modelId:'v3',population:4,circuitId:'monza',circuits,seed:state.seed});
    Progress.validatePayload(decoded.payload,{graph:descriptor.graph,circuits:descriptor.circuits});
    const sim=new engine.Simulation(makeData(),{modelId:'v3',population:4,circuitId:'monza',circuits,seed:state.seed});Progress.restore(sim,structuredClone(state));if(postCheckpointSeed!==null)sim.random=engine.rng(postCheckpointSeed);sim.population=isTreatment?treatmentPopulation:controlPopulation;sim.running=true;
    const records=[],trails=new Map(),snapshot=(car,s)=>{
      const track=s.track,ppm=track.pixelsPerMeter||1,p=engine.locate(track,car.x,car.y),seg=track.segments.find(item=>p.along>=item.start-1e-8&&p.along<=item.start+item.length+1e-8)||track.segments.at(-1),angle=Math.atan2(seg.b.y-seg.a.y,seg.b.x-seg.a.x),dx=car.x-p.x,dy=car.y-p.y,v=car.vehicle||{};
      return {tick:s.ticks,x:car.x,y:car.y,heading:car.heading,alongM:p.along/ppm,bestProgressM:car.bestProgress/ppm,centerOffsetM:(-dx*Math.sin(angle)+dy*Math.cos(angle))/ppm,centerDistanceM:p.distance/ppm,
        localTrackWidthM:engine.trackWidthAt(track,p.along).widthMeters,onRoad:engine.onRoad(track,car.x,car.y),speedMps:v.speedMps??car.speed??0,u:v.u??null,v:v.v??null,yawRate:v.r??car.yawRate??0,steeringAngle:v.steeringAngle??null,
        gear:v.gear??null,rpm:v.rpm??null,tcActive:v.tcActive??null,absActive:v.absActive??null,longitudinalG:car.longitudinalG??null,lateralG:car.lateralG??null,totalG:car.totalG??null,loadTransfer:car.loadTransfer??null,slipAngle:car.slipAngle??null,
        outputs:car.outputs?.slice()??null,visualSensors:car.inputs?.slice()??null,physicsSensors:car.physicsInputs?.slice()??null,neuralFeatures:car.brain?.policyFeatures?Array.from(car.brain.policyFeatures):null};
    };
    for(let episode=0;episode<generationsPerArm;episode++){
      const generation=sim.generation;engine.setJointPhase?.(stagedJointAfterGeneration!==null&&generation>=stagedJointAfterGeneration);let ticks=0,terminal=null;
      sim.onTrialTick=s=>{
        if(traceOnly&&(s.ticks%6===0||s.cars.every(c=>!c.alive)))for(const car of s.cars){const rows=trails.get(car.id)||[];if(rows.at(-1)?.tick!==s.ticks)rows.push(snapshot(car,s));if(rows.length>240)rows.shift();trails.set(car.id,rows);}
        if(s.cars.every(c=>!c.alive)){
          const cars=s.cars.filter(c=>!c.diagnosticVehicle),summaries=cars.map(c=>({id:c.id,progressM:c.bestProgress/(s.track.pixelsPerMeter||1),riskAdjustedProgressM:c.bestProgress/(s.track.pixelsPerMeter||1)-(Number(c.__edgeRiskProgressPenaltyM)||0),edgeRiskPenalty:Number(c.__edgeRiskPenalty)||0,laps:c.laps,reason:c.reason,rewardRevision:c.rewardRevision,safe:safe(c),fitness:c.fitness,gas:c.outputs?.[1]??0,brake:c.outputs?.[2]??0})).sort((a,b)=>a.id-b.id);
          if(traceOnly){
            const safeLeader=summaries.filter(c=>c.safe).sort((a,b)=>b.progressM-a.progressM||b.fitness-a.fitness)[0]||null,rawLeader=summaries.slice().sort((a,b)=>b.progressM-a.progressM)[0]||null,traceIds=new Set([safeLeader?.id,rawLeader?.id].filter(Number.isInteger));
            terminal=summaries.map(summary=>{
              if(!traceIds.has(summary.id))return summary;
              const car=cars.find(item=>item.id===summary.id),rows=(trails.get(summary.id)||[]).slice(),features=car.brain?.policyFeatures?Array.from(car.brain.policyFeatures):[],centres=(car.brain?.policyExperience?.centres||[]).map((centre,index)=>({rank:index+1,count:centre.count,values:centre.values}));
              const nearest=features.length?centres.map(c=>({...c,rms:Math.sqrt(c.values.reduce((sum,value,index)=>sum+(value-features[index])**2,0)/features.length)})).sort((a,b)=>a.rms-b.rms)[0]||null:null;
              return {...summary,trace:rows,terminalBrain:{featureCount:features.length,policyExperienceSamples:car.brain?.policyExperience?.samples||0,contextCentres:centres.length,nearestTerminalContext:nearest?{rank:nearest.rank,count:nearest.count,featureRms:nearest.rms}:null}};
            });
          }else terminal=summaries;
        }
      };
      while(sim.generation===generation&&ticks<14000){sim.tick();ticks++;}
      if(sim.generation===generation||!terminal)throw Error(`${label}: generation ${generation} did not end naturally`);
      if((isTreatment||rewardRevisionBoth)&&rewardRevisionTreatment&&generation===64){sim.rewardRevision=rewardRevisionTreatment;for(const car of sim.cars)car.rewardRevision=rewardRevisionTreatment;}
      const history=sim.history.at(-1),safeLeader=terminal.filter(c=>c.safe).sort((a,b)=>b.progressM-a.progressM||b.fitness-a.fitness)[0]||null;
      records.push({generation:history.generation,rewardRevision:history.rewardRevision,ticks,bestProgressM:Math.max(...terminal.map(c=>c.progressM)),meanProgressM:terminal.reduce((sum,c)=>sum+c.progressM,0)/terminal.length,
        maxLaps:Math.max(...terminal.map(c=>c.laps)),safeAgentCount:terminal.filter(c=>c.safe).length,safeProgressLeader:safeLeader,safeRiskAdjustedProgressLeader:terminal.filter(c=>c.safe).sort((a,b)=>b.riskAdjustedProgressM-a.riskAdjustedProgressM||b.fitness-a.fitness)[0]||null,
        optimizerSampleCount:sim.lastOptimizerSampleCount,frontierOffspringCount:sim.lastFrontierOffspringCount,frontier:{...sim.lastFrontierDiagnostics},terminal});
      if(isTreatment&&rewardRevisionTreatment&&generation>64){assert.equal(history.rewardRevision,rewardRevisionTreatment,'Treatment generation history did not use the requested reward revision');assert.ok(sim.cars.every(car=>car.rewardRevision===rewardRevisionTreatment),'Treatment cars did not receive the requested reward revision');}
    }
    return {label,records,escapeMutationCalls:engine.stats.longitudinalEscapeMutations,targetedContextMutations:engine.stats.targetedContextMutations,
      focusedReadoutMutations:engine.stats.focusedReadoutMutations,edgeContextSamples:engine.stats.edgeContextSamples};
  }
  const control=traceOnly||treatmentOnly?null:run('current mutation anchor',engines.control),treatment=run(fitnessFirstNoLap?'safe fitness-first pre-lap ranking':rewardRevisionOnly?`reward revision ${rewardRevisionTreatment} treatment`:populationOnly?'population-only treatment':unsafeEdgeSteering?`unsafe near-edge parent with neural ${edgeMutationAction} mutation`:edgeSteering?`near-edge ${edgeMutationAction} exploration`:targetedEscape?'targeted terminal-context longitudinal exploration':unsafeFrontierParent?'unsafe-progress parent with joint neural motor mutation':'release anchor only for stalled longitudinal escape',engines.treatment,true);
  if(targetedEscape&&treatmentEscapeEnabled&&!traceOnly)assert.ok(treatment.targetedContextMutations>0,'Targeted treatment was enabled in metadata but applied no targeted mutation; refusing to emit a misleading A/B report');
  const saveUnchanged=sha(fs.readFileSync(savePath))===saveSha;assert.equal(saveUnchanged,true,'Original user save changed');
  const generation64Projection=records=>records?.[0]?.terminal.map(({id,progressM,laps,reason})=>({id,progressM,laps,reason}))||null,
    pairedGeneration64Match=Boolean(control&&treatment&&JSON.stringify(generation64Projection(control.records))===JSON.stringify(generation64Projection(treatment.records)));
  if(control&&treatment)assert.equal(pairedGeneration64Match,true,'Current-source control and treatment must match every generation-64 outcome before their populations diverge');
  const report={format:fitnessFirstNoLap?'male-cns-saved-v3-ranking-ab-v1':rewardRevisionOnly&&!rewardRevisionBoth&&!targetedEscape?'male-cns-saved-v3-reward-revision-ab-v1':traceOnly?'male-cns-saved-v3-stalled-context-telemetry-v1':treatmentOnly?'male-cns-saved-v3-stalled-context-treatment-v1':'male-cns-saved-v3-stalled-context-escape-ab-v1',appVersion:'5.6.0',passed:saveUnchanged&&(!control||!treatment||pairedGeneration64Match),learningSucceeded:treatment.records.some(r=>r.maxLaps>=2),
    save:{sha256:saveSha,unchanged:saveUnchanged,model:'V3',circuit:'Monza',generation:64,seed:state.seed,population:state.population,rewardRevision:state.rewardRevision},
    pairedGeneration64Match,
    sourceHashes:currentHashes,settings:{matchedStart:true,generationsPerArm,controlPopulation,treatmentPopulation,populationOnly,rewardRevisionTreatment,rewardRevisionBoth,treatmentEscapeEnabled,fitnessFirstNoLap,optimizerSampleFractionControl,optimizerSampleFractionTreatment:optimizerSampleFraction,optimizerSampleLongitudinalOnly,progressWeightNoLapTreatment:progressWeightNoLap,progressBucketNoLapTreatmentMeters:progressBucketNoLapMeters,postCheckpointSeed,jointEscape,unsafeFrontierParent,retainUnsafeFrontierParent,unsafeEdgeSteering,targetedEscape,targetedJointEscape,targetedSteeringOnly,targetedSteeringScale,targetedLongitudinalScale,exactTerminalContext,stagedJointAfterGeneration,edgeSteering,edgeMutationAction,edgeLongitudinalReleaseOnly,edgeSteeringScale,traceOnly,treatmentOnly,mutation:state.mutation,selectionAndRewards:'current source',runtime:useCuda?'Node 24.19.0 V3 compact graph with exact CUDA neural pass':'Node 24.19.0 CPU V3 compact graph'},
    method:`${traceOnly?'The telemetry-only treatment':treatmentOnly?'The treatment-only continuation':'Both matched arms'} restore the exact same validated generation-64 user save and must reproduce all 40 generation-64 outcomes exactly. ${traceOnly?(edgeSteering?'The treatment replays the low-amplitude near-edge '+edgeMutationAction+' exploration and records physical and neural telemetry for the safe leader and raw leader. ':'The treatment runs the already-tested targeted motor mutation and records physical and neural telemetry for the safe leader and raw leader. '):edgeSteering?'The treatment records a rolling set of neural features only when the actual near-road asymmetry sensor is high, speed exceeds 2.5 m/s, and the current neural brake output is at least 0.05; safe stopped-leader offspring then receive a '+(edgeLongitudinalReleaseOnly?'positive longitudinal (brake-release)':'random-sign, localized '+edgeMutationAction+'-readout')+' mutation at one of those observed contexts, with other learned contexts projected out. ':!traceOnly?'The treatment changes only safeMotorMutation: ':''}${edgeSteering?'The population selects among the '+(edgeLongitudinalReleaseOnly?'brake-release direction':edgeMutationAction+' directions')+' through unchanged physical simulation and rewards; no route or action target is added.':targetedEscape&&!traceOnly?(targetedSteeringOnly?'it nudges the steering readout at '+(exactTerminalContext?'the exact terminal neuronal feature vector':'the stored neural context nearest the unsafe terminal brain features'):'it nudges the longitudinal readout at '+(exactTerminalContext?'the exact terminal neuronal feature vector':'the stored neural context nearest the actual terminal brain features')+(targetedJointEscape?'; it also explores the learned steering readout at that same context':''))+'; other stored contexts are projected out':!traceOnly&&!traceOnly?'for the existing longitudinal focus triggered by a stopped no-gas safe leader, it does not preserve the dominant policy output at the most frequently observed neural context'+(jointEscape?'; the same mutation also explores learned steering readout weights jointly with longitudinal weights':'; it explores learned longitudinal readout weights only'):''}${retainUnsafeFrontierParent?' The treatment carries one unsafe high-progress policy forward as an isolated exploration genome only; it cannot be selected as the safe champion, optimizer winner or safe archive entry.':''}. It adds no route, teacher action, controller, physics or reward signal.`,
    control,treatment,comparison:control?treatment.records.map((r,i)=>({generation:r.generation,bestProgressDeltaM:r.bestProgressM-control.records[i].bestProgressM,meanProgressDeltaM:r.meanProgressM-control.records[i].meanProgressM,safeLeaderDeltaM:(r.safeProgressLeader?.progressM??0)-(control.records[i].safeProgressLeader?.progressM??0),lapDelta:r.maxLaps-control.records[i].maxLaps})):[],
    experimentalLineage:unsafeFrontierParent?`The unsafe maximum-progress policy may seed exploration offspring only; it remains excluded from learning rank, optimizer winner, champion and safe archive. ${unsafeEdgeSteering?`The treatment mutates ${edgeMutationAction} in observed neural states above 10 m/s with strong road-sensor asymmetry, without requiring an active brake command.`:'The treatment mutates learned motor readouts jointly.'} Offspring are judged with the unchanged physical simulation and rewards.`:null,
    edgeContextSelection:unsafeEdgeSteering?'Observed neural contexts require speed >= 10 m/s and absolute near-road asymmetry >= 0.4; brake is not required.':null,
    stagedMutation:stagedJointAfterGeneration===null?null:`Use targeted longitudinal mutations initially, then enable targeted steering plus longitudinal mutations from evaluated generation ${stagedJointAfterGeneration}; terminal neural features and ordinary safe physical selection remain in use.`,
    boundary:`${generationsPerArm} natural generation(s) from one V3/Monza save ${traceOnly?'provide diagnostic telemetry, not':treatmentOnly?'are an unpaired continuation, not a matched comparison, and do not establish':'can detect a local effect only; they do not establish'} general convergence or two completed laps. No app source, save, version, release, portable, installer or model weights were changed or promoted.`};
  report.settings.treatmentPopulation=treatmentPopulation;
  report.settings.populationOnly=populationOnly;
  report.settings.controlPopulation=controlPopulation;
  report.settings.rewardRevisionTreatment=rewardRevisionTreatment;
  report.populationTreatment={savedGenerationPopulation:state.population,controlPopulationAfterGeneration64:controlPopulation,treatmentPopulationAfterGeneration64:treatmentPopulation,appliedAfterExactGeneration64Replay:true};
  if(progressWeightNoLap>0){report.progressRegularizedRanking={weight:progressWeightNoLap,score:'actual penalized fitness + weight × safe progress metres, only before the first completed lap',control:'current safe-progress-first comparator',treatment:'progress-regularized penalized score',appliedAfterExactGeneration64Replay:true};report.settings.selectionAndRewards='control retains safe-progress-first ranking; treatment uses actual penalized fitness plus weighted safe progress before the first lap';}
  if(progressBucketNoLapMeters>0){report.progressBucketRanking={widthMeters:progressBucketNoLapMeters,score:'descending safe-progress bucket, then actual penalized fitness within the same bucket; only before the first completed lap',control:'current safe-progress-first comparator',treatment:'safe-progress bucket then penalized fitness',appliedAfterExactGeneration64Replay:true};report.settings.selectionAndRewards='control retains exact safe-progress-first ranking; treatment ranks safe progress buckets then penalized fitness';}
  if(fitnessFirstNoLap){report.rewardRevisionTreatment={from:state.rewardRevision,to:rewardRevisionTreatment,appliedAfterExactGeneration64Replay:true,appliedToBothArms:rewardRevisionBoth,controlPopulation,treatmentPopulation};report.method=`Matched in-memory safe-ranking test: both arms replay the exact same generation-64 V3/Monza save, then use ${controlPopulation} agents, unchanged mutation, ${rewardRevisionBoth?rewardRevisionTreatment:'saved reward revision'}, and unchanged physics. Control retains the current safe-progress-first no-lap comparator; treatment preserves safe/lap priority but compares the actual penalized fitness before exact safe progress when both agents have zero laps. It adds no route, teacher action, steering/braking controller, reward formula or physics change. The user save and history remain untouched.`;}
  else if(rewardRevisionOnly){report.rewardRevisionTreatment={from:state.rewardRevision,to:rewardRevisionTreatment,appliedAfterExactGeneration64Replay:true,controlPopulation,treatmentPopulation};report.method=`Matched in-memory reward-revision test: both arms restore the exact same validated V3/Monza generation-64 save and replay the saved 40-agent episode identically. From generation 65, both arms use ${treatmentPopulation} agents and unchanged current-source policy, mutation, selection and physics; control preserves the saved ${state.rewardRevision} reward rules, while treatment applies ${rewardRevisionTreatment} only to newly spawned treatment agents. The save and historical scores remain untouched; no route, teacher action, controller, or reward/physics formula is edited.`;}
  else if(populationOnly){report.method=`Matched population-only test: both arms restore the exact same validated V3/Monza generation-64 user save and must reproduce all 40 generation-64 outcomes exactly. Both use current-source mutation, rewards, policy, and physics; only the treatment population changes to ${treatmentPopulation} after generation 64. No route, teacher action, controller, reward, physics, or mutation change is introduced.`;}
  else report.method+=` The matched generation-64 save remains at its original 40 cars in both arms; after that exact replay, the treatment uses ${treatmentPopulation} cars per generation together with the terminal-context mutation. This is a combined treatment, not an isolated estimate of population or mutation effects.`;
  if(postCheckpointSeed!==null)report.postCheckpointSeed={seed:postCheckpointSeed,scope:'evolutionary random stream after the exact saved generation-64 state is restored; car state and generation-64 physical replay are unchanged',pairedAcrossArms:true};
  if(optimizerSampleFraction!==.1||optimizerSampleFractionControl!==.1||optimizerSampleLongitudinalOnly)report.method=`Matched in-memory optimizer-sampling A/B: both arms replay the exact same generation-64 V3/Monza save, use ${controlPopulation} agents, identical reward revision, selection, mutation operators and physics. Control draws ${Math.round(optimizerSampleFractionControl*100)}% of non-elite offspring from the EvolutionStrategy distribution; treatment draws ${Math.round(optimizerSampleFraction*100)}%${optimizerSampleLongitudinalOnly?' and copies only the learned longitudinal descending-neuron readout and longitudinal bias from each ES sample onto the selected parent genome':''}. The remaining descendants, elites, frontier lineage and immigrants retain current-source rules. No action, route, teacher signal or physics is added.`;
  if(progressWeightNoLap>0)report.method=`Matched in-memory pre-lap ranking A/B: both arms replay the exact same generation-64 V3/Monza save, use ${controlPopulation} agents and identical R5 reward, mutation operators, ES sampling and physics. Control retains safe-progress-first ranking. Treatment ranks safe zero-lap policies by actual penalized fitness plus ${progressWeightNoLap} points per safe progress metre; it changes no reward formula, controller, action, route, teacher signal or physics.`;
  if(progressBucketNoLapMeters>0)report.method=`Matched in-memory pre-lap ranking A/B: both arms replay the exact same generation-64 V3/Monza save, use ${controlPopulation} agents and identical R5 reward, mutation operators, ES sampling and physics. Control retains exact safe-progress-first ranking. Treatment ranks by ${progressBucketNoLapMeters} m safe-progress buckets and then actual penalized fitness within a bucket; it changes no reward formula, controller, action, route, teacher signal or physics.`;
  if(useCuda){report.cuda=Cuda.stats();assert.ok(report.cuda.gpuCalls>0,'CUDA replay must execute real GPU calls');assert.equal(report.cuda.cpuFallbacks,0,'CUDA replay must not fall back to CPU');}
  if(sideRiskRate>0){
    report.settings.sideRiskRate=sideRiskRate;
    report.settings.selectionAndRewards='matched control plus diagnostic lateral-risk penalty and risk-adjusted pre-lap ranking in treatment';
    report.sideRiskExperiment={ratePointsPerSecond:sideRiskRate,clearanceMarginMeters:1.5,minimumSpeedMps:8,asymmetryPhysicsSensorIndex:7,averageFootprintClearanceSensorIndex:10,ranking:'before the first lap, compare safe progress minus the lateral-risk penalty converted into equivalent progress metres',treatmentOnly:true,noActionTarget:true};
    report.method='Matched replay from the exact V3/Monza generation-64 save. Control uses current source behavior. Treatment adds a soft penalty from the existing near-side asymmetry and average Porsche-footprint clearance sensors above 8 m/s, and ranks safe pre-lap policies by progress minus risk converted to equivalent metres. It adds no desired steering/braking actions or route; the physical simulator and collision checks remain unchanged.';
    report.boundary=report.boundary.replace('No app source, save, version, release, portable, installer or model weights were changed or promoted.','No app source, save, version, release, portable or installer was changed; diagnostic weights evolved in memory and were not saved or promoted.');
    if(control)report.comparison=report.comparison.map((row,index)=>({...row,safeRiskAdjustedLeaderDeltaM:(treatment.records[index].safeRiskAdjustedProgressLeader?.riskAdjustedProgressM??0)-(control.records[index].safeRiskAdjustedProgressLeader?.riskAdjustedProgressM??0)}));
  }
  if(unsafeEdgeSteering){
    report.method=`${traceOnly?'The telemetry-only replay':treatmentOnly?'The treatment-only continuation':'Both matched arms'} restore the same validated generation-64 V3/Monza save. Neural contexts are observed only above 10 m/s and when absolute near-road asymmetry exceeds 0.4; an active brake command is not required. ${traceOnly?'The treatment records physical and neural telemetry without changing weights.':`Unsafe-frontier offspring receive a random-sign, localized ${edgeMutationAction}-readout mutation at an observed context; ordinary safe physical outcomes and unchanged rewards determine selection.`} No route, teacher action, controller, physics, reward signal, or user save is changed.`;
  }
  fs.mkdirSync(out,{recursive:false});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx'});
  console.log('STALLED_CONTEXT_ESCAPE_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,saveUnchanged,
    control:control?.records.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,safeProgressLeader:r.safeProgressLeader?.progressM,maxLaps:r.maxLaps}))||null,
    treatment:treatment.records.map(r=>({generation:r.generation,bestProgressM:r.bestProgressM,safeProgressLeader:r.safeProgressLeader?.progressM,safeRiskAdjustedProgressLeader:r.safeRiskAdjustedProgressLeader?.riskAdjustedProgressM,maxLaps:r.maxLaps,frontier:r.frontier})),
    mutationCalls:treatment.escapeMutationCalls,targetedContextMutations:treatment.targetedContextMutations,targetedSteeringMutations:treatment.targetedSteeringMutations,comparison:report.comparison,report:path.join(out,'report.json')}));
}
main().catch(error=>{try{Cuda?.close();}catch{}console.error(error.stack||error);process.exitCode=1;}).finally(()=>{try{Cuda?.close();}catch{}});
