'use strict';
// Private research adapter: preserve the simulator, controller and severe
// penalties, but defer slow-pace termination when currently recovering.
// It does not issue route, steering, throttle or braking commands.
const fs=require('node:fs'),crypto=require('node:crypto'),readline=require('node:readline');
const F=require('../.impeccable/experimental-penalty5/outputs/simulation.js');
const Live=require('./neural-statehead-rl-live.cjs'),E=require('./statehead-slow-pace-replay-env-81.cjs');
const Model=require('./neural-statehead-cuda-model.cjs');
let deferrals=0;
function drive(track,car,commands,dt=F.DT){
  if(!car.alive)return;
  const beforeHigh=car.rewardState.highWater,penalties=car.rewardBreakdown.penalties;
  const beforeNoLap=penalties.noLap||0,beforeNoLapValue=car.noLapPenalty,
    beforeNoLapApplied=car.noLapPenaltyApplied,beforeSlow=penalties.slowProgress||0;
  car.outputs=F.normalizeDriveCommands(commands);
  F.Vehicle.step(car,car.outputs,dt,F.Vehicle.Terrain.forTrack(track));
  const nearest=F.locate(track,car.x,car.y);
  F.Rewards.step(track,car,{along:nearest.along,segmentIndex:nearest.segmentIndex,
    onRoad:track.explicitBoundaries?F.onRoad(track,car.x,car.y):nearest.distance<=track.halfWidth+5,
    collision:F.collided(track,car),forwardClearance:F.raycast(track,car.x,car.y,car.heading),dt});
  const minimumMps=track.total/F.Rewards.referenceLapTime(track)*F.Rewards.RULES.minPaceFraction/(track.pixelsPerMeter||1);
  if(!car.alive&&car.reason==='troppo lenta / senza progresso'&&
     Math.abs(car.vehicle?.speedMps??0)>=minimumMps&&car.rewardState.highWater>beforeHigh+1e-12){
    const slowAdded=(penalties.slowProgress||0)-beforeSlow,noLapRefund=(penalties.noLap||0)-beforeNoLap;
    if(Math.abs(slowAdded-F.Rewards.RULES.stall)>1e-9||noLapRefund< -1e-9)throw Error('Unexpected terminal reward ledger');
    penalties.noLap=beforeNoLap;car.penalty-=noLapRefund;
    car.noLapPenalty=beforeNoLapValue;car.noLapPenaltyApplied=beforeNoLapApplied;
    car.rewardState.finalized=false;car.alive=true;car.reason='';
    car.fitness=car.reward-car.penalty;
    car.baseFitness=car.reward-Object.entries(penalties).reduce((sum,[key,value])=>sum+(key==='regression'?0:value),0);
    deferrals++;
  }
  if(!car.alive)F.Vehicle.stop(car);
}
Live.installDriveOverride(drive);
let env;
readline.createInterface({input:process.stdin,crlfDelay:Infinity}).on('line',line=>{
  let id=null;
  try{
    const m=JSON.parse(line);id=m.id;let value;
    if(m.op==='init'){
      if(env)throw Error('Already initialized');
      env=E.create({basisOverride:m.basisOverride??null,instantGate:m.instantGate===true,
        extraPrefixControls:m.extraPrefixControls??[],verifiedBaseline:m.verifiedBaseline??null});
      value={...env.metadata(),movingPaceResearchAdapter:true,
        movingPaceAdapterSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')};
    }else if(!env)throw Error('Initialize first');
    else if(m.op==='evaluate')value=env.evaluate(m.weights,m.configuration);
    else if(m.op==='trace-evaluate')value=env.traceEvaluate(m.weights,m.configuration);
    else if(m.op==='episode')value=env.episode(m.configuration);
    else if(m.op==='rescore')value=env.rescore(m.weights,m.advantages,m.configuration);
    else if(m.op==='clear')value=env.clear();
    else if(m.op==='stats')value={...env.stats(),slowPaceDeferrals:deferrals};
    else throw Error('Unknown operation');
    process.stdout.write(JSON.stringify({id,result:value})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({id,error:error.stack||String(error)})+'\n');}
}).on('close',()=>Model.closeCuda());
