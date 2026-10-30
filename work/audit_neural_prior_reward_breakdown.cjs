'use strict';
// Actual full-episode reward ledger for the already verified zero and candidate policies.
// No model, simulator, source save, or production reward code is changed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const Native=require('./neural-prior-gated-kernel-native-driver-refresh.cjs');
const Motors=require('./neural-prior-greedy-kernel-motors.cjs');
const Identity=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl');
const modelFile=path.join(base,'driver-current-refresh-v2/clean-current-driver-copy.malecns-instant-context.json');
const study=path.join(base,'learned-prior-frontier3-gated-kernel-r8-16x16');
const nativeProof=JSON.parse(fs.readFileSync(path.join(study,'archive-native.json'),'utf8'));
const anchor=JSON.parse(fs.readFileSync(path.join(base,'learned-prior-final-readout-preflight/anchor.json'),'utf8'));
const output=path.join(base,'reward-breakdown-v1');
const genes=nativeProof.candidate.genes;

function trace(weights,label,expected){
  const hash=crypto.createHash('sha256'),driver=Native.create({modelFile,gateSource:'lastFrontierPeak'});
  const riskWindow=[];let s=driver.reset(),controls=0,overlapTicks=0,positiveThrottleTicks=0,positiveBrakeTicks=0;
  let lastRisk=s.car.rewardBreakdown.penalties.risk,riskTicks=0,maxRiskPerStep=0;
  const started=performance.now();
  try {
    while(!s.complete&&controls<20000&&performance.now()-started<360000){
      s=driver.step(weights);controls++;
      hash.update(JSON.stringify([s.bestProgress,s.totalSimulationSeconds,s.car.outputs])+'\n');
      const [steer,throttle,brake]=s.car.outputs;overlapTicks+=Number(throttle>1e-9&&brake>1e-9);
      positiveThrottleTicks+=Number(throttle>1e-9);positiveBrakeTicks+=Number(brake>1e-9);
      const penalties=s.car.rewardBreakdown.penalties,riskDelta=penalties.risk-lastRisk;lastRisk=penalties.risk;
      if(riskDelta>1e-12){riskTicks++;maxRiskPerStep=Math.max(maxRiskPerStep,riskDelta);}
      const v=s.car.vehicle||{},physics=s.car.physicsInputs||[];
      riskWindow.push({tick:controls,seconds:s.totalSimulationSeconds,speedMps:Number.isFinite(v.speedMps)?v.speedMps:null,
        forwardClearanceNorm:Number.isFinite(physics[9])?physics[9]:null,throttle,brake,riskDelta,reason:s.reason||null});
      if(riskWindow.length>24)riskWindow.shift();
    }
    assert.ok(s.complete,`${label}: episodio fisico completato richiesto`);
    const traceHash=hash.digest('hex');assert.deepEqual({bestProgress:s.bestProgress,fitness:s.fitness,laps:s.laps,reason:s.reason,complete:s.complete,totalSimulationSeconds:s.totalSimulationSeconds,lapTimes:s.lapTimes.slice(),controls:s.controls},expected.result);
    assert.equal(traceHash,expected.actionTraceSha256);
    const rb=s.car.rewardBreakdown,ledger={rewards:{...rb.rewards},penalties:{...rb.penalties},reward:s.car.reward,penalty:s.car.penalty,fitness:s.car.fitness};
    return {label,result:{bestProgress:s.bestProgress,fitness:s.fitness,laps:s.laps,reason:s.reason,totalSimulationSeconds:s.totalSimulationSeconds,lapTimes:s.lapTimes.slice(),controls:s.controls},
      traceSha256:traceHash,ledger,risk:{ticks:riskTicks,maxPerControl:maxRiskPerStep,shareOfPenalties:ledger.penalty?ledger.penalties.risk/ledger.penalty:0},
      pedals:{overlapTicks,positiveThrottleTicks,positiveBrakeTicks},terminalWindow:riskWindow.slice(-12)};
  } finally { driver.close?.(); }
}

let report;
try {
  assert.ok(nativeProof.passed,'Precedente verifica nativa richiesta');
  const baseline=trace(Motors.initialWeights(),'zero policy',anchor.expectedResult?{result:anchor.expectedResult,actionTraceSha256:anchor.traceSha256}:null);
  const candidate=trace(genes,'frontier3 candidate',{result:nativeProof.candidate.fullFromLineNativeProofs[0].result,actionTraceSha256:nativeProof.candidate.fullFromLineNativeProofs[0].actionTraceSha256});
  report={passed:true,format:'male-cns-actual-neural-reward-breakdown-v1',boundary:'Full native neural policy and frozen experimental-penalty5 Porsche physics; terminal reward ledger read after each actual episode. No imposed action, route or teacher. Exact known result and action-trace hashes required.',
    modelSha256:Identity.sha(fs.readFileSync(modelFile)),sourceHashes:Identity.collect(['work/audit_neural_prior_reward_breakdown.cjs','work/neural-prior-gated-kernel-native-driver-refresh.cjs','work/neural-prior-memory-core-driver-refresh.cjs','.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/rewards.js','.impeccable/experimental-penalty5/outputs/vehicle-992.js']),baseline,candidate,
    comparison:{riskPenaltyDelta:candidate.ledger.penalties.risk-baseline.ledger.penalties.risk,collisionPenaltyDelta:candidate.ledger.penalties.collision-baseline.ledger.penalties.collision,
      candidateTerminalRiskToCollisionRatio:candidate.ledger.penalties.collision?candidate.ledger.penalties.risk/candidate.ledger.penalties.collision:null,
      sameCompletedLaps:baseline.result.laps===candidate.result.laps,sameBestLapTime:baseline.result.lapTimes[0]===candidate.result.lapTimes[0]}};
} catch(error) { report={passed:false,error:String(error?.stack||error),boundary:'Failed reward-ledger audit; do not infer a cause or alter the user model.'}; }
finally { Native.close(); }
if(report.passed){fs.mkdirSync(output,{recursive:true});report.reportSha256=Identity.sha(JSON.stringify(report));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});}
console.log(JSON.stringify(report.passed?{passed:true,reportFile:path.join(output,'report.json'),baseline:{result:report.baseline.result,ledger:report.baseline.ledger,risk:report.baseline.risk},candidate:{result:report.candidate.result,ledger:report.candidate.ledger,risk:report.candidate.risk,terminalWindow:report.candidate.terminalWindow},comparison:report.comparison}:{passed:false,error:report.error}));
if(!report.passed)process.exitCode=1;
