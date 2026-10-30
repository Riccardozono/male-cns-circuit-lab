'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Old=require('./neural-context-live.cjs'),New=require('./neural-context-memory-live.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json');
test('Zero motor-memory decay preserves all real control steps, neurons and physical results',()=>{
  const old=Old.create(file),now=New.create(file);old.reset();now.reset();let controls=0;
  while(!old.state().complete){
    const a=old.step(),b=now.step();assert.deepEqual(b.observation,a.observation);assert.deepEqual(b.car.outputs,a.car.outputs);
    assert.deepEqual(b.car.brain.activity,a.car.brain.activity);for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])assert.equal(b[k],a[k]);controls++;
  }
  assert.equal(controls,1603);assert.equal(now.state().bestProgress,1990.41260481475);
});
test('New artificial memory is bounded, cleared on reset and cannot bypass silent anatomy',()=>{
  assert.throws(()=>New.create(file,{longitudinalDecay:1}),/decay/);
  const env=New.create(file,{steeringDecay:.25,longitudinalDecay:.5});
  for(let i=0;i<1200&&!env.state().complete;i++)env.step();
  assert.ok(env.motorMemory().flat().every(v=>Number.isFinite(v)&&Math.abs(v)<=20));
  env.reset();assert.ok(env.motorMemory().flat().every(v=>v===0));
  env.state().car.brain.activity.fill(0);env.step();assert.deepEqual(env.state().car.outputs,[0,0,0]);
});
