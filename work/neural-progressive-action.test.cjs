'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),Model=require('./neural-grown-model.cjs'),Parent=require('./neural-progressive-action.cjs');
const base=path.resolve(__dirname,'../.impeccable/review/neural-sacl'),loaded=Model.load(path.join(base,'retained-native-model/model.malecns-neural-grown.json'));
test('Frozen parent causal memory is local, immutable and exactly resumable from its own capture',()=>{
  // Real observations already recorded in a full parent episode, not training examples.
  const rows=JSON.parse(fs.readFileSync(path.join(base,'progressive-3652-first/stage-01/parent-actual-trace.json'),'utf8')),observations=rows.slice(3990,4010).map(r=>r.observation),a=Parent.create(loaded),b=Parent.create(loaded);
  for(const obs of observations.slice(0,10)){const before=obs.slice();assert.deepEqual(a.action(obs),b.action(obs));assert.deepEqual(obs,before);}
  const state=a.capture();assert.ok(Object.isFrozen(state)&&Object.isFrozen(state.retained)&&state.retained.every(Object.isFrozen));
  const tail=observations.slice(10).map(obs=>a.action(obs));a.restore(state);assert.deepEqual(observations.slice(10).map(obs=>a.action(obs)),tail);
  assert.throws(()=>b.restore(state),/actually captured/);assert.throws(()=>a.restore({peak:1,retained:[]}),/actually captured/);
  a.reset();b.reset();for(const obs of observations)assert.deepEqual(a.action(obs),b.action(obs));
});
test('Only bounded neuronal observations can drive the parent, with no physical/time fields accepted',()=>{
  const a=Parent.create(loaded);assert.throws(()=>a.action(Array(515).fill(0)),/neuronal/);assert.throws(()=>a.action(Array(516).fill(Infinity)),/neuronal/);assert.throws(()=>a.action(Array(516).fill(2)),/neuronal/);
});
