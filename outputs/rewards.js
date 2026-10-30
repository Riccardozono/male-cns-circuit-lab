/* Episodic objective for rank-based neural evolution. These coefficients are
 * simulator design choices, not measured motorsport/biological parameters.
 * Geometry is used ONLY to evaluate actual motion, never to issue controls.
 * No points for throttle, raw speed, survival or repeatedly visited road.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MaleCNSRewards=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LEGACY_REVISION='progress-3',PREVIOUS_REVISION='progress-4-brake-lock',BRAKE_LOCK_REVISION='progress-5-sensitive-brake-lock',MISSING_LAP_REVISION='progress-6-missing-lap',PREVIOUS_PACE_REVISION='progress-7-moving-pace',REVISION='progress-8-pace-recovery-margin',SUPPORTED_REVISIONS=Object.freeze([LEGACY_REVISION,PREVIOUS_REVISION,BRAKE_LOCK_REVISION,MISSING_LAP_REVISION,PREVIOUS_PACE_REVISION,REVISION]),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const RULES=Object.freeze({
    progressPerLap:5000,checkpointsPerLap:32,checkpointPerLap:500,
    lapBase:8000,fastLapBonus:2000,slowLapFactor:4000,slowLapCap:8000,
    // A dense exploration objective must not make an early crash cheaper than
    // useful motion. Lap-time/regression penalties remain strict AFTER a lap.
    timePerReferenceLap:120,reversePerLap:9000,
    collision:900,offTrack:1400,impactSpeedPenalty:180,impactReferenceMps:70,
    forwardRiskPerSecond:4,slipPerSecond:8,slipThresholdRad:.22,
    stall:1400,stallSeconds:8,progressWindowMeters:1,
    brakeLockGraceSeconds:2,brakeLockPenaltyPerSecond:350,brakeLockSpeedFloorMps:.6,brakeLockMotionMps:.5,brakeLockMinimumCommand:.05,
    minPaceFraction:.075,paceWindowSeconds:8,paceGraceSeconds:16,paceRecoverySpeedFactor:1.25,
    noLapPenalty:2000,missingLapPenalty:1000,
    regressionFactor:4000,regressionCapPerLap:3000,
    invalidProgress:1200,maxInvalidSteps:3,maxLapsPerGeneration:2
  });
  const rewardKeys=['progress','checkpoints','lap','pace'];
  const penaltyKeys=['time','slowLap','reverse','risk','slip','collision','offTrack','stall','slowProgress','noLap','regression','invalid'];
  const zeros=keys=>Object.fromEntries(keys.map(k=>[k,0]));
  function referenceLapTime(track){return Math.max(1,track.total/(track.lapReferenceSpeed||35*(track.pixelsPerMeter||1)));}
  function initialise(track,car,previousLap=null,revision=REVISION){
    if(!SUPPORTED_REVISIONS.includes(revision))throw Error('Sistema di ricompense incompatibile.');
    car.rewardRevision=revision;car.rewardBreakdown={rewards:zeros(rewardKeys),penalties:zeros(penaltyKeys)};
    car.rewardState={x:car.x,y:car.y,along:0,observedAlong:0,highWater:0,stallHighWater:0,nextCheckpoint:1,invalidSteps:0,finalized:false,paceTime:0,paceProgress:0,brakeLockSeconds:0};
    car.previousGenerationLapTime=Number.isFinite(previousLap)&&previousLap>0?previousLap:null;
    car.baseFitness=0;return car;
  }
  function refresh(car){
    car.fitness=car.reward-car.penalty;
    // Calculate the stable record directly; subtracting then re-adding a
    // changing comparison penalty introduced tiny false record improvements.
    car.baseFitness=car.reward-penaltyKeys.reduce((sum,key)=>sum+(key==='regression'?0:car.rewardBreakdown.penalties[key]),0);
  }
  function credit(car,kind,amount){
    if(!Number.isFinite(amount)||amount<=0)return;
    car.rewardBreakdown.rewards[kind]+=amount;car.reward+=amount;car.lastReward=amount;refresh(car);
  }
  function debit(car,kind,amount){
    if(!Number.isFinite(amount)||amount<=0)return;
    car.rewardBreakdown.penalties[kind]+=amount;car.penalty+=amount;car.lastPenalty=amount;refresh(car);
  }
  function lapTerms(track,seconds){
    const ratio=seconds/referenceLapTime(track);
    return {lap:RULES.lapBase,pace:RULES.fastLapBonus*clamp(1/Math.max(1e-9,ratio)-1,0,1),
      slow:RULES.slowLapFactor*clamp(ratio-1,0,RULES.slowLapCap/RULES.slowLapFactor)};
  }
  function comparisonPenalty(car,previousLap=car.previousGenerationLapTime){
    // Recomputable/idempotent, including manually ending an episode. EACH lap
    // counts: a quick first lap cannot hide a very slow second one.
    const reference=Number.isFinite(previousLap)&&previousLap>0?previousLap:null;
    const total=reference===null?0:car.lapTimes.reduce((sum,time)=>sum+Math.min(RULES.regressionCapPerLap,RULES.regressionFactor*Math.max(0,time/reference-1)),0);
    const old=car.lapRegressionPenalty||0;car.previousGenerationLapTime=reference;
    car.lapRegression=reference===null?0:car.lapTimes.reduce((sum,time)=>sum+Math.max(0,time-reference),0);
    car.lapRegressionPenalty=total;car.lapRegressionPenaltyApplied=reference!==null;
    car.rewardBreakdown.penalties.regression=total;car.penalty+=total-old;refresh(car);
  }
  function finish(track,car,reason=car.reason||'generazione interrotta'){
    if(!car.rewardState.finalized){
      if(car.laps<1){
        car.noLapPenalty=RULES.noLapPenalty+RULES.missingLapPenalty*(1-clamp(car.rewardState.highWater/track.total,0,1));
        car.noLapPenaltyApplied=true;debit(car,'noLap',car.noLapPenalty);
      }else if((car.rewardRevision===MISSING_LAP_REVISION||car.rewardRevision===PREVIOUS_PACE_REVISION||car.rewardRevision===REVISION)&&car.laps<RULES.maxLapsPerGeneration){
        const partialLap=clamp((car.rewardState.highWater-car.laps*track.total)/track.total,0,1);
        car.noLapPenalty=RULES.missingLapPenalty*(RULES.maxLapsPerGeneration-car.laps)*(1-partialLap);
        car.noLapPenaltyApplied=true;debit(car,'noLap',car.noLapPenalty);
      }
      car.rewardState.finalized=true;
    }
    comparisonPenalty(car);car.alive=false;car.reason=reason;refresh(car);
  }
  function recordStats(car){
    // Historical/multi-worker records use the intrinsic objective (all costs
    // except the previous-generation comparison). Training uses car.fitness.
    return {fitness:car.baseFitness,bestProgress:car.bestProgress,laps:car.laps,bestLapTime:car.bestLapTime};
  }
  function step(track,car,{along,onRoad=true,collision=false,forwardClearance=Infinity,dt}){
    const s=car.rewardState,ppm=track.pixelsPerMeter||1,reference=referenceLapTime(track),previousHighWater=s.highWater;
    if(s.finalized)return;
    const travelled=Math.hypot(car.x-s.x,car.y-s.y);let delta=along-(s.observedAlong??s.along);
    if(delta>track.total/2)delta-=track.total;
    if(delta< -track.total/2)delta+=track.total;
    // Bound both coordinate motion and chainage change. A nearest-segment
    // switch at a hairpin must never invent metres, checkpoints or laps.
    const continuous=Number.isFinite(delta)&&Number.isFinite(travelled)&&travelled<=120*ppm*dt+1e-6*ppm&&Math.abs(delta)<=travelled*2+.02*ppm;
    s.x=car.x;s.y=car.y;s.observedAlong=along;
    // Re-anchor only the projection used to validate the next physical step.
    // Never credit a rejected delta to progress, checkpoints, or laps. Keeping
    // this observation separate from the last accepted chainage lets a valid
    // next step recover instead of comparing cumulative drift to one-frame travel.
    if(continuous){s.along=along;car.lastAlong=along;s.invalidSteps=0;}else s.invalidSteps++;
    debit(car,'time',RULES.timePerReferenceLap*dt/reference);
    const v=Math.abs(car.vehicle?.speedMps??car.speed??0);
    if(v>5){
      debit(car,'slip',dt*RULES.slipPerSecond*clamp((Math.abs(car.slipAngle||0)-RULES.slipThresholdRad)/.5,0,1));
      const stopping=(4.619+v*v/(2*9.80665*1.3))*ppm;
      debit(car,'risk',dt*RULES.forwardRiskPerSecond*clamp((stopping-forwardClearance)/stopping,0,1));
    }
    // New sessions learn that holding even a light brake near a standstill is
    // costly, but only after real movement and a grace period. Moving corner
    // braking and historical reward revisions keep their original scoring.
    if(car.rewardRevision===BRAKE_LOCK_REVISION||car.rewardRevision===MISSING_LAP_REVISION||car.rewardRevision===PREVIOUS_PACE_REVISION||car.rewardRevision===REVISION){
      const oldSeconds=s.brakeLockSeconds||0,minimumPace=Math.max(RULES.brakeLockSpeedFloorMps,track.total/reference*RULES.minPaceFraction);
      const throttle=Number(car.outputs?.[1])||0,brake=Number(car.outputs?.[2])||0;
      const brakeLocked=s.highWater>20*ppm&&continuous&&onRoad&&!collision&&v<minimumPace&&Math.abs(delta)/(ppm*dt)<=RULES.brakeLockMotionMps&&brake>=RULES.brakeLockMinimumCommand&&throttle<=.05;
      s.brakeLockSeconds=brakeLocked?oldSeconds+dt:0;
      if(brakeLocked){const chargedSeconds=Math.max(0,s.brakeLockSeconds-RULES.brakeLockGraceSeconds)-Math.max(0,oldSeconds-RULES.brakeLockGraceSeconds);debit(car,'stall',RULES.brakeLockPenaltyPerSecond*chargedSeconds);}
    }
    // Never reward the step that hits a wall/leaves the road. G forces, hard
    // braking and steering alone are not faults and carry no arbitrary cost.
    if(continuous&&onRoad&&!collision){
      const before=car.progress;car.progress+=delta;
      debit(car,'reverse',Math.max(0,-delta)/track.total*RULES.reversePerLap);
      const high=Math.min(track.total*RULES.maxLapsPerGeneration,Math.max(s.highWater,car.progress));
      credit(car,'progress',(high-s.highWater)/track.total*RULES.progressPerLap);s.highWater=high;car.bestProgress=high;
      if(high-s.stallHighWater>=RULES.progressWindowMeters*ppm){s.stallHighWater=high;car.lastProgressTime=car.lifetime;}
      const spacing=track.total/RULES.checkpointsPerLap;
      while(delta>0&&s.nextCheckpoint<=RULES.maxLapsPerGeneration*RULES.checkpointsPerLap&&car.progress>=s.nextCheckpoint*spacing-1e-9){
        // The next ordered gate must be crossed on THIS continuous step.
        if(before>s.nextCheckpoint*spacing+1e-6*ppm)break;
        credit(car,'checkpoints',RULES.checkpointPerLap/RULES.checkpointsPerLap);
        if(s.nextCheckpoint%RULES.checkpointsPerLap===0){
          const crossingTime=car.lifetime-dt+dt*clamp((s.nextCheckpoint*spacing-before)/delta,0,1);
          const time=crossingTime-car.lastLapStartTime,terms=lapTerms(track,time);
          car.laps++;car.lapTimes.push(time);car.lastLapTime=time;car.bestLapTime=Math.min(car.bestLapTime,time);car.lastLapStartTime=crossingTime;
          car.lastLapReward=terms.lap+terms.pace;car.lastLapPenalty=terms.slow;
          credit(car,'lap',terms.lap);credit(car,'pace',terms.pace);debit(car,'slowLap',terms.slow);comparisonPenalty(car);
        }
        s.nextCheckpoint++;
      }
    }
    let reason='';
    if(collision){debit(car,'collision',RULES.collision+RULES.impactSpeedPenalty*clamp(v/RULES.impactReferenceMps,0,1));reason='urto';}
    else if(!onRoad){debit(car,'offTrack',RULES.offTrack+RULES.impactSpeedPenalty*clamp(v/RULES.impactReferenceMps,0,1));reason='fuori pista';}
    else if(s.invalidSteps>=RULES.maxInvalidSteps){debit(car,'invalid',RULES.invalidProgress);reason='progresso non valido';}
    else if(car.laps>=RULES.maxLapsPerGeneration)reason='limite 2 giri';
    else if(car.lifetime-car.lastProgressTime>RULES.stallSeconds){debit(car,'stall',RULES.stall);reason='ferma / senza progresso';}
    if(!reason&&car.lifetime-s.paceTime>=RULES.paceWindowSeconds){
      const recentPace=(s.highWater-s.paceProgress)/(car.lifetime-s.paceTime),minimum=track.total/reference*RULES.minPaceFraction;
      if(car.lifetime>=RULES.paceGraceSeconds&&recentPace<minimum){
        debit(car,'slowProgress',RULES.stall);
        // An average over the preceding window can still be low while a car
        // is accelerating and making fresh progress. Keep the severe cost,
        // but let only the new revision continue in that specific case.
        const recoveryFactor=car.rewardRevision===REVISION?RULES.paceRecoverySpeedFactor:1;
        const recovering=(car.rewardRevision===PREVIOUS_PACE_REVISION||car.rewardRevision===REVISION)&&v>=minimum*recoveryFactor/ppm&&s.highWater>previousHighWater+1e-12;
        if(!recovering)reason='troppo lenta / senza progresso';
      }
      s.paceTime=car.lifetime;s.paceProgress=s.highWater;
    }
    if(reason)finish(track,car,reason);
    refresh(car);
  }
  return Object.freeze({REVISION,LEGACY_REVISION,PREVIOUS_REVISION,BRAKE_LOCK_REVISION,MISSING_LAP_REVISION,PREVIOUS_PACE_REVISION,SUPPORTED_REVISIONS,RULES,rewardKeys,penaltyKeys,initialise,step,finish,comparisonPenalty,recordStats,referenceLapTime,lapTerms});
});
