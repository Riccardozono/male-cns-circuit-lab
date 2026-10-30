'use strict';
// Isolated training evaluator: baseline-relative forward stopping-risk shaping.
// Physical simulation, neural policy, rays, and the production reward ledger are unchanged.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const Native=require('./neural-prior-gated-kernel-native-driver-refresh.cjs');
const Motors=require('./neural-prior-greedy-kernel-motors.cjs');
const R8=require('./neural-prior-training-objective-r8.cjs');

const DEFAULT_MODEL='.impeccable/review/neural-sacl/driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json';
const RISK_MULTIPLIER=1200, CHECKPOINT_METERS=6350;
function create({modelFile=DEFAULT_MODEL,riskMultiplier=RISK_MULTIPLIER}={}){
  assert.equal(riskMultiplier,RISK_MULTIPLIER,'Only the evidence-calibrated isolated scale is allowed');
  const env=Native.create({modelFile,gateSource:'lastFrontierPeak'}),metadata=env.metadata(),initial=Motors.initialWeights();
  let s=env.reset(),controls=0;const prefixHash=crypto.createHash('sha256'),started=performance.now();
  while(!s.complete&&s.bestProgress<CHECKPOINT_METERS&&performance.now()-started<180000){
    s=env.step(initial);controls++;prefixHash.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');
  }
  assert.ok(!s.complete&&s.bestProgress>=CHECKPOINT_METERS&&s.laps===1,'Actually reached the same first-lap checkpoint required');
  const checkpoint=env.capture(),checkpointInfo={progress:s.bestProgress,controls:s.controls,laps:s.laps,simulationSeconds:s.totalSimulationSeconds,risk:s.car.rewardBreakdown.penalties.risk};

  function simulate(weights,mode){
    Motors.validate(weights);assert.ok(['full','practice'].includes(mode));
    s=mode==='full'?env.reset():env.restore(checkpoint);
    const riskAtStart=s.car.rewardBreakdown.penalties.risk;
    const start={kind:mode==='full'?'line':'actual-neuronal-prefix',progress:s.bestProgress,controls:s.controls,laps:s.laps,simulationSeconds:s.totalSimulationSeconds};
    const hash=mode==='full'?crypto.createHash('sha256'):prefixHash.copy(),t=performance.now();let overlap=0;
    while(!s.complete&&performance.now()-t<180000){
      s=env.step(weights);hash.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');
      overlap+=Number(Math.min(s.car.outputs[1],s.car.outputs[2])>0);
    }
    const result={bestProgress:s.bestProgress,fitness:s.fitness,laps:s.laps,reason:s.reason,complete:s.complete,totalSimulationSeconds:s.totalSimulationSeconds,lapTimes:s.lapTimes.slice(),controls:s.controls};
    const riskExposure=Math.max(0,s.car.rewardBreakdown.penalties.risk-riskAtStart);
    return {result,complete:s.complete,censored:!s.complete,overlap,validationMode:mode==='full'?'full-from-line':'restored-prior-checkpoint',
      episodeStart:start,actualNewControls:s.controls-start.controls,actualNewProgress:s.bestProgress-start.progress,actualNewLapGates:s.laps-start.laps,
      actualNewSimulationSeconds:s.totalSimulationSeconds-start.simulationSeconds,riskExposure,riskTotal:s.car.rewardBreakdown.penalties.risk,
      collisionPenalty:s.car.rewardBreakdown.penalties.collision,actionTraceSha256:hash.digest('hex')};
  }

  const reference=simulate(initial,'practice');
  assert.ok(reference.complete&&!reference.censored&&!reference.overlap,'Uncensored zero-policy risk reference required');
  const referenceRiskExposure=reference.riskExposure;
  function evaluate(weights,mode='practice'){
    const episode=simulate(weights,mode),riskExcess=Math.max(0,episode.riskExposure-referenceRiskExposure);
    const trainingFitness=R8.fitness(episode.result)-RISK_MULTIPLIER*riskExcess;
    return {...episode,trainingFitness,riskReferenceExposure:referenceRiskExposure,riskExcess,riskMultiplier:RISK_MULTIPLIER,
      boundary:'Training-only ranking: R8 score minus 1200 times actual own-episode forward stopping-risk above the zero-policy reference. No imposed brake/throttle/steering targets; risk is measured by the unchanged physical reward ledger.'};
  }
  env.restore(checkpoint);
  return {evaluate,metadata:()=>({...metadata,checkpoint:checkpointInfo,cuda:{identity:require('./cuda-exact-v3-packed-runtime.cjs').identity(),stats:Native.stats()},
    riskObjective:{format:'baseline-relative-actual-stopping-risk-v1',multiplier:RISK_MULTIPLIER,referenceExposure:referenceRiskExposure,referenceResult:reference.result,
      referenceTraceSha256:reference.actionTraceSha256,checkpointRisk:checkpointInfo.risk,calibration:'1200 × the measured candidate-minus-reference risk delta (0.5121) is about 19% of its measured terminal collision penalty (3280.37); exploratory coefficient, not a validated optimum.'}})};
}

if(require.main===module){let env;require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{let id=null;try{
  if(line.length>32768)throw Error('Bounded request required');const m=JSON.parse(line);id=m.id;let result;
  if(m.op==='init'){if(env)throw Error('Already initialized');env=create(m.configuration||{});result=env.metadata();}
  else if(!env)throw Error('Initialize first');else if(m.op==='evaluate')result=env.evaluate(m.weights,m.mode);else if(m.op==='metadata')result=env.metadata();else throw Error('Unsupported operation');
  process.stdout.write(JSON.stringify({id,result})+'\n');
}catch(e){process.stdout.write(JSON.stringify({id,error:e.stack})+'\n');}});}
module.exports={create,RISK_MULTIPLIER,CHECKPOINT_METERS};
