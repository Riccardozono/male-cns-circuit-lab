'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Model=require('./neural-frontier-model.cjs');
const directory=path.resolve(__dirname,'../.impeccable/review/neural-sacl');
const projected=Model.parse(fs.readFileSync(path.join(directory,'diversity-native-model/model.malecns-neural-diversity.json'),'utf8'));
test('Exported projected model keeps a dedicated revision and bounded neuronal-only dimensions',()=>{
  assert.equal(projected.data.weights.length,10);assert.equal(projected.data.projection.components.length,4);assert.equal(projected.data.projection.mean.length,516);
  assert.throws(()=>Model.parse(Model.encode({...projected.data,weights:[0,0]})),/coefficients/);
  assert.throws(()=>Model.parse(Model.encode({...projected.data,projection:{...projected.data.projection,componentStd:[1,1,1,0]}})),/projection/);
  assert.throws(()=>Model.parse(Model.encode({...projected.data,projection:{...projected.data.projection,components:[]}})),/projection/);
});
test('Old private model cannot silently acquire a new projected decoder under its old revision',()=>{
  const old=Model.parse(fs.readFileSync(path.join(directory,'frontier-native-model/model.malecns-neural-frontier.json'),'utf8'));
  assert.throws(()=>Model.parse(Model.encode({...old.data,projection:projected.data.projection})),/dedicated/);
  assert.throws(()=>Model.parse(Model.encode({...projected.data,appVersion:'5.7.0'})),/Incompatible/);
});
