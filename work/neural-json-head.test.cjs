'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Head=require('./neural-json-head.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/native-neural-head/learned-head.malecns-neural-exp.json');
test('Own exported neural coefficients have bounded finite inference and no recorded actions',()=>{
  const p=Head.load(file),a=Head.action(p,Array(516).fill(0));assert.equal(a.length,4);assert.ok(a.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
  assert.equal(p.actionSequence,undefined);assert.throws(()=>Head.action(p,Array(515).fill(0)));assert.throws(()=>Head.action(p,Array(516).fill(NaN)));
});
test('Changing a model coefficient without a matching checksum is refused',()=>{
  const e=JSON.parse(fs.readFileSync(file,'utf8')),p=JSON.parse(e.payloadJson);p.actor.layers[0].bias[0]+=.01;e.payloadJson=JSON.stringify(p);
  assert.throws(()=>Head.parse(JSON.stringify(e)),/checksum/);
});
test('A recomputed checksum cannot bypass decoder or coefficient compatibility',()=>{
  const e=JSON.parse(fs.readFileSync(file,'utf8')),p=JSON.parse(e.payloadJson);
  p.appVersion='5.6.1';e.payloadJson=JSON.stringify(p);e.sha256=Head.sha(e.payloadJson);assert.throws(()=>Head.parse(JSON.stringify(e)),/Incompatible/);
  p.appVersion='5.6.0';p.actor.layers[0].weights[0][0]=null;e.payloadJson=JSON.stringify(p);e.sha256=Head.sha(e.payloadJson);assert.throws(()=>Head.parse(JSON.stringify(e)),/coefficients/);
});
test('Ordinary simulator save formats and differing environment identities are refused',()=>{
  assert.throws(()=>Head.parse(JSON.stringify({format:'male-cns-progress',schema:1})),/envelope/);
  const p=Head.load(file);Head.validateEnvironment(p,p.environment);
  assert.throws(()=>Head.validateEnvironment(p,{...p.environment,circuitId:'monaco'}),/differs/);
});
