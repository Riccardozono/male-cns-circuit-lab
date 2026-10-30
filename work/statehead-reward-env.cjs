'use strict';
// Distinct research sampler: retained real MaleCNS + parent's neural stages,
// trainable original18 head coefficients, Gaussian noise BEFORE head tanh.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-statehead-cuda-model.cjs'),
 Parent=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Motor=require('./neural-command-residual.cjs'),
 Live=require('./neural-statehead-rl-live.cjs'),X=require('./learned-neural-exploration.cjs'),Identity=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function mean(features,weights,gain=1){return [0,1].map(a=>features.reduce((sum,f,k)=>sum+f*(weights[k*2+a]*gain),0)/3*(a===0?.2:1));}
function config(){return {format:'learned-neural-log-sigma-v1',rho:.9,floor:[1e-6,1e-5],ceiling:[.1,.5],initial:[.0005,.005],weights:Array(20).fill(0)};}
function create(){
 const choice=Model.defaultChoice(),loaded=Model.load(choice.file),gain=loaded.data.provenance?.motorCorrectionGain??1,
   parent=Parent.controller(loaded.core.parent),head=State.create(loaded.data),episodes=[],prefixes=new Map();
 if(loaded.data.provenance?.physicsSafety)throw Error('Protected parent requires an explicitly modeled safety transform');
 let genes=loaded.data.weights.slice(),exploration=null,previous=null,random=null,pending=null;
 function uniformGenerator(seed){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
 function sample(){return Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());}
 let sign=1,env;
 env=Live.create(loaded.modelFile,{modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,
   onReset:()=>{parent.reset();head.reset();previous=null;},
   actionOverride:(_model,raw)=>{const old=parent.observe(raw);head.observe(raw);return old;},
   motorOverride:(_model,_raw,prior,car)=>{
     const actualPrior=parent.compose(prior),features=head.features(),gate=head.value(),mu=mean(features,genes,gain),
       neural=env.graph.learning.nodes.some(i=>Math.abs(car.brain.activity[i])>=1e-7),active=gate>0&&neural,
       sigma=exploration?X.scale(features,exploration).sigma:[0,0],conditional=exploration?X.conditional(mu,sigma,active?previous:null,exploration.rho):{mean:mu,std:sigma},
       action=exploration&&active?conditional.mean.map((v,a)=>v+sign*conditional.std[a]*sample()):mu.slice(),
       deterministic=head.compose(actualPrior,genes.map(v=>v*gain)),composed=Motor.compose(actualPrior,gate,action.map(Math.tanh));
     if(!exploration&&JSON.stringify(composed)!==JSON.stringify(deterministic))throw Error('Head formula differs from protected native composition');
     const commands=!neural?[0,0,0]:exploration&&active?composed:deterministic;
     pending={features,gate,prior:actualPrior,mean:mu,sigma,conditionalMean:conditional.mean,conditionalStd:conditional.std,action,commands,active};
     previous=exploration&&active?{mean:mu,sigma,action}:null;return commands;
   }});
 function result(state){return {bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,
    totalSimulationSeconds:state.totalSimulationSeconds,complete:state.complete,lapTimes:state.lapTimes.slice()};}
 function initialise(){
   let state=env.state(),controls=0;const trace=crypto.createHash('sha256'),markers=new Set([7800,8200]);
   while(!state.complete){state=env.step();controls++;const c=state.car;trace.update(JSON.stringify([controls,c.outputs,c.x,c.y,c.heading,c.bestProgress])+'\n');
     if(markers.has(controls)){const key='observed-'+controls;prefixes.set(key,{live:env.capture(),parent:parent.capture(),head:head.capture(),
       source:{control:controls,ticks:state.ticks,progress:state.bestProgress,laps:state.laps,fitness:state.fitness,modelSha256:choice.modelSha256}});}}
   const observed=result(state);if(JSON.stringify(observed)!==JSON.stringify(choice.expected))throw Error('Sampler does not reproduce protected complete one-lap outcome');
   const fresh=JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/learning-ml/statehead-best-fresh-replay-20261025-01/report.json'),'utf8'));
   const digest=trace.digest('hex');if(!fresh.passed||fresh.modelSha256!==choice.modelSha256||fresh.traceSha256!==digest)throw Error('Every sampled body/command trace must match the fresh protected replay');
   return {observed,controls,traceSha256:digest};
 }
 const baseline=initialise();
 function reset(weights,which='from-line',c=null,seed=7717,noiseSign=1){
   State.weights(weights);if(c)X.validate(c,9);if(!Number.isInteger(seed)||![1,-1].includes(noiseSign))throw Error('Valid stochastic seed/sign required');
   genes=weights.slice();exploration=c?structuredClone(c):null;sign=noiseSign;random=uniformGenerator(seed);previous=null;pending=null;
   if(which==='from-line')return env.reset();const p=prefixes.get(which);if(!p)throw Error('Unknown own observed context');
   const state=env.restore(p.live);parent.restore(p.parent);head.restore(p.head);return state;
 }
 function evaluate(weights,{resetMode='from-line'}={}){let state=reset(weights,resetMode);while(!state.complete)state=env.step();return result(state);}
 function episode({weights=loaded.data.weights,exploration:cfg=config(),resetMode='from-line',seed=7717,sign:noiseSign=1,safetyCost=2000}={}){
   if(!Number.isFinite(safetyCost)||safetyCost<0||safetyCost>10000)throw Error('Bounded research safety cost required');
   let state=reset(weights,resetMode,cfg,seed,noiseSign);const start={progress:state.bestProgress,fitness:state.fitness,laps:state.laps,ticks:state.ticks},rows=[],trace=crypto.createHash('sha256');
   while(!state.complete){const before=state.fitness;state=env.step();const reward=state.fitness-before;
     rows.push({...pending,rewardNative:reward,reward:reward/100,done:state.complete});
     trace.update(JSON.stringify([rows.length,pending.commands,state.car.x,state.car.y,state.car.heading,state.bestProgress])+'\n');}
   const outcome=result(state),safe=!['urto','fuori pista','progresso non valido'].includes(outcome.reason),extra=safe?0:safetyCost;
   if(!rows.length)throw Error('Real nonempty continuation required');rows.at(-1).reward-=extra/100;
   const nativeDelta=rows.reduce((s,r)=>s+r.rewardNative,0);if(Math.abs(nativeDelta-(state.fitness-start.fitness))>1e-7)throw Error('Post-reset native reward ledger does not reconcile');
   const record={id:episodes.length,resetMode,fullFromLine:resetMode==='from-line',seed,sign:noiseSign,behaviorWeights:weights.slice(),exploration:structuredClone(cfg),
     rows,controls:rows.length,result:outcome,start,safe,newLaps:state.laps-start.laps,progressAfterReset:Math.max(0,state.bestProgress-start.progress),
     nativeRewardAfterReset:nativeDelta,extraSafetyCost:extra,trainingReward:(nativeDelta-extra)/100,traceSha256:trace.digest('hex')};episodes.push(record);return record;
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
 const metadata=()=>({format:'private-protected-statehead-reward-env-v1',appVersion:'5.6.0',parentFile:choice.file,parentSha256:choice.modelSha256,
   weights:loaded.data.weights.slice(),motorGain:gain,baseline,prefixes:Object.fromEntries([...prefixes].map(([k,v])=>[k,v.source])),featureCount:9,meanCoefficients:18,varianceCoefficients:20,
   originalExpected:choice.expected,defaultExploration:config(),cuda:Model.stats(),
   sourceHashes:Identity.collect(['work/statehead-reward-env.cjs','work/neural-statehead-rl-live.cjs']),
   boundary:'Mean is the original18-weight head BEFORE tanh and additive motor clamp. Inputs are actual neuronal/PCA features; no route/pose/lap/clock targets. Own real-prefix resets are training only; reward starts at reset and inherited laps are separate. Only from-line physical evaluation proves complete laps. Frozen parent/saves untouched.'});
 return {metadata,evaluate,episode,rescore,clear(){episodes.length=0;return {cleared:true};},stats:()=>Model.stats()};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
 let id=null;try{const m=JSON.parse(line);id=m.id;let value;if(m.op==='init'){if(env)throw Error('Already initialized');env=create();value=env.metadata();}
 else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')value=env.evaluate(m.weights,m.configuration);else if(m.op==='episode')value=env.episode(m.configuration);
 else if(m.op==='rescore')value=env.rescore(m.weights,m.advantages,m.configuration);else if(m.op==='clear')value=env.clear();else if(m.op==='stats')value=env.stats();else throw Error('Unknown operation');
 process.stdout.write(JSON.stringify({id,result:value})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack||String(e)})+'\n');}
 }).on('close',()=>Model.closeCuda());}
module.exports={create,mean,config};
