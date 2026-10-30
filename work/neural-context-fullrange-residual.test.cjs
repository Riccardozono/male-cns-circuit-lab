'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Full=require('./neural-context-fullrange-residual-env.cjs');
test('Wider available motor range leaves the zero-residual full and practice episodes unchanged',()=>{
  const env=Full.create();let s=env.reset('full');while(!s.terminated&&!s.truncated)s=env.step([0,0]);
  const full=s.info;assert.equal(full.bestProgress,1990.41260481475);assert.equal(full.fitness,-2331.9036376601734);
  s=env.reset('practice');while(!s.terminated&&!s.truncated)s=env.step([0,0]);
  for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])assert.equal(s.info[k],full[k]);
  assert.deepEqual(env.metadata().residualScale,[1,2]);assert.ok(env.metadata().protectedControls>1000);
});
test('Wider residual is still bounded, neuron-activated, and silent when the brain is silent',()=>{
  const env=Full.create(),state=env.reset('full');assert.equal(state.observation[520],0);
  env.step([1,1]);assert.equal(env.inspect().longitudinalAuthority,0);
  env.reset('full');env.inspect().car.brain.activity.fill(0);env.step([1,1]);assert.deepEqual(env.inspect().lastCommands,[0,0,0]);
  assert.throws(()=>env.step([NaN,0]),/Bounded/);assert.throws(()=>env.step([1.001,0]),/Bounded/);
});
