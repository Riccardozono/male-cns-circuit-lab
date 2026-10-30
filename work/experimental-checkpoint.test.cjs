'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('./experimental-checkpoint.cjs');
test('Research checkpoint rejects tampering, graph mismatch and changed implementation',()=>{
  const expected={format:'male-cns-cma-experiment',graph:{policyVersion:8,nodes:7721},sourceSha256:'s',legacySourceSha256:'o',sourceHashes:{'kernel.js':'k'}},body={...expected,schema:1,appVersion:'5.6.0',weights:[1,2]},sealed=C.seal(body);
  assert.deepEqual(C.verify(sealed,expected),body);assert.throws(()=>C.verify({...sealed,weights:[3,4]},expected),/checksum/);assert.throws(()=>C.verify(sealed,{...expected,graph:{policyVersion:3,nodes:7721}}),/identity/);assert.throws(()=>C.verify(sealed,{...expected,sourceHashes:{'kernel.js':'different'}}),/implementation/);assert.throws(()=>C.seal(sealed),/already/);
});
