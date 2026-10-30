'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),model=Stack.load(path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json'));
test('Stack round trip preserves actual learned coefficients and observation-only inputs',()=>{
  const restored=Stack.parse(Stack.encode(model.data));assert.deepEqual(restored.data,model.data);
  const observation=model.data.stages[0].basis.centres[0].values;
  assert.deepEqual(Stack.action(restored,observation),Stack.action(model,observation));
  assert.equal(model.data.stages.length,3);assert.equal(model.data.stages.reduce((n,s)=>n+s.weights.length,0),36);
});
test('Zero new stage preserves the complete learned actor bit for bit',()=>{
  const basis=model.data.stages[2].basis,newModel=Stack.append(model,basis,Array(basis.centres.length*2).fill(0),{});
  for(const s of model.data.stages)for(const c of s.basis.centres)assert.deepEqual(Stack.action(newModel,c.values),Stack.action(model,c.values));
});
test('Invalid checksums, versions, centres and neural motor values are rejected',()=>{
  const e=JSON.parse(Stack.encode(model.data)),bad={...e,sha256:'0'.repeat(64)};assert.throws(()=>Stack.parse(JSON.stringify(bad)),/checksum/);
  const data=JSON.parse(e.payloadJson);data.appVersion='5.7.0';assert.throws(()=>Stack.parse(Stack.encode(data)),/Incompatible/);
  data.appVersion='5.6.0';data.stages[0].basis.centres[0].values[0]=null;assert.throws(()=>Stack.parse(Stack.encode(data)),/neural centre/);
  assert.throws(()=>Head.action(model.head,Array(516).fill(Infinity)),/observation/);
});
