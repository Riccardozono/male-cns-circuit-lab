'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../outputs/rewards.js'),F=require('../outputs/simulation.js'),
  Fixed=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),
  audit=require('../.impeccable/review/learning-ml/v3-neural-context-progress-audit-20261024-01/report.json'),track=P.setup().track;
function fixture(api,revision){const t={total:1000,pixelsPerMeter:1,lapReferenceSpeed:25},car={x:0,y:0,speed:0,vehicle:{speedMps:0},alive:true,reason:'',lifetime:0,lastProgressTime:0,
  reward:0,penalty:0,fitness:0,progress:0,bestProgress:0,lastAlong:0,laps:0,lapTimes:[],lastLapStartTime:0,lastLapTime:null,bestLapTime:Infinity,
  lapRegressionPenalty:0,noLapPenalty:0,slipAngle:0};api.initialise(t,car,null,revision);return {t,car};}
test('all four existing reward revisions retain exact intrinsic scores and terminal data',()=>{
  for(const revision of R.SUPPORTED_REVISIONS){const a=fixture(R,revision),b=fixture(Fixed.Rewards,revision);
    for(let i=1;i<=120;i++)for(const [api,f] of [[R,a],[Fixed.Rewards,b]]){f.car.x=i*.1;f.car.lifetime+=1/60;api.step(f.t,f.car,{along:i*.1,dt:1/60});}
    R.finish(a.t,a.car);Fixed.Rewards.finish(b.t,b.car);assert.deepEqual(b.car,a.car);
  }
});
function corner(){const row=audit.records.find(c=>c.retention===.99).invalid[0],car=Fixed.makeCar(track,0,null,Fixed.Rewards.PRIVATE_CONTINUITY_REVISION);
  car.x=row.before.previousX;car.y=row.before.previousY;Object.assign(car.rewardState,{x:car.x,y:car.y,along:row.before.along,segmentIndex:row.before.nearest.index});
  return {row,car};}
test('private revision accepts the recorded local switch while R3 retains its original guard',()=>{
  const {row,car}=corner();car.x=row.after.x;car.y=row.after.y;car.lifetime+=1/60;
  Fixed.Rewards.step(track,car,{along:row.after.nearest.along,segmentIndex:row.after.nearest.index,onRoad:true,collision:false,dt:1/60});
  assert.equal(car.rewardState.invalidSteps,0);assert.equal(car.alive,true);assert.ok(car.bestProgress>0&&car.bestProgress<.3);assert.equal(car.laps,0);
});
test('repeating a valid corner projection back and forth cannot farm progress or lap rewards',()=>{
  const {row,car}=corner();let firstReward;
  for(let i=0;i<30;i++){const forward=i%2===0,pos=forward?row.after:{x:row.before.previousX,y:row.before.previousY,nearest:row.before.nearest};
    car.x=pos.x;car.y=pos.y;car.lifetime+=1/60;
    Fixed.Rewards.step(track,car,{along:pos.nearest.along,segmentIndex:pos.nearest.index,onRoad:true,collision:false,dt:1/60});
    if(i===0)firstReward=car.reward;
  }
  assert.equal(car.reward,firstReward);assert.equal(car.laps,0);assert.equal(car.rewardBreakdown.rewards.checkpoints,0);assert.equal(car.alive,true);
});
test('private revision still terminates stationary fake progress and unrelated branch jumps',()=>{
  for(const mode of ['stationary','unrelated','teleport']){const {row,car}=corner();
    for(let i=0;i<3;i++){if(mode==='teleport')car.x+=100;else if(mode==='unrelated')car.x+=.01;car.lifetime+=1/60;
      Fixed.Rewards.step(track,car,{along:row.after.nearest.along+100,segmentIndex:mode==='unrelated'?200:row.after.nearest.index,onRoad:true,dt:1/60});}
    assert.equal(car.reason,'progresso non valido');assert.equal(car.bestProgress,0);assert.equal(car.laps,0);
  }
});
test('collision and road departure prevent local projection rewards',()=>{
  for(const extra of [{collision:true},{onRoad:false}]){const {row,car}=corner();car.x=row.after.x;car.y=row.after.y;car.lifetime+=1/60;
    Fixed.Rewards.step(track,car,{along:row.after.nearest.along,segmentIndex:row.after.nearest.index,onRoad:true,collision:false,dt:1/60,...extra});
    assert.equal(car.bestProgress,0);assert.equal(car.laps,0);assert.equal(car.alive,false);
  }
});
