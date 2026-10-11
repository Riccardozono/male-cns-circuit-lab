'use strict';
// Synthetic scoring traces, not a real driving policy or successful lap.
const fs=require('node:fs'),path=require('node:path'),R=require('../outputs/rewards.js'),{fixture}=require('../outputs/tests/fixtures/reward-rollout.cjs');
const output=path.resolve(__dirname,'../outputs/learning-diagnosis-v500');
function trace(seconds){
  const {track,car,move}=fixture({total:5793,referenceMps:45});
  move(20*(seconds-1/60),seconds-1/60,{forwardClearance:Infinity});move(20/60,1/60,{collision:true,forwardClearance:Infinity});
  if(car.alive||car.reason!=='urto')throw Error('Synthetic crash fixture failed');
  return{label:'Synthetic continuous 20 m/s trace ending in the same-speed collision',seconds,metres:car.bestProgress,fitness:car.fitness,reward:car.reward,penalty:car.penalty,breakdown:car.rewardBreakdown,reason:car.reason,referenceSeconds:R.referenceLapTime(track)};
}
const short=trace(2.5),long=trace(5),crossesGate=trace(10);
const evidence={generatedAt:new Date().toISOString(),rewardRevision:R.REVISION,synthetic:true,short,long,longerDriveGetsWorseFitness:long.fitness<short.fitness,netDifference:long.fitness-short.fitness,checkpointCounterexample:{short:long,long:crossesGate,netDifference:crossesGate.fitness-long.fitness,note:'Crossing a new checkpoint can offset the time cost: not every longer trace is worse.'},calculation:{noLapMarginalProgressPerLap:R.RULES.progressPerLap+R.RULES.missingLapPenalty,timePerLap:R.RULES.timePerReferenceLap,referenceMps:45,netProgressBreakEvenMps:R.RULES.timePerReferenceLap*45/(R.RULES.progressPerLap+R.RULES.missingLapPenalty),scope:'Below one lap, between checkpoint rewards, equal collision speed and no risk/slip costs.'},boundary:'Scoring-only synthetic trajectories with identical speed and terminal cause, not actual Monza neural driving, no training injection. Collision step earns no progress.'};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'reward-audit.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
