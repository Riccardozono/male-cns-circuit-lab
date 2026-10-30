'use strict';
// Distinct research sampler: retained real MaleCNS + parent's neural stages,
// trainable original18 head coefficients, Gaussian noise BEFORE head tanh.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-statehead-cuda-model.cjs'),
 Parent=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead-gate.cjs'),Motor=require('./neural-command-residual.cjs'),
 Live=require('./neural-statehead-rl-live.cjs'),X=require('./learned-neural-exploration.cjs'),Identity=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function mean(features,weights,gain=1){return [0,1].map(a=>features.reduce((sum,f,k)=>sum+f*(weights[k*2+a]*gain),0)/3*(a===0?.2:1));}
function config(){return {format:'learned-neural-log-sigma-v1',rho:.9,floor:[1e-6,1e-5],ceiling:[.1,.5],initial:[.0005,.005],weights:Array(20).fill(0)};}
function create({basisOverride=null,instantGate=false,extraPrefixControls=[]}={}){
 if(!Array.isArray(extraPrefixControls)||extraPrefixControls.length>8||extraPrefixControls.some(v=>!Number.isInteger(v)||v<1||v>10000))throw Error('Bounded observed prefix controls required');
 const choice=Model.defaultChoice(),loaded=Model.load(choice.file),gain=loaded.data.provenance?.motorCorrectionGain??1,
   parent=Parent.controller(loaded.core.parent),activeBasis=basisOverride?structuredClone(basisOverride):loaded.data.basis,
   head=State.create({...loaded.data,basis:activeBasis},{instantGate}),episodes=[],prefixes=new Map();
 if(loaded.data.provenance?.physicsSafety)throw Error('Protected parent requires an explicitly modeled safety transform');
 let genes=basisOverride?Array(18).fill(0):loaded.data.weights.slice(),exploration=null,previous=null,random=null,pending=null,gateFloor=0,gateFloorMode='both',lastNeuralInput=null;
 function validGateFloorMode(value){if(!['both','steer-only','longitudinal-only','none'].includes(value))throw Error('Unknown gate floor axis mode');return value;}
 function composeAxes(prior,gates,residual){if(gates[0]===gates[1])return Motor.compose(prior,gates[0],residual);const clamp=v=>Math.max(-1,Math.min(1,v)),steer=clamp(prior[0]+2*gates[0]*residual[0]),long=clamp(prior[1]-prior[2]+2*gates[1]*residual[1]);return [steer,Math.max(0,long),Math.max(0,-long)];}
 function uniformGenerator(seed){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
 function sample(){return Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());}
 let sign=1,env;
 env=Live.create(loaded.modelFile,{modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
   onReset:()=>{parent.reset();head.reset();previous=null;lastNeuralInput=null;},
   actionOverride:(_model,raw)=>{lastNeuralInput=Array.from(raw);const old=parent.observe(raw);head.observe(raw);return old;},
   motorOverride:(_model,_raw,prior,car)=>{
     const actualPrior=parent.compose(prior),features=head.features(),radialGate=head.value(),mu=mean(features,genes,gain),
       neural=env.graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7),gate=neural&&radialGate===0?gateFloor:radialGate,
       gateAxes=neural&&radialGate===0?[gateFloorMode==='longitudinal-only'||gateFloorMode==='none'?0:gateFloor,gateFloorMode==='steer-only'||gateFloorMode==='none'?0:gateFloor]:[radialGate,radialGate],active=gateAxes.some(v=>v>0)&&neural,
       sigma=exploration?X.scale(features,exploration).sigma:[0,0],conditional=exploration?X.conditional(mu,sigma,active?previous:null,exploration.rho):{mean:mu,std:sigma},
       action=exploration&&active?conditional.mean.map((v,a)=>v+sign*conditional.std[a]*sample()):mu.slice(),
       deterministic=head.compose(actualPrior,genes.map(v=>v*gain),gateAxes[0]===gateAxes[1]?gateAxes[0]:gate),composed=composeAxes(actualPrior,gateAxes,action.map(Math.tanh));
     if(!exploration&&gateAxes[0]===gateAxes[1]&&JSON.stringify(composed)!==JSON.stringify(deterministic))throw Error('Head formula differs from protected native composition');
     const commands=!neural?[0,0,0]:exploration&&active?composed:deterministic;
     pending={features,gate,gateAxes,radialGate,prior:actualPrior,mean:mu,sigma,conditionalMean:conditional.mean,conditionalStd:conditional.std,action,commands,active,neuralInputVector:lastNeuralInput?.slice()||null};
     previous=exploration&&active?{mean:mu,sigma,action}:null;return commands;
   }});
 function result(state){return {bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,
    totalSimulationSeconds:state.totalSimulationSeconds,complete:state.complete,lapTimes:state.lapTimes.slice()};}
 function initialise(){
   let state=env.state(),controls=0;const trace=crypto.createHash('sha256'),markers=new Set([7800,8200,...extraPrefixControls]);
   while(!state.complete){state=env.step();controls++;const c=state.car;trace.update(JSON.stringify([state.bestProgress,state.totalSimulationSeconds,c.outputs])+'\n');
     if(markers.has(controls)){const key='observed-'+controls;prefixes.set(key,{live:env.capture(),parent:parent.capture(),head:head.capture(),
       source:{control:controls,ticks:state.ticks,progress:state.bestProgress,laps:state.laps,fitness:state.fitness,modelSha256:choice.modelSha256}});}}
   const observed=result(state),digest=trace.digest('hex');
   if(basisOverride){const expected=loaded.core.parent.data.expectedResult,view={bestProgress:expected.bestProgress,fitness:expected.fitness,laps:expected.laps,reason:expected.reason,totalSimulationSeconds:expected.totalSimulationSeconds,complete:expected.complete,lapTimes:expected.lapTimes};
     if(JSON.stringify(observed)!==JSON.stringify(view))throw Error('Zero-correction basis override parent-result mismatch: observed='+JSON.stringify(observed)+' expected='+JSON.stringify(view));
     if(digest!==loaded.core.parent.data.fullTraceSha256)throw Error('Zero-correction basis override trace mismatch: observedSha256='+digest+' expectedSha256='+loaded.core.parent.data.fullTraceSha256);
   }else{if(JSON.stringify(observed)!==JSON.stringify(choice.expected))throw Error('Sampler does not reproduce protected complete one-lap outcome');
     const fresh=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/statehead-best-fresh-replay-20261025-01/report.json'),'utf8'));
     if(!fresh.passed||fresh.modelSha256!==choice.modelSha256||fresh.traceSha256!==digest)throw Error('Every sampled body/command trace must match the fresh protected replay');}
   return {observed,controls,traceSha256:digest};
 }
 const baseline=initialise();
 function reset(weights,which='from-line',c=null,seed=7717,noiseSign=1){
   State.weights(weights);if(c)X.validate(c,9);if(!Number.isInteger(seed)||![1,-1].includes(noiseSign))throw Error('Valid stochastic seed/sign required');
   genes=weights.slice();exploration=c?structuredClone(c):null;sign=noiseSign;random=uniformGenerator(seed);previous=null;pending=null;
   if(which==='from-line')return env.reset();const p=prefixes.get(which);if(!p)throw Error('Unknown own observed context');
   const state=env.restore(p.live);parent.restore(p.parent);head.restore(p.head);return state;
 }
 function boundedGateFloor(value){if(!Number.isFinite(value)||value<0||value>.01)throw Error('Research gate floor must be between0and0.01');return value;}
 function evaluate(weights,options={}){
   const priorGateFloor=gateFloor,priorGateFloorMode=gateFloorMode,configuredGateFloor=boundedGateFloor(options.gateFloor??0);gateFloor=configuredGateFloor;gateFloorMode=validGateFloorMode(options.gateFloorMode??'both');
   try{let state=reset(weights,options.resetMode??'from-line');while(!state.complete)state=env.step();return result(state);}
   finally{gateFloor=priorGateFloor;gateFloorMode=priorGateFloorMode;}
 }
 function traceEvaluate(weights,options={}){
   const priorGateFloor=gateFloor,configuredGateFloor=boundedGateFloor(options.gateFloor??0),stopAt=options.stopAtBestProgress??null,includeDecoderInputVectors=options.includeDecoderInputVectors!==false,includeTraceRows=options.includeTraceRows!==false,captureProgress=options.captureDecoderInputProgress??[650,900];gateFloor=configuredGateFloor;
   if(stopAt!==null&&(!Number.isFinite(stopAt)||stopAt<0||stopAt>10000))throw Error('Invalid bounded trace stop progress');
   if(!Array.isArray(captureProgress)||captureProgress.length!==2||captureProgress.some(v=>!Number.isFinite(v)||v<0||v>10000)||captureProgress[0]>captureProgress[1])throw Error('Invalid bounded decoder-input capture window');
   let captureFile=null,capturePending=null,captureFd=null,captureHash=null,captureRows=0,captureBuffer=[],captureFinalized=false;
   if(options.decoderInputCaptureFile!==undefined){
     captureFile=path.resolve(root,String(options.decoderInputCaptureFile));const captureRoot=path.resolve(root,'.impeccable/review/learning-ml')+path.sep;
     if(!captureFile.startsWith(captureRoot)||!captureFile.endsWith('.f64'))throw Error('Decoder-input capture must be a new private learning-review F64 file');
     capturePending=captureFile+'.pending';if(fs.existsSync(captureFile)||fs.existsSync(capturePending))throw Error('Preserve existing decoder-input capture');
     captureFd=fs.openSync(capturePending,'wx');captureHash=crypto.createHash('sha256');
   }
   const flushCapture=()=>{if(!captureBuffer.length)return;const values=Float64Array.from(captureBuffer.flat()),bytes=Buffer.from(values.buffer,values.byteOffset,values.byteLength);fs.writeSync(captureFd,bytes);captureHash.update(bytes);captureRows+=captureBuffer.length;captureBuffer=[];};
   const compact=(state,includeSensors)=>{
     const car=state.car,vehicle=car.vehicle||{},numericVehicle=Object.fromEntries(Object.entries(vehicle).filter(([,v])=>Number.isFinite(v)));
     const row={ticks:state.ticks,position:[car.x,car.y],heading:car.heading,lastAlong:Number.isFinite(car.lastAlong)?car.lastAlong:null,
       progress:Number.isFinite(car.progress)?car.progress:null,bestProgress:state.bestProgress,laps:state.laps,speedMps:vehicle.speedMps??car.speedMps??car.speed??null,
       slipAngle:Number.isFinite(car.slipAngle)?car.slipAngle:null,outputs:Array.isArray(car.outputs)?car.outputs.slice():null,alive:!state.complete,reason:state.reason||''};
     if(Object.keys(numericVehicle).length)row.vehicle=numericVehicle;
     if(includeSensors){row.inputs=Array.isArray(car.inputs)?car.inputs.slice():null;row.physicsInputs=Array.isArray(car.physicsInputs)?car.physicsInputs.slice():null;
       row.sensorVector=Array.isArray(car.sensorVector)?car.sensorVector.slice():null;row.neuralInputVector=lastNeuralInput?.slice()||null;
       row.policyFeatures=Array.isArray(car.brain?.policyFeatures)?Array.from(car.brain.policyFeatures):null;}
     return row;
   };
   try{
     let state=reset(weights,options.resetMode??'from-line');const rows=[],trace=crypto.createHash('sha256');
     let controlIndex=0;
     while(!state.complete&&(stopAt===null||state.bestProgress<stopAt)){
       const before=compact(state,captureFd===null&&state.bestProgress>=captureProgress[0]&&state.bestProgress<=captureProgress[1]),ticksBefore=state.ticks;
       state=env.step();const control=pending&&{active:pending.active,gate:pending.gate,gateAxes:pending.gateAxes.slice(),radialGate:pending.radialGate,features:pending.features.slice(),prior:pending.prior.slice(),
         mean:pending.mean.slice(),action:pending.action.slice(),commands:pending.commands.slice(),neuralInputVector:pending.neuralInputVector?.slice()||null};
       const after=compact(state,false),row={controlIndex:++controlIndex,ticksBefore,ticksAfter:state.ticks,before,control,after};if(includeTraceRows)rows.push(row);
       trace.update(JSON.stringify([row.controlIndex,ticksBefore,state.ticks,before.position,before.heading,before.bestProgress,control?.commands,control?.neuralInputVector,after.position,after.heading,after.bestProgress])+'\n');
       if(captureFd!==null&&before.bestProgress>=captureProgress[0]&&before.bestProgress<=captureProgress[1]){
         if(!Array.isArray(control?.neuralInputVector)||control.neuralInputVector.length!==516)throw Error('Actual 516-value decoder input required for binary capture');
         captureBuffer.push([before.bestProgress,...control.neuralInputVector]);if(captureBuffer.length>=128)flushCapture();
       }
       if(!includeDecoderInputVectors&&row.control)row.control.neuralInputVector=null;
     }
     const capture= captureFd===null?null:(()=>{flushCapture();fs.closeSync(captureFd);captureFd=null;fs.renameSync(capturePending,captureFile);captureFinalized=true;return {file:path.relative(root,captureFile).replaceAll('\\','/'),sha256:captureHash.digest('hex'),rows:captureRows,columns:517,dtype:'little-endian-float64'};})();
     return {gateFloor:configuredGateFloor,captureDecoderInputProgress:captureProgress.slice(),decoderInputCapture:capture,result:result(state),controls:controlIndex,track:{total:env.track.total,pixelsPerMeter:env.track.pixelsPerMeter},traceSha256:trace.digest('hex'),rows:includeTraceRows?rows:null};
   }finally{if(captureFd!==null)fs.closeSync(captureFd);if(!captureFinalized&&capturePending&&fs.existsSync(capturePending))fs.unlinkSync(capturePending);gateFloor=priorGateFloor;}
 }
 function episode(options={}){
   const priorGateFloor=gateFloor,configuredGateFloor=boundedGateFloor(options.gateFloor??0);gateFloor=configuredGateFloor;
   const {weights=loaded.data.weights,exploration:cfg=config(),resetMode='from-line',seed=7717,sign:noiseSign=1,safetyCost=2000,noLapCost=4000,progressShapingPerMeter=0}=options;
   try{
   if(!Number.isFinite(safetyCost)||safetyCost<0||safetyCost>10000||!Number.isFinite(noLapCost)||noLapCost<0||noLapCost>10000||!Number.isFinite(progressShapingPerMeter)||progressShapingPerMeter<0||progressShapingPerMeter>5)throw Error('Bounded research terminal costs and progress shaping required');
   let state=reset(weights,resetMode,cfg,seed,noiseSign);const start={progress:state.bestProgress,fitness:state.fitness,laps:state.laps,ticks:state.ticks},rows=[],trace=crypto.createHash('sha256');let shapedHighWater=state.bestProgress,progressShapingBonus=0;
   while(!state.complete){const before=state.fitness;state=env.step();const reward=state.fitness-before;
     const gained=Math.max(0,state.bestProgress-shapedHighWater),shapingBonus=gained*progressShapingPerMeter;shapedHighWater=Math.max(shapedHighWater,state.bestProgress);progressShapingBonus+=shapingBonus;
     rows.push({...pending,rewardNative:reward,rewardProgressBonus:shapingBonus,reward:(reward+shapingBonus)/100,done:state.complete});
     trace.update(JSON.stringify([rows.length,pending.commands,state.car.x,state.car.y,state.car.heading,state.bestProgress])+'\n');}
   const outcome=result(state),safe=!['urto','fuori pista','progresso non valido'].includes(outcome.reason),collisionPenalty=safe?0:safetyCost,
     noLapPenalty=resetMode==='from-line'&&outcome.laps===0?noLapCost:0,extra=collisionPenalty+noLapPenalty;
   if(!rows.length)throw Error('Real nonempty continuation required');rows.at(-1).reward-=extra/100;
   const nativeDelta=rows.reduce((s,r)=>s+r.rewardNative,0);if(Math.abs(nativeDelta-(state.fitness-start.fitness))>1e-7)throw Error('Post-reset native reward ledger does not reconcile');
   const record={id:episodes.length,resetMode,fullFromLine:resetMode==='from-line',seed,sign:noiseSign,behaviorWeights:weights.slice(),exploration:structuredClone(cfg),gateFloor:configuredGateFloor,
     rows,controls:rows.length,result:outcome,start,safe,newLaps:state.laps-start.laps,progressAfterReset:Math.max(0,state.bestProgress-start.progress),
   nativeRewardAfterReset:nativeDelta,extraSafetyCost:extra,collisionPenalty,noLapPenalty,progressShapingPerMeter,progressShapingBonus,
   trainingReward:(nativeDelta-extra+progressShapingBonus)/100,traceSha256:trace.digest('hex')};episodes.push(record);return record;
   }finally{gateFloor=priorGateFloor;}
 }
 function rescore(weights,advantages,{exploration:cfg=null}={}){
   State.weights(weights);if(cfg)X.validate(cfg,9);let cursor=0,active=0,score=0,kl=0;
   for(const e of episodes){if(cfg&&!X.sameFamily(cfg,e.exploration))throw Error('No silent noise-family change');let previous=null;
     for(const row of e.rows){const mu=mean(row.features,weights,gain),sigma=X.scale(row.features,cfg??e.exploration).sigma,d=X.conditional(mu,sigma,row.active?previous:null,e.exploration.rho),adv=advantages[cursor++];
       if(!Number.isFinite(adv))throw Error('Finite aligned advantages required');previous=row.active?{mean:mu,sigma,action:row.action}:null;if(!row.active)continue;
       const ratio=Math.exp(Math.max(-20,Math.min(20,X.logp(row.action,d.mean,d.std)-X.logp(row.action,row.conditionalMean,row.conditionalStd))));
       score+=Math.min(ratio*adv,Math.max(.8,Math.min(1.2,ratio))*adv);kl+=X.kl(row.conditionalMean,row.conditionalStd,d.mean,d.std);active++;}}
   if(cursor!==advantages.length||!active)throw Error('Matching active real trajectories required');return {activeRows:active,meanClippedSurrogate:score/active,meanGaussianKL:kl/active};
 }
 const metadata=()=>({format:'private-protected-statehead-gate-floor-env-v1',appVersion:'5.6.0',gateFloorDefault:0,maxGateFloor:.01,instantGate:head.instantGate,extraPrefixControls:extraPrefixControls.slice(),parentFile:choice.file,parentSha256:choice.modelSha256,
   weights:genes.slice(),motorGain:gain,baseline,prefixes:Object.fromEntries([...prefixes].map(([k,v])=>[k,v.source])),featureCount:9,meanCoefficients:18,varianceCoefficients:20,
   originalExpected:choice.expected,parentExpected:loaded.core.parent.data.expectedResult,gateBasisOverride:Boolean(basisOverride),gateBasisSha256:sha(JSON.stringify(activeBasis)),gateBasisCentres:activeBasis.centres.length,
   defaultExploration:config(),cuda:Model.stats(),
   sourceHashes:Identity.collect(['work/statehead-reward-env.cjs','work/statehead-reward-gate-env.cjs','work/neural-statehead-gate.cjs','work/neural-statehead-rl-live.cjs']),
   boundary:'Research-only optional gate floor from0to0.01 when brain neurons are active and radial gate is zero. From-line training episodes may use a distance-difference shaping reward per newly reached metre, plus separate no-lap and collision terminal costs. Mean is the original18-weight head BEFORE tanh and additive motor clamp. Inputs are actual neuronal/PCA features; no route/pose/lap/clock targets. Any prefix reset is training only; reward starts at reset and inherited laps are separate. Only from-line physical evaluation proves complete laps. Frozen parent/saves untouched.'});
 return {metadata,evaluate,traceEvaluate,episode,rescore,clear(){episodes.length=0;return {cleared:true};},stats:()=>Model.stats()};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
 let id=null;try{const m=JSON.parse(line);id=m.id;let value;if(m.op==='init'){if(env)throw Error('Already initialized');env=create({basisOverride:m.basisOverride??null,instantGate:m.instantGate===true,extraPrefixControls:m.extraPrefixControls??[]});value=env.metadata();}
 else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')value=env.evaluate(m.weights,m.configuration);else if(m.op==='trace-evaluate')value=env.traceEvaluate(m.weights,m.configuration);else if(m.op==='episode')value=env.episode(m.configuration);
 else if(m.op==='rescore')value=env.rescore(m.weights,m.advantages,m.configuration);else if(m.op==='clear')value=env.clear();else if(m.op==='stats')value=env.stats();else throw Error('Unknown operation');
 process.stdout.write(JSON.stringify({id,result:value})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack||String(e)})+'\n');}
 }).on('close',()=>Model.closeCuda());}
module.exports={create,mean,config};
