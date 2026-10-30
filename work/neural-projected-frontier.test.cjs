'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Projected=require('./neural-projected-frontier.cjs'),Model=require('./neural-projected-frontier-model.cjs'),Grown=require('./neural-grown-model.cjs');
const base=path.resolve(__dirname,'../.impeccable/review/neural-sacl'),prepared=JSON.parse(fs.readFileSync(path.join(base,'projected-frontier-3680/prepared.json'),'utf8')),parent=Grown.load(prepared.parentModelFile);
const data=()=>({format:'male-cns-private-projected-frontier-model',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',decoderRevision:'projected-neuronal-frontier-v3',parentEnvelope:JSON.parse(fs.readFileSync(prepared.parentModelFile,'utf8')),basis:prepared.basis,projection:prepared.projection,weights:Array(18).fill(0),verifiedFullResult:parent.data.verifiedFullResult});
test('The actual eight-axis projection has eighteen learnable weights and a distinct private revision',()=>{
  const parsed=Model.parse(Model.encode(data()));assert.equal(parsed.data.weights.length,18);assert.equal(parsed.data.projection.components.length,8);assert.equal(parsed.parent.parent.model.head.environment.graph.nodes,7721);
  assert.throws(()=>Grown.parse(Model.encode(data())),/checksum/);assert.throws(()=>Model.parse(fs.readFileSync(prepared.parentModelFile,'utf8')),/checksum/);assert.throws(()=>Model.parse(Model.encode({...data(),decoderRevision:'grown-neuronal-context-v2'})),/revision/);
  assert.throws(()=>Model.parse(Model.encode({...data(),weights:[0,0]})),/Eighteen/);
});
test('Zero coefficients preserve every old command; the observed prefix has an exactly zero gate',()=>{
  const p=Projected.create(prepared),old=[.2,-.1,.6,-.7],obs=Array(516).fill(0),features=p.observe(obs);assert.deepEqual(p.adjust(old,features,Array(18).fill(0)),old);
  const rows=JSON.parse(fs.readFileSync(path.join(base,'progressive-3652-first/stage-03/parent-actual-trace.json'),'utf8'));
  p.reset();for(const r of rows.slice(0,50)){const original=r.observation.slice(),f=p.observe(r.observation);assert.deepEqual(p.adjust(old,f,Array(18).fill(8)),old);assert.deepEqual(r.observation,original);}
  const centre=prepared.basis.centres[0].values,a=p.observe(centre),state=p.capture();assert.ok(Object.isFrozen(state));const b=p.observe(rows.at(-1).observation);assert.notDeepEqual(a,b);p.restore(state);assert.deepEqual(p.observe(centre),a);
  const other=Projected.create(prepared);assert.throws(()=>other.restore(state),/Own observed/);assert.throws(()=>p.adjust(old,a,[1]),/Eighteen/);
});
test('Projection dimensions, finite input, scales and the dedicated checksum fail closed',()=>{
  const broken=data();broken.projection={...prepared.projection,componentStd:Array(8).fill(0)};assert.throws(()=>Model.parse(Model.encode(broken)),/projection/);
  assert.throws(()=>Projected.create(prepared).observe(Array(516).fill(NaN)),/neuronal/);const text=Model.encode(data());assert.throws(()=>Model.parse(text.replace('5.6.0','5.7.0')),/checksum/);
});
