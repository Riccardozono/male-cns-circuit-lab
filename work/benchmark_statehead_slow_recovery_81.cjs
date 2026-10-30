'use strict';
// Research-only paired replay: preserve the existing slow-pace penalty, but
// continue if the car is currently above the minimum speed and advancing.
// No control action, route, user save, or application source is changed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const Env=require('./statehead-slow-pace-replay-env-81.cjs');
const Live=require('./neural-statehead-rl-live.cjs');
const F=require('../.impeccable/experimental-penalty5/outputs/simulation.js');
const Model=require('./neural-statehead-cuda-model.cjs');
const Identity=require('./neural-research-source-identity.cjs');
const base=path.join(root,'.impeccable/review/learning-ml');
const runDir=path.join(base,'statehead-frontier-causalcritic-16ep-gae1-distance5-ppo-4up-20261026-79');
const analysisFile=path.join(base,'statehead-slow-termination-tail-analysis-20261026-80/report.json');
const basisFile=path.join(base,'statehead-fulltrace-gate-basis-20261026-41/basis.private.json');
const out=path.join(base,'statehead-moving-slow-recovery-paired-20261026-81');
const save='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const expectedSave='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const expectedAnalysis='e4e9669dff2271b97c703fc294f711376d7a18986b4458d6fa6963733307c06f';
const expectedRun='a406b8c01d5525498f2d9ae94cbeb1b5e5f6bdedc70f40130494986a1a382f28';
const shaFile=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unsafe=new Set(['urto','fuori pista','progresso non valido']);
let resumeEvents=[];

function recoveringDrive(track,car,commands,dt=F.DT){
  if(!car.alive)return;
  const beforeHigh=car.rewardState.highWater,penalties=car.rewardBreakdown.penalties;
  const beforeNoLap=penalties.noLap||0,beforeNoLapValue=car.noLapPenalty,
    beforeNoLapApplied=car.noLapPenaltyApplied,beforeSlow=penalties.slowProgress||0;
  const [steering,throttle,brake]=F.normalizeDriveCommands(commands);
  car.outputs=[steering,throttle,brake];
  F.Vehicle.step(car,car.outputs,dt,F.Vehicle.Terrain.forTrack(track));
  const nearest=F.locate(track,car.x,car.y);
  F.Rewards.step(track,car,{along:nearest.along,segmentIndex:nearest.segmentIndex,
    onRoad:track.explicitBoundaries?F.onRoad(track,car.x,car.y):nearest.distance<=track.halfWidth+5,
    collision:F.collided(track,car),forwardClearance:F.raycast(track,car.x,car.y,car.heading),dt});
  const minimumMps=(track.total/F.Rewards.referenceLapTime(track)*F.Rewards.RULES.minPaceFraction)/(track.pixelsPerMeter||1);
  const speedMps=Math.abs(car.vehicle?.speedMps??0),advance=car.rewardState.highWater-beforeHigh;
  if(!car.alive&&car.reason==='troppo lenta / senza progresso'&&speedMps>=minimumMps&&advance>1e-12){
    const slowAdded=(penalties.slowProgress||0)-beforeSlow,noLapRefund=(penalties.noLap||0)-beforeNoLap;
    if(Math.abs(slowAdded-F.Rewards.RULES.stall)>1e-9||noLapRefund< -1e-9)
      throw Error('Unexpected slow-pace or no-lap reward ledger');
    resumeEvents.push({x:car.x,y:car.y,heading:car.heading,bestProgress:car.bestProgress,
      lifetime:car.lifetime,speedMps,minimumMps,stepAdvance:advance,commands:car.outputs.slice(),
      slowPenaltyRetained:slowAdded,prematureNoLapRefund:noLapRefund});
    // finish() has charged a no-lap penalty because it thought the episode
    // ended. Revert only that premature finalization; retain the slow penalty.
    penalties.noLap=beforeNoLap;car.penalty-=noLapRefund;
    car.noLapPenalty=beforeNoLapValue;car.noLapPenaltyApplied=beforeNoLapApplied;
    car.rewardState.finalized=false;car.alive=true;car.reason='';
    car.fitness=car.reward-car.penalty;
    car.baseFitness=car.reward-Object.entries(penalties).reduce((sum,[key,value])=>sum+(key==='regression'?0:value),0);
  }
  if(!car.alive)F.Vehicle.stop(car);
}

function compact(e){return {result:e.result,controls:e.controls,safe:e.safe,censored:e.censored,
  traceSha256:e.traceSha256,prefixTraceSha256:e.diagnosticPrefixTraceSha256,finalPhysical:e.finalPhysical,
  trainingReward:e.trainingReward,nativeRewardAfterReset:e.nativeRewardAfterReset};}
function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 is required');
  if(fs.existsSync(out))throw Error('Preserve the existing diagnostic directory');
  if(shaFile(save)!==expectedSave||shaFile(analysisFile)!==expectedAnalysis||shaFile(path.join(runDir,'report.json'))!==expectedRun)
    throw Error('Original save or diagnostic input hash differs');
  const run=read(path.join(runDir,'report.json')),verification=read(path.join(runDir,'verification.json')),
    analysis=read(analysisFile),identity=read(path.join(runDir,'identity.json'));
  if(!run.passed||run.learningSucceeded||run.trainingFrontierAdvanced||!verification.passed||
     verification.reportSha256!==expectedRun||!analysis.completed||analysis.sourceReportSha256!==expectedRun)
    throw Error('Verified unchanged research policy and paired analysis required');
  const targets=analysis.slowEpisodes.filter(e=>e.bestProgress<50);
  if(targets.length!==7||targets.some(e=>e.controls!==161))throw Error('Expected seven observed early slow-pace stops');
  const summaries=run.events.flatMap(e=>e.episodeSummaries),weights=run.trainingFrontier.weights,
    exploration=run.trainingFrontier.exploration;
  const verifiedBaseline={observed:identity.baseline.observed,controls:identity.baseline.controls,
    traceSha256:identity.baseline.traceSha256,parentSha256:identity.parentSha256};
  const env=Env.create({basisOverride:read(basisFile),instantGate:true,verifiedBaseline});
  const common={weights,exploration,resetMode:'from-line',gateFloor:0,safetyCost:2000,noLapCost:4000,progressShapingPerMeter:5};
  const controls=[];
  for(const target of targets){
    const expected=summaries.find(e=>e.seed===target.seed&&e.sign===target.sign);
    if(!expected||expected.traceSha256!==target.traceSha256)throw Error('Target does not match the archived run');
    const e=env.episode({...common,seed:target.seed,sign:target.sign,diagnosticPrefixControl:target.controls-1});
    if(e.censored||e.controls!==target.controls||e.traceSha256!==target.traceSha256||!same(e.result,expected.result)||!e.diagnosticPrefixTraceSha256)
      throw Error('Control failed to reproduce the complete archived trajectory');
    controls.push({seed:target.seed,sign:target.sign,...compact(e),lastCommands:e.rows.at(-1).commands.slice()});
    env.clear();
    console.log('SLOW_RECOVERY_CONTROL '+JSON.stringify({seed:target.seed,sign:target.sign,progress:e.result.bestProgress,controls:e.controls}));
  }
  Live.installDriveOverride(recoveringDrive);
  const pairs=[];
  for(const control of controls){
    resumeEvents=[];
    const e=env.episode({...common,seed:control.seed,sign:control.sign,diagnosticControlLimit:1200,diagnosticPrefixControl:control.controls-1});
    if(e.diagnosticPrefixTraceSha256!==control.prefixTraceSha256)throw Error('Physical prefix before the terminal control differs');
    if(resumeEvents.length){
      const first=resumeEvents[0],p=control.finalPhysical;
      if(!['x','y','heading','bestProgress','lifetime'].every(key=>Math.abs(first[key]-p[key])<1e-10)||!same(first.commands,control.lastCommands))
        throw Error('First continuation event differs from the original stopping state');
    }else if(e.traceSha256!==control.traceSha256||!same(e.result,control.result))throw Error('A non-resumed treatment must reproduce the original termination');
    pairs.push({seed:control.seed,sign:control.sign,control,treatment:compact(e),resumeEvents:structuredClone(resumeEvents),
      prefixMatches:true,firstResumeMatchesControlStop:resumeEvents.length>0,
      extraProgress:e.result.bestProgress-control.result.bestProgress});
    env.clear();
    console.log('SLOW_RECOVERY_PAIR '+JSON.stringify({seed:control.seed,sign:control.sign,resumes:resumeEvents.length,
      control:control.result.bestProgress,treatment:e.result.bestProgress,reason:e.result.reason,
      laps:e.result.laps,censored:e.censored}));
  }
  const gpu=env.stats();
  if(gpu.gpuCalls<=0||gpu.gpuCalls!==gpu.calls||gpu.cpuFallbacks!==0||shaFile(save)!==expectedSave)
    throw Error('CUDA use, fallback or save identity check failed');
  const sources=Identity.collect(['work/benchmark_statehead_slow_recovery_81.cjs','work/statehead-slow-pace-replay-env-81.cjs',
    'work/statehead-continuous-ppo-env.cjs','work/neural-statehead-rl-live.cjs',
    '.impeccable/experimental-penalty5/outputs/simulation.js','.impeccable/experimental-penalty5/outputs/rewards.js',
    '.impeccable/experimental-penalty5/outputs/vehicle-992.js','outputs/data/connectome.json','outputs/data/circuits.json']);
  const summary={episodes:pairs.length,resumed:pairs.filter(p=>p.resumeEvents.length).length,
    advancedBeyond50:pairs.filter(p=>p.treatment.result.bestProgress>50).length,
    advancedBeyond100:pairs.filter(p=>p.treatment.result.bestProgress>100).length,
    collision:pairs.filter(p=>unsafe.has(p.treatment.result.reason)).length,
    censored:pairs.filter(p=>p.treatment.censored).length,
    laps:pairs.reduce((n,p)=>n+p.treatment.result.laps,0),
    maximumProgress:Math.max(...pairs.map(p=>p.treatment.result.bestProgress))};
  const report={format:'statehead-moving-slow-recovery-paired-diagnostic-v1',passed:true,learningSucceeded:false,approvedForApp:false,
    appVersion:'5.6.0',model:'V3 research policy, Monza',method:'Seven archived early slow-pace stops, same weights and paired stochastic seeds. Continue only when the slow-pace termination occurs while current speed is at least the minimum and new high-water progress is positive; retain its severe penalty and all other physical terminations. The no-lap penalty is refunded only when a premature finalization is undone. Diagnostic cap 1200 controls; alive episodes are marked censored.',
    protectedBaselineSource:'cached original-rule identity; no protected-policy replay under the alternate rule',
    analysisSha256:expectedAnalysis,sourceRunSha256:expectedRun,basisSha256:shaFile(basisFile),
    originalSaveSha256:shaFile(save),sourceHashes:sources,gpu,summary,pairs,
    boundary:'One research policy and seven selected Monza episodes. A continuation is not population learning, a safe lap, a generalization result, app integration, or save migration.'};
  fs.mkdirSync(out,{recursive:false});const reportFile=path.join(out,'report.json');
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log('SLOW_RECOVERY_REPORT '+JSON.stringify({report:reportFile,sha256:shaFile(reportFile),summary,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks}));
}
try{main();}catch(error){console.error('SLOW_RECOVERY_FAILED '+(error.stack||error));process.exitCode=1;}finally{Model.closeCuda();}
