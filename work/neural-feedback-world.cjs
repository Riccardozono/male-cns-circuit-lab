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
 let residual=[0,0],lastPrior=null,env,randomState=seed>>>0,controlsAfterReset=0,training=false;
 function random(){randomState+=0x6D2B79F5;let t=randomState;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
 env=Live.create(loaded.modelFile,{modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:hash(fs.readFileSync(parentPath)),
   onReset:()=>{parent.reset();head.reset();},actionOverride:(_m,raw)=>{const old=parent.observe(raw);head.observe(raw);return old;},
   motorOverride:(_m,_raw,prior)=>{lastPrior=head.compose(parent.compose(prior),genes);return Motor.compose(lastPrior,1,residual);}});
 function rawObservation(){const s=env.state(),c=s.car;return s.observation.concat([c.outputs[0],c.outputs[1]-c.outputs[2]]);}
 function result(s){return {bestProgress:s.bestProgress,fitness:s.fitness,laps:s.laps,reason:s.reason,totalSimulationSeconds:s.totalSimulationSeconds,complete:s.complete,lapTimes:s.lapTimes.slice()};}
 let s=env.state(),controls=0;const trace=crypto.createHash('sha256');
 while(!s.complete){const raw=rawObservation();for(let j=0;j<518;j++){sum[j]+=raw[j];sum2[j]+=raw[j]*raw[j];}
   s=env.step();controls++;const c=s.car;trace.update(JSON.stringify([controls,c.outputs,c.x,c.y,c.heading,c.bestProgress])+'\n');
   if(c.alive&&(controls%256===0||controls===8200||controls===8300))snapshots.push({live:env.capture(),parent:parent.capture(),head:head.capture(),
      source:{control:controls,progress:c.bestProgress,laps:c.laps,speedMps:c.vehicle.speedMps}});
 }
 const baseline=result(s),traceSha=trace.digest('hex');if(JSON.stringify(baseline)!==JSON.stringify(proof.best.result)||traceSha!==proof.best.traceSha256)throw Error('Zero residual must exactly reproduce the independently verified complete parent');
 const mean=sum.map(v=>v/controls),scale=sum2.map((v,j)=>Math.max(.05,Math.sqrt(Math.max(0,v/controls-mean[j]*mean[j]))));
 function observation(){return rawObservation().map((v,j)=>(v-mean[j])/scale[j]);}
 function reset({mode='local',snapshotIndex=null,headingKickRad=null}={}){
   residual=[0,0];controlsAfterReset=0;training=mode==='local'||mode==='cold-training';
   if(mode==='from-line'||mode==='cold-training'){const kick=headingKickRad===null?(training?(random()*2-1)*.01:0):headingKickRad;env.reset({headingKickRad:kick});}
   else if(mode==='local'){
     const index=snapshotIndex===null?Math.floor(random()*snapshots.length):snapshotIndex;
     if(!Number.isInteger(index)||index<0||index>=snapshots.length)throw Error('Own real snapshot index required');
     const snap=snapshots[index];env.restore(snap.live);parent.restore(snap.parent);head.restore(snap.head);
     const c=env.currentCar(),along=c.rewardState.along,kick=headingKickRad===null?(random()*2-1)*.01:headingKickRad;
     if(!Number.isFinite(kick)||Math.abs(kick)>.03)throw Error('Bounded physical orientation perturbation required');
     const physical={};for(const key of ['x','y','heading','speed','steer','vehicle','brain','velocityX','velocityY','longitudinalVelocity','lateralVelocity','yawRate',
       'longitudinalAcceleration','lateralAcceleration','longitudinalG','lateralG','totalG','loadTransfer','slipAngle','_physicsSpeed','outputs'])physical[key]=c[key];
     const fresh=env.runtime.makeCar(env.track,0,env.runtime.cloneGenome(c.genome),c.rewardRevision);
     Object.assign(c,fresh,physical);c.heading+=kick;env.runtime.Rewards.initialise(env.track,c,null,c.rewardRevision);c.rewardState.along=along;c.lastAlong=along;
     env.refresh();
   }else throw Error('Explicit local/cold training or full from-line evaluation required');
   return {observation:observation(),info:{training,progress:env.currentCar().bestProgress,laps:env.currentCar().laps,localControls:0}};
 }
 function step(action){
   if(!Array.isArray(action)||action.length!==2||action.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded learned motor residual required');
   const before=env.state();if(before.complete)throw Error('Reset a completed body episode');residual=action.slice();
   const state=env.step(),reward=state.fitness-before.fitness;controlsAfterReset++;
   return {observation:observation(),reward:reward/100,terminated:state.complete,truncated:training&&!state.complete&&controlsAfterReset>=horizonControls,
     info:{training,progress:state.bestProgress,laps:state.laps,reason:state.reason,localControls:controlsAfterReset,outputs:state.car.outputs.slice(),
       parentOutputs:lastPrior?.slice(),oldHeadGate:head.value(),safe:state.reason!== 'urto'&&state.reason!=='fuori pista'&&state.reason!=='progresso non valido'}};
 }
 const metadata=()=>({format:'private-neural-feedback-world-v1',appVersion:'5.6.0',parentFile:parentPath,parentSha256:proof.candidateSha256,referenceProofSha256:hash(fs.readFileSync(proofPath)),
   baseline,baselineTraceSha256:traceSha,referenceControls:controls,observationLength:518,normalization:{mean,scale},snapshots:snapshots.map(s=>s.source),
   horizonControls,neurons:env.graph.n,edges:env.graph.from.length,cuda:Model.stats(),sourceHashes:Identity.collect(['work/neural-feedback-world.cjs','work/neural-feedback-live.cjs']),
   boundary:'Unrestricted learned residual after the real neuronal parent.518 observations:128 actual descending neurons x4,2 neural decoder memory,2 neural baseline motors,2 own previous executed motors. No position/heading/lap/clock/route inputs to policy. Uniform own real-trajectory snapshot resets; local bookkeeping reset to0 and optional physical heading perturbations. Horizon truncation is training only and must bootstrap critic. Full evaluation has native2lap limit and no artificial time cap. Zero residual exactly preserves the old complete trace; a trained residual invalidates old zero-gate prefix shortcuts.'});
 return {metadata,reset,step,stats:()=>Model.stats()};
}
if(require.main===module){let world;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
 let id=null;try{const m=JSON.parse(line);id=m.id;let value;if(m.op==='init'){if(world)throw Error('Already initialized');world=create(m.configuration);value=world.metadata();}
 else if(!world)throw Error('Initialize first');else if(m.op==='reset')value=world.reset(m.configuration);else if(m.op==='step')value=world.step(m.action);else if(m.op==='stats')value=world.stats();else throw Error('Unknown operation');
 process.stdout.write(JSON.stringify({id,result:value})+'\n');}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack||String(e)})+'\n');}
 }).on('close',()=>Model.closeCuda());}
module.exports={create};
