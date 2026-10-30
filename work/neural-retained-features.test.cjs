'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Retained=require('./neural-retained-features.cjs'),Model=require('./neural-grown-model.cjs');
const basis={scales:Array(516).fill(1),centres:[{values:Array(516).fill(0),radius:.1}]};
test('Artificial memory is driven by neurons, persists causally, resets and is agent-local',()=>{
  const a=Retained.create(basis),b=Retained.create(basis),far=Array(516).fill(.5),near=Array(516).fill(0);
  assert.deepEqual(a.observe(far),[0]);assert.deepEqual(a.observe(near),[1]);assert.deepEqual(a.observe(far),[1]);assert.deepEqual(b.observe(far),[0]);a.reset();assert.deepEqual(a.observe(far),[0]);
  const old=[.1,-.1,.3,-.4];assert.deepEqual(Retained.adjust(old,[1],[0,0]),old);assert.deepEqual(Retained.adjust(old,[0],[7,-7]),old);const result=Retained.adjust(old,[1],[1,-1]);assert.equal(result[0],old[0]);assert.equal(result[1],old[1]);assert.ok(result[2]>old[2]&&result[3]<old[3]);
});
test('Retention has an explicit decoder revision and cannot be smuggled into v1',()=>{
  const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/retained-native-model/model.malecns-neural-grown.json'),data=Model.parse(fs.readFileSync(file,'utf8')).data;
  assert.equal(data.decoderRevision,'grown-neuronal-context-v2');assert.equal(data.stages.at(-1).retention,'peak');
  assert.throws(()=>Model.parse(Model.encode({...data,decoderRevision:'grown-neuronal-context-v1'})),/revision/);
  const broken=structuredClone(data);broken.stages.at(-1).retention='position';assert.throws(()=>Model.parse(Model.encode(broken)),/revision/);
});
