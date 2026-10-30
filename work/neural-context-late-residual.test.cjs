'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Late=require('./neural-context-late-residual-env.cjs');
test('Late zero residual preserves the verified full episode and actual cached practice',()=>{
  const env=Late.create();let s=env.reset('full');while(true){s=env.step([0,0]);if(s.terminated||s.truncated)break;}
  const full=s.info;assert.equal(full.bestProgress,1990.41260481475);assert.equal(full.fitness,-2331.9036376601734);
  s=env.reset('practice');let controls=0;while(true){s=env.step([0,0]);controls++;if(s.terminated||s.truncated)break;}
  for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])assert.equal(s.info[k],full[k]);
  assert.ok(controls<full.episodeControlSteps);assert.ok(env.metadata().protectedControls>1000);
});
test('No activation before actual late neural context, and no command from silent anatomy',()=>{
  const env=Late.create(),state=env.reset('full');assert.equal(state.observation[520],0);
  env.step([.5,.5]);assert.equal(env.inspect().longitudinalAuthority,0);
  env.reset('full');env.inspect().car.brain.activity.fill(0);env.step([1,1]);assert.deepEqual(env.inspect().lastCommands,[0,0,0]);
  assert.throws(()=>env.step([NaN,0]),/Bounded/);
});
