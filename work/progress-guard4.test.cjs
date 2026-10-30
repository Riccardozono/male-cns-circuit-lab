'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../.impeccable/experimental-progress-guard4/outputs/simulation.js'),X=require('./context8-model.cjs');
const make=()=>new F.Simulation(X.model(require('../outputs/data/connectome.json')),{population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
test('Adjacent corner reprojection can recover without an invented body movement',()=>{
  const s=make(),car=s.cars[0],segment=s.track.segments.findIndex(v=>v.start>790);car.rewardState.along=s.track.segments[segment].start-.05;car.rewardState.segmentIndex=segment-1;
  car.x+=.03;car.lifetime+=F.DT;F.Rewards.step(s.track,car,{along:s.track.segments[segment].start+.11,segmentIndex:segment,onRoad:true,collision:false,dt:F.DT});
  assert.equal(car.alive,true);assert.equal(car.rewardState.invalidSteps,0);assert.equal(car.rewardState.segmentIndex,segment);assert.ok(car.bestProgress<1);assert.equal(car.laps,0);
});
test('Adjacent topology does not authorize teleports or stationary score inflation',()=>{
  for(const moving of [false,true]){const s=make(),car=s.cars[0];if(moving)car.x+=100;
    for(let k=0;k<3;k++){car.lifetime+=F.DT;F.Rewards.step(s.track,car,{along:100,segmentIndex:1,onRoad:true,collision:false,dt:F.DT});}
    assert.equal(car.alive,false);assert.equal(car.reason,'progresso non valido');assert.equal(car.bestProgress,0);assert.equal(car.laps,0);
  }
});
test('Unrelated branch switches remain invalid even on a moving road-safe car',()=>{
  const s=make(),car=s.cars[0];for(let k=0;k<3;k++){car.x+=.03;car.lifetime+=F.DT;F.Rewards.step(s.track,car,{along:1000,segmentIndex:250,onRoad:true,collision:false,dt:F.DT});}
  assert.equal(car.reason,'progresso non valido');assert.equal(car.bestProgress,0);assert.equal(car.rewardState.along,0);assert.equal(car.laps,0);
});
