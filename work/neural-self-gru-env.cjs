'use strict';
// On-policy physical environment. The actor sees only actual anatomical
// neural activity through a fixed recurrent encoder; reward is current app fitness.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Runtime=require('./current-physics-runtime.cjs'),G=require('./neural-self-gru.cjs'),R=require('./neural-self-readout.cjs');
const Dense=require('../outputs/dense-neural.js'),Cuda=require('./cuda-exact-v3-runtime.cjs');
function learningSignal(mode,{progressDelta,lapsDelta,fitnessDelta,terminal,safe,trackLength}){
  if(mode==='fitness')return {reward:fitnessDelta,progressReward:0,lapReward:0,unsafeTerminalPenalty:0};
  if(mode!=='optimizer-progress-curriculum'||![progressDelta,lapsDelta,fitnessDelta,trackLength].every(Number.isFinite)||trackLength<=0)throw Error('Supported, finite learning reward required.');
  const progressReward=Math.max(0,progressDelta),lapReward=Math.max(0,lapsDelta)*trackLength;
  // With a two-lap cap, all safe distance and lap credits total at most 4L;
  // 6L makes every terminal unsafe episode rank below any safe no-lap run.
  const unsafeTerminalPenalty=terminal&&!safe?6*trackLength:0;
  return {reward:progressReward+lapReward-unsafeTerminalPenalty,progressReward,lapReward,unsafeTerminalPenalty};
}
function create({modelFile,population=16,seed=850820,rewardMode='fitness'}={}){
  if(!Number.isInteger(population)||population<1||population>16)throw Error('Owned population in [1,16] required.');
  if(!['fitness','optimizer-progress-curriculum'].includes(rewardMode))throw Error('Unsupported research reward mode.');
  const d=G.load(path.resolve(modelFile)),before=Runtime.sourceHashes();
  if(JSON.stringify(d.sourceSha256)!==JSON.stringify(before))throw Error('Model/current source mismatch.');
  const F=Runtime.create('strict').F,sim=new F.Simulation(require('../outputs/legacy-models.js').tagV3(require('../outputs/data/connectome.json')),
    {modelId:'v3',population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
  const {graph,track}=sim,random=F.rng(seed),oldDense=Dense.step;
  Dense.step=(...a)=>Cuda.pass(...a);
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());
  const verify=()=>{if(JSON.stringify(Runtime.sourceHashes())!==JSON.stringify(before))throw Error('Physical source changed during on-policy training.');};
  function prepare(lane){
    const input=lane.observer.observe(lane.car,lane.previous);lane.signal=lane.observer.signal();
    lane.policy.step(input,lane.signal);lane.x=lane.policy.state();lane.car.brain=lane.observer.brain;
  }
  function lane(id){
    const car=F.makeCar(track,id,F.cloneGenome(d.observerSpec.baseGenome));car.footprintSensorsEnabled=true;
    const value={car,observer:R.observer(F,graph,track,d.observerSpec),policy:G.policy(d),previous:[0,0],id,learningRewardTotal:0};prepare(value);return value;
  }
  function reset(value){const replacement=lane(value.id);Object.assign(value,replacement);}
  const lanes=Array.from({length:population},(_,id)=>lane(id));
  function weights(w){if(!Array.isArray(w)||w.length!==2*d.hiddenSize+2||w.some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw Error('Finite bounded actual motor head required.');}
  function mean(x,w){return Array.from({length:2},(_,a)=>{let v=w[2*d.hiddenSize+a];for(let j=0;j<x.length;j++)v+=w[a*d.hiddenSize+j]*x[j];return v;});}
  function step(value,latent){
    const x=value.x.slice(),signal=value.signal,commands=signal?[Math.tanh(latent[0]),Math.max(0,Math.tanh(latent[1])),Math.max(0,-Math.tanh(latent[1]))]:[0,0,0];
    const oldFitness=value.car.fitness,oldProgress=value.car.bestProgress,oldLaps=value.car.laps;
    for(let tick=0;tick<6&&value.car.alive;tick++)F.drive(track,value.car,commands,F.DT);
    const car=value.car,done=!car.alive,safe=F.isSafeLearningOutcome(car),rawFitnessDelta=car.fitness-oldFitness;
    const objective=learningSignal(rewardMode,{progressDelta:car.bestProgress-oldProgress,lapsDelta:car.laps-oldLaps,fitnessDelta:rawFitnessDelta,terminal:done,safe,trackLength:track.total});
    const reward=objective.reward;value.learningRewardTotal+=reward;
    const episode=done?{id:value.id,progress:car.bestProgress,laps:car.laps,fitness:car.fitness,learningRewardTotal:value.learningRewardTotal,reward:car.reward,penalty:car.penalty,baseFitness:car.baseFitness,rewardBreakdown:JSON.parse(JSON.stringify(car.rewardBreakdown)),reason:car.reason,seconds:car.lifetime,safe,lapTimes:car.lapTimes.slice()}:null;
    value.previous=[car.outputs[0],car.outputs[1]-car.outputs[2]];
    if(!done)prepare(value);
    return {x,action:latent.slice(),reward,rawFitnessDelta,objective,done,actorEnabled:signal,next:done?Array(d.hiddenSize).fill(0):value.x.slice(),episode};
  }
  function rollout(w,std,steps){
    weights(w);if(!Array.isArray(std)||std.length!==2||std.some(v=>!Number.isFinite(v)||v<.001||v>.3)||!Number.isInteger(steps)||steps<1||steps>512)throw Error('Bounded rollout required.');
    const batches=[],episodes=[];
    for(const value of lanes){const rows=[];for(let k=0;k<steps;k++){
      if(!value.car.alive)reset(value);
      const mu=mean(value.x,w),a=mu.map((v,j)=>v+std[j]*gaussian()),row=step(value,a);row.mean=mu;
      if(row.episode){episodes.push(row.episode);delete row.episode;}
      rows.push(row);
    }batches.push(rows);}
    verify();const gpu=Cuda.stats();if(!gpu.gpuCalls||gpu.cpuFallbacks)throw Error('Actual anatomical CUDA inference required.');
    const laneSummaries=lanesSnapshot();
    return {batches,episodes,lanes:laneSummaries,gpu};
  }
  function evaluate(w){
    weights(w);const value=lane(0),trace=crypto.createHash('sha256');let controls=0;
    while(value.car.alive&&controls<50000){step(value,mean(value.x,w));const c=value.car;
      trace.update(JSON.stringify([c.x,c.y,c.heading,c.outputs,c.bestProgress,c.laps])+'\n');controls++;
    }
    const c=value.car;verify();return {progress:c.bestProgress,laps:c.laps,fitness:c.fitness,reason:c.reason,
      seconds:c.lifetime,lapTimes:c.lapTimes.slice(),complete:!c.alive,censored:c.alive,safe:F.isSafeLearningOutcome(c),
      controls,reward:c.reward,penalty:c.penalty,baseFitness:c.baseFitness,rewardBreakdown:JSON.parse(JSON.stringify(c.rewardBreakdown)),actionTraceSha256:trace.digest('hex'),meetsTwoLapPhysicalGoal:!c.alive&&c.laps>=2&&F.isSafeLearningOutcome(c)};
  }
  function lanesSnapshot(){return lanes.map(value=>{const c=value.car;return {id:value.id,progress:c.bestProgress,laps:c.laps,fitness:c.fitness,reason:c.reason||null,seconds:c.lifetime,alive:c.alive,speedMps:c.vehicle.speedMps,safe:F.isSafeLearningOutcome(c),rewardBreakdown:JSON.parse(JSON.stringify(c.rewardBreakdown))};});}
  const legacy=Object.keys(require.cache).filter(p=>/neural-statehead|neural-frontier-chain|neural-command-live/.test(p));
  if(legacy.length)throw Error('No prior driving policy may be imported.');
  return {rollout,evaluate,metadata:()=>({format:'male-cns-neural-self-gru-ppo-env-v1',hiddenSize:d.hiddenSize,population,seed,rewardMode,
    sourceSha256:before,rewardRevision:F.Rewards.REVISION,modelSha256:R.sha(fs.readFileSync(modelFile)),legacyPolicyModules:legacy,
    boundary:'Actual current physical episodes and footprint-aware brain; frozen recurrent neural encoder, learned two-action head. Strict app physical termination and official scores remain recorded. optimizer-progress-curriculum mirrors safe-first, pre-lap progress selection; terminal failures receive a separate training-only safety cost. No practice restoration or prior controller.'}),
    close:()=>{Dense.step=oldDense;Cuda.close();}};
}
if(require.main===module){
  let env;const rl=require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line',line=>{let id=null;try{if(line.length>1024*1024)throw Error('Bounded request required.');const m=JSON.parse(line);id=m.id;let result;
    if(m.op==='init'){if(env)throw Error('Already initialized.');env=create(m.configuration);result=env.metadata();}
    else if(!env)throw Error('Initialize first.');
    else if(m.op==='rollout')result=env.rollout(m.weights,m.std,m.steps);
    else if(m.op==='evaluate')result=env.evaluate(m.weights);
    else if(m.op==='close'){env.close();env=null;result={closed:true};rl.close();}
    else throw Error('Unsupported operation.');
    process.stdout.write(JSON.stringify({id,result})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack})+'\n');}});
  process.on('exit',()=>env?.close());
}
module.exports={create,learningSignal};
