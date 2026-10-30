'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),R=require('./neural-projected-residual.cjs'),Model=require('./neural-projected-frontier-model.cjs'),SAC=require('./neural-projected-residual-model.cjs');
const base=path.resolve(__dirname,'../.impeccable/review/neural-sacl'),prepared=JSON.parse(fs.readFileSync(path.join(base,'projected-residual-3803-prepared/prepared.json'),'utf8'));
function zero(){return {dimensions:R.DIMENSIONS.slice(),layers:R.DIMENSIONS.slice(1).map((n,k)=>({activation:k<2?'relu':'tanh-unscale',weights:Array.from({length:n},()=>Array(R.DIMENSIONS[k]).fill(0)),bias:Array(n).fill(0)}))};}
test('Dedicated numeric SAC actor has 37698 finite coefficients, exact zero identity and strict bounded input',()=>{
  const actor=zero();R.validateActor(actor);assert.equal(actor.layers.reduce((sum,l)=>sum+l.bias.length+l.weights.flat().length,0),37698);
  R.validateNormalization(prepared.normalization);const input=R.normalize(Array(521).fill(.25),prepared.normalization);assert.ok(input.every(v=>Number.isFinite(v)&&Math.abs(v)<=10));assert.deepEqual(R.forward(actor,input),[0,0]);
  const old=[.2,-.1,.6,-.7];assert.deepEqual(R.compose(old,1,[0,0]),old);assert.deepEqual(R.compose(old,0,[1,-1]),old);assert.deepEqual(old,[.2,-.1,.6,-.7]);
  assert.throws(()=>R.normalize(Array(521).fill(NaN),prepared.normalization),/bounded/);assert.throws(()=>R.compose(old,1,[1,2]),/Bounded/);actor.layers[2].bias[0]=NaN;assert.throws(()=>R.validateActor(actor),/Finite/);
});
test('Retained observed gate and frozen parent memories restore only their own actually captured state',()=>{
  const loaded=Model.load(prepared.parentModelFile),parent=R.createParent(loaded),other=R.createParent(loaded),gate=R.createGate(prepared.basis),obs=prepared.basis.centres[0].values;
  const a=parent.action(obs),state=parent.capture();assert.ok(Object.isFrozen(state));parent.action(Array(516).fill(0));parent.restore(state);const repeated=parent.action(obs);parent.restore(state);assert.deepEqual(parent.action(obs),repeated);assert.throws(()=>other.restore(state),/Own/);assert.equal(a.length,4);
  assert.equal(gate.observe(obs),1);const g=gate.capture();gate.reset();assert.equal(gate.value(),0);gate.restore(g);assert.equal(gate.value(),1);assert.throws(()=>R.createGate(prepared.basis).restore(g),/Own/);
});
test('SAC private model is a distinct checksummed numeric format, not an old compatible save',()=>{
  const data={format:'male-cns-private-neuronal-sac-model',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',decoderRevision:'projected-neuronal-sac-residual-v1',parentEnvelope:JSON.parse(fs.readFileSync(prepared.parentModelFile,'utf8')),basis:prepared.basis,normalization:prepared.normalization,actor:zero(),verifiedFullResult:prepared.sourceResult};
  const text=SAC.encode(data),parsed=SAC.parse(text);assert.equal(parsed.data.actor.dimensions[0],521);assert.equal(parsed.parent.data.weights.length,18);assert.throws(()=>Model.parse(text),/checksum/);assert.throws(()=>SAC.parse(text.replace('5.6.0','5.7.0')),/checksum/);assert.throws(()=>SAC.parse(SAC.encode({...data,decoderRevision:'projected-neuronal-frontier-v3'})),/revision/);
});
test('Compact neuronal support remains in its mathematical range despite a one-ulp polynomial overshoot',()=>{
  const Context=require('./neural-context-readout.cjs'),basis={centres:[{values:Array(516).fill(0),radius:1}],scales:Array(516).fill(1)},obs=Array(516).fill(1e-9);
  assert.ok(Context.feature(obs,basis.centres[0],basis.scales)>1);const gate=R.createGate(basis);assert.equal(gate.observe(obs),1);assert.doesNotThrow(()=>R.compose([0,0,0,0],gate.value(),[.1,.2]));
  gate.reset();assert.equal(gate.observe(Array(516).fill(1)),0);assert.deepEqual(R.compose([0,0,0,0],gate.value(),[1,1]),[0,0,0,0]);
});
