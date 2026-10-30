'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Overlay=require('./neural-statehead-brake-lock-overlay.cjs');

const base={safe:true,continuous:true,highWaterMeters:100,minimumPaceMps:2,
  speedMps:0,motionMps:0,brake:1,throttle:0,dt:1/60};
function hold(seconds, input=base) {
  let state=0,penalty=0;
  for(let i=0;i<Math.round(seconds/input.dt);i++){
    const next=Overlay.advanceLock(state,input);state=next.seconds;penalty+=next.penalty;
  }
  return {state,penalty};
}

test('brake lock grace is free; only sustained stationary braking is charged',()=>{
  assert.equal(hold(2).penalty,0);
  assert.ok(Math.abs(hold(2.1).penalty-35)<1e-9);
});
test('ordinary corner braking is not charged when the car is moving',()=>{
  assert.equal(hold(10,{...base,speedMps:18,motionMps:12}).penalty,0);
});
test('accelerator, low brake, insufficient progress, and low pace independently gate the penalty',()=>{
  for(const input of [
    {...base,throttle:.06},
    {...base,brake:.49},
    {...base,highWaterMeters:20},
    {...base,speedMps:2},
  ]) assert.equal(hold(5,input).penalty,0);
});
test('movement, an unsafe step, or a discontinuous projection resets the grace timer',()=>{
  for(const input of [
    {...base,motionMps:.5001},
    {...base,safe:false},
    {...base,continuous:false},
  ]) {
    const first=Overlay.advanceLock(1.9,{...base,dt:.1});
    const reset=Overlay.advanceLock(first.seconds,{...input,dt:.1});
    assert.equal(reset.seconds,0);
    assert.equal(reset.penalty,0);
  }
});
test('invalid dt and state are rejected instead of silently changing score',()=>{
  assert.throws(()=>Overlay.advanceLock(0,{...base,dt:0}),/positive physics dt/);
  assert.throws(()=>Overlay.advanceLock(-1,base),/positive physics dt/);
});

test('a shared physical runtime installs one scoring hook and tracks each agent independently',()=>{
  let driveCalls=0;
  const runtime={drive(){driveCalls++;}};
  function makeEnv(id){
    let car;
    const env={runtime,currentCar:()=>car,reset(){
      car={id,progress:0,alive:true,reason:'',speed:0,vehicle:{speedMps:0},outputs:[0,0,1],
        reward:0,penalty:0,fitness:0,baseFitness:0,lastPenalty:0,
        rewardBreakdown:{rewards:{},penalties:{stall:0}},
        rewardState:{invalidSteps:0,highWater:100}};
      return car;
    }};
    return env;
  }
  const first=Overlay.attach(makeEnv(1));
  const second=Overlay.attach(makeEnv(2));
  const track={total:1000,pixelsPerMeter:1};
  for(let i=0;i<3;i++)runtime.drive(track,first.currentCar(),[0,0,1],1);
  assert.equal(driveCalls,3);
  assert.equal(first.currentCar().rewardBreakdown.penalties.stall,350);
  assert.equal(first.brakeLockSnapshot().totalPenalty,350);
  assert.equal(second.currentCar().rewardBreakdown.penalties.stall,0);
  assert.equal(second.brakeLockSnapshot().totalPenalty,0);
});
