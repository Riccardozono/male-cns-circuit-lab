'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Old=require('./neural-rl-additive.cjs'),New=require('./neural-rl-bilateral.cjs');
test('Zero extra steering preserves the three-output decoder for every control step',()=>{
  const old=Old.create(),now=New.create();
  assert.deepEqual(now.reset('full'),old.reset('full'));
  let count=0;
  while(now.inspect().car.alive){
    // Bounded test actions, not training examples or a controller for the app.
    const s=.1*Math.sin(count*.1),a=.05*Math.cos(count*.07);
    const before=old.observation(),h=before.slice(512,514).map(v=>v*2);
    const extra=Math.tanh(.2)*Math.exp(-(h[0]**2+h[1]**2)/(2*.04**2));
    assert.deepEqual(now.step([s,a,0,extra]),old.step([s,a,extra]));
    assert.deepEqual(now.inspect().lastCommands,old.inspect().lastCommands);
    assert.deepEqual(now.inspect().car.brain.activity,old.inspect().car.brain.activity);count++;
  }
  assert.ok(count>500);assert.equal(now.metadata().actionDimensions,4);
});
test('New motor authority does not bypass silent anatomy, reset, exclusive pedals or validation',()=>{
  const now=New.create();now.reset('full');now.step([0,0,1,1]);
  assert.equal(now.inspect().longitudinalAuthority,0);
  while(now.inspect().car.alive&&now.inspect().longitudinalAuthority<.99)now.step([0,0,0,0]);
  assert.ok(now.inspect().longitudinalAuthority>=.99);
  now.inspect().car.brain.decoderMemory=[1e-6,1e-6];now.step([0,0,.1,.3]);
  const c=now.inspect().lastCommands;assert.ok(c[0]>.1);assert.equal(Math.min(c[1],c[2]),0);
  now.inspect().car.brain.activity.fill(0);now.step([0,0,1,1]);assert.deepEqual(now.inspect().lastCommands,[0,0,0]);
  assert.throws(()=>now.step([0,0,0,NaN]));now.reset('full');assert.equal(now.inspect().longitudinalAuthority,0);
});
