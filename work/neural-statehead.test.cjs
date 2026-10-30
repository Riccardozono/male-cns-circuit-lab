'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),State=require('./neural-statehead.cjs'),Model=require('./neural-statehead-model.cjs');
const preparedFile=path.resolve(__dirname,'../.impeccable/review/neural-sacl/neuronal-clean-6584-statehead-prepared/prepared.json'),p=JSON.parse(fs.readFileSync(preparedFile,'utf8')),file=path.join(path.dirname(preparedFile),'zero.malecns-statehead.json'),bytes=fs.readFileSync(p.sourceTrajectoryFile),data=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8),row=i=>Array.from(data.subarray(i*530,i*530+516)),zero=Array(18).fill(0);
test('Actual full neural history has zero support before its recorded boundary and zero weights preserve motors',()=>{
  const h=State.create(p),prior=[.2,.7,0];let first=-1;for(let i=0;i<p.sourceControls;i++){h.observe(row(i));if(first<0&&h.value()>0)first=i;assert.deepEqual(h.compose(prior,zero),prior);}assert.equal(first,p.firstActivatedControl);assert.ok(h.value()>0);assert.equal(h.features().length,9);
});
test('After actual activation the same coefficients react to actual neuronal state, not merely a held offset',()=>{
  const h=State.create(p);for(let i=0;i<p.sourceControls;i++)h.observe(row(i));const reached=h.value();h.observe(row(8300));const a=h.features();h.observe(row(8450));const b=h.features(),axis=a.findIndex((v,i)=>i>0&&Math.abs(v-b[i])>1e-6);assert.ok(axis>0);assert.equal(h.value(),reached);const genes=zero.slice();genes[axis*2+1]=1;h.observe(row(8300));const ca=h.compose([0,0,0],genes);h.observe(row(8450));const cb=h.compose([0,0,0],genes);assert.notDeepEqual(ca,cb);assert.equal(Math.min(ca[1],ca[2]),0);assert.equal(Math.min(cb[1],cb[2]),0);
});
test('Observed feature/gate memory can restore only to its own actual capture',()=>{
  const a=State.create(p),b=State.create(p);a.observe(row(8300));b.observe(row(8300));const saved=a.capture(),before=a.features();a.observe(row(8450));a.restore(saved);assert.deepEqual(a.features(),before);assert.throws(()=>b.restore(saved),/own actually/);assert.throws(()=>a.observe(Array(516).fill(NaN)),/Actual bounded/);assert.throws(()=>a.compose([0,0,0],Array(18).fill(Infinity)),/bounded/);
});
test('Unverified new family is data-only and rejected by normal loading',()=>{
  const text=fs.readFileSync(file,'utf8');assert.throws(()=>Model.parse(text),/Explicit research/);const model=Model.parse(text,{allowResearch:true});assert.equal(model.data.status,'research-unverified');assert.deepEqual(model.data.weights,zero);assert.equal(model.data.parentSha256,p.parentSha256);assert.throws(()=>Model.parse('{"format":"male-cns-save"}',{allowResearch:true}),/Distinct/);assert.throws(()=>Model.createFromLoaded(model),/Actually loaded/);
  const sources=Model.compatibility();for(const file of ['work/neural-statehead.cjs','work/neural-statehead-model.cjs','.impeccable/experimental-penalty5/outputs/vehicle-992.js','.impeccable/experimental-penalty5/outputs/terrain.js','.impeccable/runtime-node24/node.exe'])assert.ok(sources[file]);
});
