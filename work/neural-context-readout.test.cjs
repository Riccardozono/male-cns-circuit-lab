'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Context=require('./neural-context-readout.cjs'),Head=require('./neural-json-head.cjs'),Bridge=require('./neural-rl-context-state.cjs'),Env=require('./neural-context-env.cjs');
const dir=path.resolve(__dirname,'../.impeccable/review/neural-sacl/context-growth-first'),prepared=JSON.parse(fs.readFileSync(path.join(dir,'prepared.json'),'utf8'));
const actual=JSON.parse(fs.readFileSync(path.join(dir,'actual-observations.json'),'utf8')),head=Head.load(path.resolve(__dirname,'../.impeccable/review/neural-sacl/native-neural-head/learned-head.malecns-neural-exp.json'));
test('Actual context centres and compact support preserve every recorded protected control exactly',()=>{
  const basis=prepared.basis,w=Array.from({length:basis.centres.length*2},(_,i)=>i%2?.7:-.02);
  for(const c of basis.centres){assert.ok(actual.some(obs=>JSON.stringify(obs)===JSON.stringify(c.values)));assert.equal(Context.feature(c.values,c,basis.scales),1);}
  for(const obs of actual.slice(0,basis.protectedCount)){
    assert.ok(basis.centres.every(c=>Context.feature(obs,c,basis.scales)===0));
    assert.deepEqual(Context.action(head,obs,basis,w),Head.action(head,obs));
  }
  const zeros=Array(w.length).fill(0);for(const obs of actual.filter((_,i)=>i%50===0))assert.deepEqual(Context.action(head,obs,basis,zeros),Head.action(head,obs));
});
test('Captured state cannot be imported from another environment or fabricated',()=>{
  const env=Bridge.create(),other=Bridge.create();env.reset('full');other.reset('full');
  const state=env.capture();assert.throws(()=>other.restore(state),/captured/);assert.throws(()=>env.restore({...state}),/captured/);
  env.restore(state);assert.deepEqual(env.observation(),other.observation());
});
test('Practice cache and independent full episode are identical with nonzero motor coefficients',()=>{
  const env=Env.create(),weights=env.zeros.map((_,i)=>i%2?.3:.004);
  const full=env.evaluate(weights,'full'),practice=env.evaluate(weights,'practice');
  for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds','episodeControlSteps'])assert.equal(practice.result[k],full.result[k],k);
  assert.equal(practice.gasBrakeOverlapSteps,0);assert.equal(full.gasBrakeOverlapSteps,0);
  assert.ok(practice.executedControls<full.executedControls);assert.ok(env.metadata().protectedControls>=prepared.basis.protectedCount);
});
