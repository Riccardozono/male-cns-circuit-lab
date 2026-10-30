'use strict';
// Replay actual previously learned policies and inspect the evaluator only.
// No made-up actions, body targets, modified rewards or training examples.
const fs=require('node:fs'),path=require('node:path'),Linear=require('./neural-context-linear-env.cjs'),Head=require('./neural-json-head.cjs'),Live=require('./neural-context-live.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl/ranking-audit');
if(fs.existsSync(path.join(dir,'report.json')))throw Error('Preserve prior audit');fs.mkdirSync(dir,{recursive:true});
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'.impeccable/review/neural-sacl',name,'report.json'),'utf8'));
const parent=read('frontier-retained-cma-first'),linear=read('frontier-linear-cma-first'),env=Linear.create();
const selected=[{label:'verified-parent',weights:parent.champion.weights.concat(Array(8).fill(0))},{label:'learned-explorer',weights:linear.explorer.weights},
  {label:'previous-controller',weights:Array(10).fill(0)},
  {label:'actual-earlier-termination',weights:parent.records.find(row=>row.episode.result.fitness>-2331.9036376601734&&row.episode.result.bestProgress<1990.41260481475).weights.concat(Array(8).fill(0))}];
const trials=[];
for(const policy of selected){
  let s=env.rawReset('practice'),initial=s.info.fitness,rewards=[],overlap=0;
  while(true){s=env.rawStep(env.action(s.observation,policy.weights));rewards.push(s.reward);const commands=env.inspect().lastCommands;overlap+=Number(commands[1]>0&&commands[2]>0);if(s.terminated||s.truncated)break;}
  const discounted=Object.fromEntries([.9,.99,.999,1].map(gamma=>[String(gamma),rewards.reduce((sum,reward,k)=>sum+reward*gamma**k,0)]));
  const car=env.inspect().car;
  if(Math.abs(discounted['1']-(s.info.fitness-initial)/100)>1e-10||overlap||s.truncated)throw Error('Actual undiscounted reward disagrees with physical score');
  trials.push({label:policy.label,weights:policy.weights,result:s.info,initialFitness:initial,controls:rewards.length,discountedReturns:discounted,rewardBreakdown:car.rewardBreakdown,gasBrakeOverlapSteps:overlap});
}
const native=Live.create(path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json')),rules=native.runtime.Rewards.RULES;
const safe=trials[0],explorer=trials[1],marginalPerMetre=(rules.progressPerLap+rules.missingLapPenalty+rules.checkpointPerLap)/native.track.total;
const rankings=Object.fromEntries([.9,.99,.999,1].map(g=>[String(g),trials.toSorted((a,b)=>b.discountedReturns[String(g)]-a.discountedReturns[String(g)]).map(t=>t.label)]));
const report={passed:true,trials,rankings,trainingGamma:.999,scoreBarrier:{actualSafeProgress:safe.result.bestProgress,actualExplorerProgress:explorer.result.bestProgress,
  actualSafeFitness:safe.result.fitness,actualExplorerFitness:explorer.result.fitness,fitnessGap:safe.result.fitness-explorer.result.fitness,
  actualFailureCostDifference:rules.collision-rules.stall,marginalApproximatePointsPerMetre:marginalPerMetre,
  approximateExtraMetresToOffsetFailureDifference:(rules.collision-rules.stall)/marginalPerMetre},
  environment:env.metadata(),sourceSha256:Head.sha(fs.readFileSync(__filename,'utf8')),
  boundary:'Actual physically replayed previously learned candidates under unchanged rewards. Gamma=1 exactly equals actual score change. Barrier conversion is a rough pre-lap estimate, not a new reward, proof of cause, corner geometry, target action or guarantee that diversity search converges. Diagnostic results never enter the controller.'};
fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log('RANKING_AUDIT '+JSON.stringify({passed:true,scoreBarrier:report.scoreBarrier,rankings}));
