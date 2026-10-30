'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Old=require('./neural-rl-bridge5.cjs'),New=require('./neural-rl-authority.cjs');
test('Authority is reset per real episode and cannot add a startup command before neural memory activates',()=>{
  const old=Old.create(),now=New.create();old.reset('full');now.reset('full');assert.equal(now.inspect().longitudinalAuthority,0);old.step([0,0]);now.step([0,.9]);assert.deepEqual(now.inspect().lastCommands,old.inspect().lastCommands);
  assert.deepEqual(now.observation(),old.observation());assert.equal(now.metadata().decoderRevision,'neural-longitudinal-authority-v2');
});
test('Previously activated longitudinal authority survives memory decay but not a silent anatomical signal',()=>{
  const old=Old.create(),now=New.create();old.reset('full');now.reset('full');
  while(now.inspect().longitudinalAuthority<.99&&now.inspect().car.alive){old.step([0,0]);now.step([0,0]);}
  assert.ok(now.inspect().longitudinalAuthority>=.99);const baseline=now.inspect().baseline[1]-now.inspect().baseline[2];
  for(const env of [old,now])env.inspect().car.brain.decoderMemory=[.000001,.000001];
  old.step([0,.5]);now.step([0,.5]);const a=old.inspect().lastCommands,b=now.inspect().lastCommands;
  assert.ok((b[1]-b[2])>(a[1]-a[2])+.1);assert.equal(Math.min(b[1],b[2]),0);
  now.inspect().car.brain.activity.fill(0);now.step([0,1]);assert.deepEqual(now.inspect().lastCommands,[0,0,0]);
  now.reset('full');assert.equal(now.inspect().longitudinalAuthority,0);
});
