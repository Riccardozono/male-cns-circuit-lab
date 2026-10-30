'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Model=require('./neural-frontier-model.cjs'),Head=require('./neural-json-head.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/frontier-native-model/model.malecns-neural-frontier.json');
test('Standalone data-only frontier model reproduces two full real episodes without original save/checkpoints',()=>{
  const env=Model.create(file),episodes=[];
  for(let i=0;i<2;i++){
    let state=env.reset(),overlap=0;
    while(!state.complete&&state.ticks<120000){state=env.step();overlap+=Number(state.car.outputs[1]>0&&state.car.outputs[2]>0);}
    assert.equal(overlap,0);assert.ok(state.complete);
    const result=Object.fromEntries(['bestProgress','fitness','laps','reason','totalSimulationSeconds'].map(k=>[k,state[k]]));episodes.push(result);
    for(const k in result)assert.equal(result[k],env.verificationExpected[k]);
  }
  assert.deepEqual(episodes[0],episodes[1]);assert.equal(episodes[0].bestProgress,2006.2274624276079);
});
test('Dedicated model checksum, compatibility and silent-brain guards are enforced',()=>{
  const text=fs.readFileSync(file,'utf8'),envelope=JSON.parse(text),parsed=Model.parse(text);
  assert.throws(()=>Model.parse(JSON.stringify({...envelope,sha256:'0'.repeat(64)})),/checksum/);
  assert.throws(()=>Model.parse(Model.encode({...parsed.data,appVersion:'5.7.0'})),/Incompatible/);
  assert.throws(()=>Model.parse(Model.encode({...parsed.data,weights:[NaN,0]})),/coefficients/);
  const env=Model.create(file);env.reset();assert.equal(env.frontierState().peak,0);
  env.state().car.brain.activity.fill(0);env.step();assert.deepEqual(env.state().car.outputs,[0,0,0]);
  assert.equal(env.modelSha256,Head.sha(text));
});
