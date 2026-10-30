'use strict';
// New research family: unrestricted learned motor residual after the actual
// MaleCNS parent. Policy observations contain neuronal history/own commands ONLY.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-statehead-cuda-model.cjs'),
 Parent=require('./neural-frontier-chain.cjs'),Head=require('./neural-statehead.cjs'),Motor=require('./neural-command-residual.cjs'),Live=require('./neural-feedback-live.cjs'),Identity=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function create({proofFile='.impeccable/review/learning-ml/statehead-reward-native-proof-20261025-01/report.json',seed=93261025,horizonControls=80}={}){
 const proofPath=path.resolve(root,proofFile);if(!proofPath.startsWith(path.join(root,'.impeccable/review/learning-ml')+path.sep))throw Error('Only scoped independently verified parents allowed');
 if(!Number.isInteger(seed)||!Number.isInteger(horizonControls)||horizonControls<20||horizonControls>300)throw Error('Bounded training reset/horizon required');
 const proof=JSON.parse(fs.readFileSync(proofPath)),parentPath=path.resolve(proof.candidateFile||'');
 if(!proof.passed||!proof.canonicalNonweaker||!parentPath.startsWith(path.join(root,'.impeccable/review/learning-ml')+path.sep)||hash(fs.readFileSync(parentPath))!==proof.candidateSha256)throw Error('Verified compatible parent file required');
 const loaded=Model.load(parentPath),parent=Parent.controller(loaded.core.parent),head=Head.create(loaded.data),gain=loaded.data.provenance?.motorCorrectionGain??1,
   genes=loaded.data.weights.map(v=>v*gain),snapshots=[],sum=Array(518).fill(0),sum2=Array(518).fill(0);
 let residual=[0,0],lastPrior=null,env,randomState=seed>>>0,controlsAfterReset=0,training=false,anchor={progress:0,laps:0},origin={progress:0,laps:0},lapBoundary=null;
 function random(){randomState+=0x6D2B79F5;let t=randomState;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
 env=Live.create(loaded.modelFile,{modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:hash(fs.readFileSync(parentPath)),
   onReset:()=>{parent.reset();head.reset();},actionOverride:(_m,raw)=>{const old=parent.observe(raw);head.observe(raw);return old;},
   motorOverride:(_m,_raw,prior)=>{lastPrior=head.compose(parent.compose(prior),genes);return Motor.compose(lastPrior,1,residual);}});
 function rawObservation(){const s=env.state(),c=s.car;return s.observation.concat([c.outputs[0],c.outputs[1]-c.outputs[2]]);}
 function result(s){return {bestProgress:s.bestProgress,fitness:s.fitness,laps:s.laps,reason:s.reason,totalSimulationSeconds:s.totalSimulationSeconds,complete:s.complete,lapTimes:s.lapTimes.slice()};}
 function bodyFrame(){const c=env.currentCar();return {x:c.x,y:c.y,heading:c.heading,speed:c.speed,outputs:c.outputs.slice(),brainSha256:hash(Buffer.from(c.brain.activity.buffer,c.brain.activity.byteOffset,c.brain.activity.byteLength))};}
 let s=env.state(),controls=0,firstLapControls=null;const trace=crypto.createHash('sha256'),bodyTrace=[],rewardTrace=[],neuralSamples=[],referenceRows=[];
 while(!s.complete){const raw=rawObservation();referenceRows.push({observation:raw.slice(),completedLaps:s.laps});if(controls%8===0)neuralSamples.push(raw.slice());for(let j=0;j<518;j++){sum[j]+=raw[j];sum2[j]+=raw[j]*raw[j];}
   const oldFitness=s.fitness;s=env.step();controls++;bodyTrace.push(bodyFrame());rewardTrace.push(s.fitness-oldFitness);const c=s.car;trace.update(JSON.stringify([controls,c.outputs,c.x,c.y,c.heading,c.bestProgress])+'\n');if(c.laps>=1&&firstLapControls===null){firstLapControls=controls;lapBoundary={live:env.capture(),parent:parent.capture(),head:head.capture(),source:{control:controls,progress:c.bestProgress,laps:c.laps}};}
   if(c.alive&&(controls%256===0||controls===8200||controls===8300))snapshots.push({live:env.capture(),parent:parent.capture(),head:head.capture(),
      source:{control:controls,progress:c.bestProgress,laps:c.laps,speedMps:c.vehicle.speedMps}});
 }
 const baseline=result(s),traceSha=trace.digest('hex');if(JSON.stringify(baseline)!==JSON.stringify(proof.best.result)||traceSha!==proof.best.traceSha256)throw Error('Zero residual must exactly reproduce the independently verified complete parent');
 const mean=sum.map(v=>v/controls),scale=sum2.map((v,j)=>Math.max(.05,Math.sqrt(Math.max(0,v/controls-mean[j]*mean[j]))));
 function observation(){return rawObservation().map((v,j)=>(v-mean[j])/scale[j]);}
 function reference(){
   const bankRows=referenceRows.filter(r=>r.completedLaps===0),values=new Float32Array(bankRows.length*518);
   for(let i=0;i<bankRows.length;i++)for(let j=0;j<518;j++)values[i*518+j]=(bankRows[i].observation[j]-mean[j])/scale[j];
   return {format:'actual-successful-neural-reference-v1',shape:[bankRows.length,518],dtype:'float32-le',base64:Buffer.from(values.buffer).toString('base64'),
     firstLapTimeSeconds:baseline.lapTimes[0],boundary:'Actual neuronal observations before completion of the first successful lap, without actions, pose or timestamps in the reference vectors. For learned self-retention, not route replay.'};
 }
 function reset({mode='local',snapshotIndex=null,headingKickRad=null}={}){
   residual=[0,0];controlsAfterReset=0;training=mode==='local'||mode==='cold-training'||mode==='boundary-training';anchor={progress:0,laps:0};origin={progress:0,laps:0};
   if(mode==='from-line'||mode==='cold-training'){const kick=headingKickRad===null?(training?(random()*2-1)*.01:0):headingKickRad;env.reset({headingKickRad:kick});}
   else if(mode==='observed-lap-boundary'||mode==='boundary-training'){
     if(!lapBoundary)throw Error('A real completed first lap is required');
     env.restore(lapBoundary.live);parent.restore(lapBoundary.parent);head.restore(lapBoundary.head);
     origin={progress:env.currentCar().bestProgress,laps:env.currentCar().laps};
   }else if(mode==='local'){
     const index=snapshotIndex===null?Math.floor(random()*snapshots.length):snapshotIndex;
     if(!Number.isInteger(index)||index<0||index>=snapshots.length)throw Error('Own real snapshot index required');
     const snap=snapshots[index];env.restore(snap.live);parent.restore(snap.parent);head.restore(snap.head);
     const c=env.currentCar(),kick=headingKickRad===null?(random()*2-1)*.01:headingKickRad;
     if(!Number.isFinite(kick)||Math.abs(kick)>.03)throw Error('Bounded physical orientation perturbation required');
     anchor={progress:c.bestProgress,laps:c.laps};origin={...anchor};c.heading+=kick;
     // Preserve the entire actual MDP state, including reward/termination
     // history. Only REPORTED local progress/laps are relative to this anchor.
     // No past reward is returned and no local result validates a full lap.
   }else throw Error('Explicit local/cold training or full from-line evaluation required');
   return {observation:observation(),info:{training,progress:env.currentCar().bestProgress-anchor.progress,laps:env.currentCar().laps-anchor.laps,localControls:0,inheritedRealProgress:origin.progress,inheritedRealLaps:origin.laps}};
 }
 function step(action){
   if(!Array.isArray(action)||action.length!==2||action.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded learned motor residual required');
   const before=env.state();if(before.complete)throw Error('Reset a completed body episode');residual=action.slice();
   const state=env.step(),reward=state.fitness-before.fitness;controlsAfterReset++;
   return {observation:observation(),reward:reward/100,terminated:state.complete,truncated:training&&!state.complete&&controlsAfterReset>=horizonControls,
     info:{training,progress:state.bestProgress-anchor.progress,laps:state.laps-anchor.laps,inheritedRealProgress:origin.progress,inheritedRealLaps:origin.laps,reason:state.reason,localControls:controlsAfterReset,outputs:state.car.outputs.slice(),
       bodyFrameSha256:hash(JSON.stringify(bodyFrame())),parentOutputs:lastPrior?.slice(),oldHeadGate:head.value(),safe:state.reason!== 'urto'&&state.reason!=='fuori pista'&&state.reason!=='progresso non valido'}};
 }
 function checkContinuation({snapshotIndex=0,steps=200}={}){
   if(!Number.isInteger(steps)||steps<1||steps>300)throw Error('Bounded actual continuation proof required');
   function trial(freshBookkeeping){
     reset({mode:'local',snapshotIndex,headingKickRad:0});
     if(freshBookkeeping){
       const c=env.currentCar(),along=c.rewardState.along,physical={};
       for(const key of ['x','y','heading','speed','steer','vehicle','brain','velocityX','velocityY','longitudinalVelocity','lateralVelocity','yawRate',
          'longitudinalAcceleration','lateralAcceleration','longitudinalG','lateralG','totalG','loadTransfer','slipAngle','_physicsSpeed','outputs'])physical[key]=c[key];
       const fresh=env.runtime.makeCar(env.track,0,env.runtime.cloneGenome(c.genome),c.rewardRevision);
       Object.assign(c,fresh,physical);env.runtime.Rewards.initialise(env.track,c,null,c.rewardRevision);c.rewardState.along=along;c.lastAlong=along;
     }
     const frames=[],rewards=[];let terminal=false;
     for(let k=0;k<steps;k++){const old=env.state().fitness,state=step([0,0]);frames.push(bodyFrame());rewards.push(env.state().fitness-old);if(state.terminated){terminal=true;break;}}
     const begin=snapshots[snapshotIndex].source.control,expected=bodyTrace.slice(begin,begin+frames.length),expectedRewards=rewardTrace.slice(begin,begin+rewards.length);
     return {steps:frames.length,terminal,bodyAndBrainExact:JSON.stringify(frames)===JSON.stringify(expected),rewardsExact:JSON.stringify(rewards)===JSON.stringify(expectedRewards),
       summedRawReward:rewards.reduce((s,x)=>s+x,0),recordedSuffixRawReward:expectedRewards.reduce((s,x)=>s+x,0)};
   }
   return {snapshotIndex,preserveActualContext:trial(false),freshBookkeeping:trial(true)};
 }
 const metadata=()=>({format:'private-neural-feedback-retention-training-world-v1',appVersion:'5.6.0',parentFile:parentPath,parentSha256:proof.candidateSha256,referenceProofSha256:hash(fs.readFileSync(proofPath)),
   baseline,baselineTraceSha256:traceSha,referenceControls:controls,firstLapControls,firstLapBodySequenceSha256:hash(bodyTrace.slice(0,firstLapControls).map(frame=>hash(JSON.stringify(frame))).join('\n')+'\n'),observationLength:518,normalization:{mean,scale},neuralBasisSamples:neuralSamples.map(row=>row.map((v,j)=>(v-mean[j])/scale[j])),snapshots:snapshots.map(s=>s.source),
   lapBoundary:lapBoundary?.source,horizonControls,neurons:env.graph.n,edges:env.graph.from.length,cuda:Model.stats(),sourceHashes:Identity.collect(['work/neural-feedback-retention-training-world.cjs','work/neural-feedback-live.cjs']),
   boundary:'Actual normalized neural samples exported for unsupervised local feature fitting, without action/position/time labels. Unrestricted learned residual after the real neuronal parent.518 observations:128 actual descending neurons x4,2 neural decoder memory,2 neural baseline motors,2 own previous executed motors. No position/heading/lap/clock/route inputs to policy. Own real-trajectory snapshot resets preserve body, brain, reward and termination state. Local reported progress/laps subtract the actual restored anchor and start0; inheritedRealProgress/Laps are explicit diagnostics only. Rewards are future deltas only; local starts never prove full from-line laps. Local heading kicks occur after the restored observation; cold heading kicks precede the initial observation. Horizon truncation is training only and must bootstrap critic. Full evaluation has native2lap limit and no artificial time cap. Zero residual exactly preserves the old complete trace; a trained residual invalidates old zero-gate prefix shortcuts.'});
 return {metadata,reset,step,reference,checkContinuation,stats:()=>Model.stats()};
}
if(require.main===module){let world;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
 let id=null;try{const m=JSON.parse(line);id=m.id;let value;if(m.op==='init'){if(world)throw Error('Already initialized');world=create(m.configuration);value=world.metadata();}
 else if(!world)throw Error('Initialize first');else if(m.op==='reference')value=world.reference();else if(m.op==='reset')value=world.reset(m.configuration);else if(m.op==='step')value=world.step(m.action);else if(m.op==='check-continuation')value=world.checkContinuation(m.configuration);else if(m.op==='stats')value=world.stats();else throw Error('Unknown operation');
 process.stdout.write(JSON.stringify({id,result:value})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack||String(e)})+'\n');}
 }).on('close',()=>Model.closeCuda());}
module.exports={create};
