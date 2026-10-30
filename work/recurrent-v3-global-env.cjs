'use strict';
// Global-policy research copy: no frozen-prefix controller or context gate.
// Starts remain physical conditions, never neural inputs; revision is explicit.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto'),
  F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'), Pool=require('./physical-rollout-pool.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'), X=require('./neural-exploration-ar1.cjs'),root=path.resolve(__dirname,'..'),REVISION=F.Rewards.PRIVATE_CONTINUITY_REVISION;
const SHA=x=>crypto.createHash('sha256').update(x).digest('hex');
function featureLatent(graph,features,genome,active){
  const p=graph.learning,w=genome.policyWeights,norm=1/Math.sqrt(p.nodes.length),value=[0,0];
  if(active){for(let j=0;j<p.nodes.length;j++)for(let a=0;a<2;a++)value[a]+=features[j]*w[p.readoutOffset+j*2+a]*norm;
    for(let a=0;a<2;a++)value[a]+=w[w.length-2+a];}
  return value;
}
function latent(graph,brain,genome){
  const active=graph.learning.nodes.some(n=>Math.abs(brain.activity[n])>=1e-7);
  return {mean:featureLatent(graph,brain.policyFeatures,genome,active),active};
}
function create(){
  const sim=Pool.setup(),baseDir=path.join(root,'.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01'),
    training=JSON.parse(fs.readFileSync(path.join(baseDir,'report.json'),'utf8')),
    genome=JSON.parse(fs.readFileSync(path.join(baseDir,'zero-only.private.json'),'utf8')).genome,
    expected=training.final.find(x=>x.arm==='zero-only').best.zero, parentSha256=SHA(JSON.stringify(genome)),episodes=[];
  if(!training.passed||parentSha256!==training.final.find(x=>x.arm==='zero-only').best.genomeSha256)throw Error('Verified parent required');
  function policy(weights){const g=F.cloneGenome(genome);g.policyWeights=weights.slice();if(!require('../outputs/neural-learning.js').valid(sim.graph,g.policyWeights))throw Error('Invalid policy');return g;}
  function evaluate(weights,{maxTicks=60000,headingOffsetRad=0}={}){if(!Number.isFinite(headingOffsetRad)||Math.abs(headingOffsetRad)>.01)throw Error('Bounded physical heading required');const api={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}},r=fullRollout(api,sim.track,sim.graph,policy(weights),{rewardRevision:REVISION,maxTicks:maxTicks===0?Infinity:maxTicks});return outcome(F,r);}
  function episode({weights=genome.policyWeights,seed=7717,sign=1,std=[.015,.08],chunkSize=32,safetyCost=2000,exploration=null,maxTicks=60000,headingOffsetRad=0}={}){
    if(!Number.isFinite(headingOffsetRad)||Math.abs(headingOffsetRad)>.01)throw Error('Bounded physical heading required');
    if(!Number.isInteger(seed)||![1,-1].includes(sign)||std.length!==2||std.some(v=>!Number.isFinite(v)||v<0||v>.5)||
      !Number.isInteger(chunkSize)||chunkSize<1||chunkSize>64||!Number.isFinite(safetyCost)||safetyCost<0||safetyCost>10000)throw Error('Bounded episode required');
    if(!Number.isInteger(maxTicks)||maxTicks<0)throw Error('Finite watchdog or explicit zero for no simulated-time cap required');
    const tickLimit=maxTicks===0?Infinity:maxTicks;
    if(exploration)X.validate(exploration,sim.graph.learning.nodes.length);
    const g=policy(weights),car=F.makeCar(sim.track,0,g,REVISION),r=F.rng(seed),normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());
    car.heading+=headingOffsetRad;car.footprintSensorsEnabled=true;car.brain=F.makeBrain(sim.graph);car.previousGenerationLapTime=null;
    const chunks=[],trace=crypto.createHash('sha256');let ticks=0,controls=0,chunk=null,totalNativeReward=0,previous=null;
    while(car.alive&&ticks<tickLimit){
      if(controls%chunkSize===0){chunk={startControl:controls,initialActivity:Array.from(car.brain.activity),previousPolicyState:previous?structuredClone(previous):null,rows:[]};chunks.push(chunk);}
      car.inputs=F.sense(sim.track,car);car.physicsInputs=F.physicsSense(car,sim.track);car.sensorVector=car.inputs.concat(car.physicsInputs);
      const original=F.neuralStep(sim.graph,car.brain,g,car.sensorVector,true,true),observation=latent(sim.graph,car.brain,g),
        noise=exploration?X.scale(car.brain.policyFeatures,exploration):{sigma:std,gate:0},
        conditional=X.conditional(observation.mean,noise.sigma,previous,exploration?.rho??0),
        action=conditional.mean.map((v,a)=>v+sign*conditional.std[a]*normal()),long=Math.tanh(action[1]),
        commands=!exploration&&std.every(v=>v===0)?original:observation.active?[Math.tanh(action[0]),Math.max(0,long),Math.max(0,-long)]:[0,0,0],before=car.fitness;
      car.slowOutputs=commands;
      for(let k=0;k<6&&car.alive&&ticks<tickLimit;k++){F.drive(sim.track,car,commands);ticks++;}
      const reward=car.fitness-before;totalNativeReward+=reward;
      chunk.rows.push({sensors:car.sensorVector.slice(),features:Array.from(car.brain.policyFeatures),mean:observation.mean,active:observation.active,
        action,commands,sigma:noise.sigma,noiseGate:noise.gate,conditionalMean:conditional.mean,conditionalStd:conditional.std,
        rewardNative:reward,reward:reward/100,done:!car.alive});
      previous={mean:observation.mean,sigma:noise.sigma,action};
      trace.update(JSON.stringify([controls,commands,car.bestProgress,car.x,car.y,car.heading])+'\n');controls++;
    }
    if(car.alive)car.censored=true;
    const result=outcome(F,{car,ticks}),extraSafetyCost=result.safe?0:safetyCost;
    if(result.censored)throw Error('Incomplete episode cannot enter terminal-return training');
    chunks.at(-1).rows.at(-1).reward-=extraSafetyCost/100;
    if(Math.abs(totalNativeReward-car.fitness)>1e-7)throw Error('Native reward ledger does not reconcile');
    const record={id:episodes.length,seed,sign,std,chunkSize,exploration,headingOffsetRad,behaviorWeights:weights.slice(),result,chunks,controls,totalNativeReward,extraSafetyCost,
      trainingReward:(totalNativeReward-extraSafetyCost)/100,actionTraceSha256:trace.digest('hex')};
    episodes.push(record);return record;
  }
  function rescore(weights,advantages,{forceRecurrent=false}={}){
    const g=policy(weights);
    let offset=0,active=0,surrogate=0,kl=0,unclipped=0,allFrozen=true;
    for(const record of episodes){
      if(!record.exploration&&record.std.some(v=>v===0))throw Error('Stochastic training episodes required');
      const reference=record.behaviorWeights??genome.policyWeights,
        frozenAdapter=!forceRecurrent&&weights.slice(0,sim.graph.learning.readoutOffset).every((v,j)=>v===reference[j]);
      allFrozen&&=frozenAdapter;
      const brain=F.makeBrain(sim.graph);let previous=null;
      for(const chunk of record.chunks)for(const row of chunk.rows){
        let now;
        // A motor-only change cannot alter neural history for a fixed sensory
        // record. Use the already measured exact features only in that case.
        if(frozenAdapter)now={mean:featureLatent(sim.graph,row.features,g,row.active),active:row.active};
        else {F.neuralStep(sim.graph,brain,g,row.sensors,true,true);now=latent(sim.graph,brain,g);}
        const features=frozenAdapter?row.features:brain.policyFeatures,
          sigma=record.exploration?X.scale(features,record.exploration).sigma:record.std,
          conditional=X.conditional(now.mean,sigma,previous,record.exploration?.rho??0);
        previous={mean:now.mean,sigma,action:row.action};
        const advantage=advantages[offset++];if(!Number.isFinite(advantage))throw Error('Finite matching advantages required');
        if(!row.active)continue;
        const oldMean=row.conditionalMean??row.mean,oldStd=row.conditionalStd??record.std,
          ratio=Math.exp(Math.max(-20,Math.min(20,X.logp(row.action,conditional.mean,conditional.std)-X.logp(row.action,oldMean,oldStd))));
        surrogate+=Math.min(ratio*advantage,Math.max(.8,Math.min(1.2,ratio))*advantage);unclipped+=ratio*advantage;
        kl+=X.kl(oldMean,oldStd,conditional.mean,conditional.std);active++;
      }
    }
    if(offset!==advantages.length||!active)throw Error('Rollout/advantage alignment failed');
    return {activeRows:active,meanClippedSurrogate:surrogate/active,meanUnclippedSurrogate:unclipped/active,meanGaussianKL:kl/active,
      neuronalHistoryMode:allFrozen?'recorded-exact-frozen-adapter':'replayed-from-zero'};
  }
  function metadata(){const graph=sim.graph,p=graph.learning;return {parentSha256,genome,expected,globalPolicy:true,headingOffsetIsPhysicalOnly:true,appVersion:'5.6.0',rewardRevision:REVISION,
    graph:{n:graph.n,from:Array.from(graph.from),to:Array.from(graph.to),weights:Array.from(graph.weights),inputs:Array.from(graph.inputs),
      groups:Array.from(p.groups),readoutNodes:Array.from(p.nodes),readoutOffset:p.readoutOffset,iterations:4},scales:p.scales};}
  return {evaluate,episode,rescore,metadata,clear(){episodes.length=0;return {cleared:true};}};
}
if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  let id=null;try{if(line.length>2*1024*1024)throw Error('Bounded request required');const m=JSON.parse(line);id=m.id;let result;
    if(m.op==='init'){if(env)throw Error('Already initialized');env=create();result=env.metadata();}
    else if(!env)throw Error('Initialize first');else if(m.op==='episode')result=env.episode(m.configuration);
    else if(m.op==='evaluate')result=env.evaluate(m.weights,m.configuration);else if(m.op==='rescore')result=env.rescore(m.weights,m.advantages);
    else if(m.op==='clear')result=env.clear();
    else throw Error('Unsupported operation');process.stdout.write(JSON.stringify({id,result})+'\n');
  }catch(e){process.stdout.write(JSON.stringify({id,error:e.stack||String(e)})+'\n');}
});}
module.exports={create,latent};
