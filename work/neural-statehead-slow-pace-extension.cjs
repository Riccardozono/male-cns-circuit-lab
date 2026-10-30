'use strict';
// Private training-only rule: retain the severe first slow-progress penalty,
// but let a still-moving car continue instead of ending its episode at 5% pace.
const installed=new WeakMap();
const SLOW_REASON='troppo lenta / senza progresso';
const REFUNDABLE=new Set(['slowProgress','noLap']);
const Live=require('./neural-command-live-cuda.cjs');

function refresh(car){
  car.fitness=car.reward-car.penalty;
  car.baseFitness=car.reward-Object.entries(car.rewardBreakdown.penalties)
    .reduce((sum,[key,value])=>sum+(key==='regression'?0:value),0);
}

function resumeSlowProgress(car){
  if(!car||car.alive||car.reason!==SLOW_REASON)return false;
  const penalties=car.rewardBreakdown?.penalties;
  if(!car.rewardState||!penalties||!Number.isFinite(car.reward)||!Number.isFinite(car.penalty))
    throw Error('The actual physical slow-progress reward ledger is required');
  if(!car.stateHeadSlowProgressLedger){
    car.stateHeadSlowProgressLedger=Object.fromEntries([...REFUNDABLE].map(key=>[key,penalties[key]||0]));
  }else{
    for(const key of REFUNDABLE){
      const current=penalties[key]||0,recorded=car.stateHeadSlowProgressLedger[key]||0;
      const duplicate=Math.max(0,current-recorded);
      if(duplicate>0){penalties[key]=recorded;car.penalty-=duplicate;}
    }
    refresh(car);
  }
  car.stateHeadSlowProgressResumes=(car.stateHeadSlowProgressResumes||0)+1;
  car.stateHeadSlowProgressLastAt=car.lifetime;
  car.lastProgressTime=car.lifetime;
  car.alive=true;car.reason='';car.rewardState.finalized=false;
  return true;
}

function physicalDrive(simulation){
  return function stateHeadSlowPaceDrive(track,car,commands,dt=simulation.DT){
    if(!car.alive)return;
    const [steering,throttle,brake]=simulation.normalizeDriveCommands(commands);
    car.outputs=[steering,throttle,brake];
    simulation.Vehicle.step(car,car.outputs,dt,simulation.Vehicle.Terrain.forTrack(track));
    const nearest=simulation.locate(track,car.x,car.y);
    simulation.Rewards.step(track,car,{along:nearest.along,segmentIndex:nearest.segmentIndex,
      onRoad:track.explicitBoundaries?simulation.onRoad(track,car.x,car.y):nearest.distance<=track.halfWidth+5,
      collision:simulation.collided(track,car),forwardClearance:simulation.raycast(track,car.x,car.y,car.heading),dt});
    resumeSlowProgress(car);
    if(!car.alive)simulation.Vehicle.stop(car);
  };
}

function install(simulation){
  const rewards=simulation?.Rewards;
  if(!rewards||typeof rewards.step!=='function')throw Error('A real reward-driven simulator is required');
  if(installed.has(rewards))return installed.get(rewards);
  const extension={revision:'statehead-slow-pace-continue-v1',firstPenaltyOnly:true,
    firstPenalty:rewards.RULES?.stall??null};
  Live.installDriveOverride(physicalDrive(simulation));
  installed.set(rewards,extension);
  return extension;
}

module.exports={SLOW_REASON,resumeSlowProgress,physicalDrive,install};
