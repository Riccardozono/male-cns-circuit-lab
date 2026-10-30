'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {physicalDrive,SLOW_REASON}=require('./neural-statehead-slow-pace-extension.cjs');

function fixture(){
  const car={alive:true,reason:'',reward:10000,penalty:0,fitness:10000,baseFitness:10000,lifetime:90,
    rewardBreakdown:{rewards:{},penalties:{time:0,slowProgress:0,noLap:0,regression:0}},
    rewardState:{finalized:false}};
  const simulation={DT:1,normalizeDriveCommands:commands=>commands,
    Vehicle:{Terrain:{forTrack:()=>({})},step(){},stop(target){target.stopped=true;}},
    locate:()=>({along:0,segmentIndex:0,distance:0}),onRoad:()=>true,collided:()=>false,raycast:()=>Infinity,
    Rewards:{RULES:{stall:1400},step(_track,target){
    target.rewardBreakdown.penalties.slowProgress+=1400;
    target.rewardBreakdown.penalties.noLap+=2000;
    target.penalty+=3400;target.fitness=target.reward-target.penalty;
    target.baseFitness-=3400;target.alive=false;target.reason=SLOW_REASON;target.rewardState.finalized=true;
  }}};
  return {simulation,car,drive:physicalDrive(simulation),track:{explicitBoundaries:false,halfWidth:10}};
}

test('slow-pace threshold charges the first penalty and resumes an actually moving episode',()=>{
  const {car,drive,track}=fixture();
  drive(track,car,[0,0,0],1);
  assert.equal(car.alive,true);
  assert.equal(car.reason,'');
  assert.equal(car.rewardState.finalized,false);
  assert.equal(car.penalty,3400);
  assert.equal(car.stateHeadSlowProgressResumes,1);
  assert.equal(car.lastProgressTime,car.lifetime,'the existing stall grace restarts without changing elapsed time');
  assert.equal(car.baseFitness,6600);
});

test('repeated slow windows do not stack duplicate terminal or no-lap penalties',()=>{
  const {car,drive,track}=fixture();
  drive(track,car,[0,0,0],1);
  car.rewardBreakdown.penalties.time+=50;car.penalty+=50;
  drive(track,car,[0,0,0],1);
  assert.equal(car.alive,true);
  assert.equal(car.rewardBreakdown.penalties.slowProgress,1400);
  assert.equal(car.rewardBreakdown.penalties.noLap,2000);
  assert.equal(car.rewardBreakdown.penalties.time,50);
  assert.equal(car.penalty,3450);
  assert.equal(car.fitness,6550);
  assert.equal(car.baseFitness,6550);
  assert.equal(car.stateHeadSlowProgressResumes,2);
});

test('collision, full stop, and other terminal reasons remain terminal',()=>{
  const {simulation,car,drive,track}=fixture();
  simulation.Rewards.step=function(_track,target){target.alive=false;target.reason='urto';};
  drive(track,car,[0,0,0],1);
  assert.equal(car.alive,false);
  assert.equal(car.reason,'urto');
  assert.equal(car.stopped,true);
});
