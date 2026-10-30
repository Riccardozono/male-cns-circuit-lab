'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../outputs/simulation.js'),Legacy=require('../outputs/legacy-models.js'),data=require('../outputs/data/connectome.json'),{fullRollout}=require('./practice-full-rollout.cjs');
for(const model of ['v2','v3'])test(model+': validation from the line matches the real simulation tick exactly',()=>{
  const sim=new F.Simulation(model==='v2'?Legacy.buildV2(data):Legacy.tagV3(structuredClone(data)),{population:1,seed:7717});
  sim.rewardRevision=F.Rewards.LEGACY_REVISION;sim.spawn(sim.cars.map(c=>c.genome));
  const actual=sim.cars[0],genome=F.cloneGenome(actual.genome);sim.evolve=()=>{};
  let ticks=0;while(actual.alive&&ticks<60000){sim.tick();ticks++;}
  assert.equal(actual.alive,false);
  const replay=fullRollout(F,sim.track,sim.graph,genome,{rewardRevision:sim.rewardRevision,maxTicks:60000});
  assert.equal(replay.ticks,ticks);
  for(const key of ['x','y','heading','speed','fitness','bestProgress','laps','reason','lifetime'])assert.equal(replay.car[key],actual[key],key);
  assert.deepEqual(replay.car.vehicle,actual.vehicle);assert.deepEqual(replay.car.brain.activity,actual.brain.activity);
});
test('A validation watchdog cannot turn a partial episode into safe evidence',()=>{
  const sim=new F.Simulation(Legacy.buildV2(data),{population:1}),r=fullRollout(F,sim.track,sim.graph,sim.cars[0].genome,{maxTicks:1});
  assert.equal(r.car.censored,true);assert.equal(F.isSafeLearningOutcome(r.car),false);
});
