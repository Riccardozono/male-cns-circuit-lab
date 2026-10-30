'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-grown-model.cjs'),Original=require('./neural-frontier-model.cjs');
const file=path.resolve(__dirname,'../.impeccable/review/neural-sacl/grown-native-model/model.malecns-neural-grown.json');
test('Dedicated grown format preserves actual graph/neuronal basis and rejects ordinary formats',()=>{
  const text=fs.readFileSync(file,'utf8'),parsed=Model.parse(text);assert.equal(parsed.parent.model.head.environment.graph.nodes,7721);assert.equal(parsed.parent.model.head.environment.graph.edges,242486);assert.equal(parsed.data.stages[0].basis.centres.length,6);assert.equal(parsed.data.stages[0].weights.length,12);
  assert.throws(()=>Original.parse(text),/checksum/);assert.throws(()=>Model.parse('{"format":"male-cns-save"}'),/checksum/);
});
test('Checksum, decoder/runtime and finite numerical dimensions are strict',()=>{
  const text=fs.readFileSync(file,'utf8');assert.throws(()=>Model.parse(text.replace('5.6.0','5.7.0')),/checksum/);
  const mutate=fn=>{const e=JSON.parse(text),p=JSON.parse(e.payloadJson);fn(p);e.payloadJson=JSON.stringify(p);e.sha256=crypto.createHash('sha256').update(e.payloadJson).digest('hex');return JSON.stringify(e);};
  assert.throws(()=>Model.parse(mutate(p=>p.numericRuntime='22.22.0')),/Incompatible/);assert.throws(()=>Model.parse(mutate(p=>p.decoderRevision='other')),/Incompatible/);
  assert.throws(()=>Model.parse(mutate(p=>p.stages[0].weights=[1])),/coefficients/);assert.throws(()=>Model.parse(mutate(p=>p.stages[0].basis.centres[0].radius=0)),/centre/);
});
