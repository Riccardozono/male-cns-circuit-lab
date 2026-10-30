'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Model=require('./neural-frontier-chain.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),file=path.join(root,'.impeccable/review/neural-sacl/neuronal-command-4287-branch-native/branch.malecns-frontier-chain.json');
test('Exploration-only chains and old formats cannot silently load as clean or standard saves',()=>{
  const text=fs.readFileSync(file,'utf8');assert.throws(()=>Model.parse(text),/exploration permission/);assert.equal(Model.parse(text,{allowExploration:true}).data.status,'exploration-only');
  const envelope=JSON.parse(text);envelope.payloadJson+=' ';assert.throws(()=>Model.parse(JSON.stringify(envelope),{allowExploration:true}),/checksum/);
  const data=Model.parse(text,{allowExploration:true}).data;data.status='clean-verified';assert.throws(()=>Model.parse(Model.encode(data)),/Crashing/);
  assert.throws(()=>Model.parse(fs.readFileSync(path.join(root,'.impeccable/review/neural-sacl/neuronal-command-3803-cma-bias/model.malecns-neuronal-command.json'),'utf8'),{allowExploration:true}),/format/);
});
test('Neuronal controller snapshots restore exactly and cannot cross independently owned controllers',()=>{
  const loaded=Model.load(file,{allowExploration:true}),a=Model.controller(loaded),b=Model.controller(loaded),nativeReport=JSON.parse(fs.readFileSync(path.dirname(file)+'/report.json','utf8')),bytes=fs.readFileSync(nativeReport.proofs[0].trajectoryFile),values=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8);
  // Actual neuronal rows used only in an isolated ownership/memory test. No
  // artificial episode, desired driving action or optimizer example is made.
  const row=i=>Array.from(values.subarray(i*530,i*530+516));a.observe(row(5250));b.observe(row(5250));const state=a.capture(),before=a.snapshot();a.observe(row(5251));a.observe(row(5252));a.restore(state);assert.deepEqual(a.snapshot(),before);assert.throws(()=>b.restore(state),/own actually captured/);assert.equal(a.snapshot().input.length,521);
});
test('Actual native wrapper still blocks every learned correction when biological activity is absent',()=>{
  const loaded=Model.load(file,{allowExploration:true}),env=Model.createFromLoaded(loaded);env.currentCar().brain.activity.fill(0);const s=env.step();assert.deepEqual(s.car.outputs,[0,0,0]);assert.equal(env.graph.n,7721);
});
