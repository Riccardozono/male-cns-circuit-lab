'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Command=require('./neural-command-residual.cjs'),Model=require('./neural-command-model.cjs'),Old=require('./neural-projected-residual-model.cjs');
const base=path.resolve(__dirname,'../.impeccable/review/neural-sacl'),prepared=JSON.parse(fs.readFileSync(path.join(base,'projected-residual-3803-prepared/prepared.json'),'utf8')),actual=JSON.parse(fs.readFileSync(path.join(base,'projected-sensory-information/baseline.json'),'utf8'));
test('Zero neural corrections and protected observations preserve every actual prior motor command exactly',()=>{
  for(const row of actual.rows){const old=row.commands.slice();assert.deepEqual(Command.compose(old,row.inference.gate,[0,0]),old);assert.deepEqual(Command.compose(old,0,[-1,1]),old);assert.deepEqual(row.commands,old);}
});
test('Full observed context allows both motor directions and full brake for all428actually recorded active states',()=>{
  // Pure reachability calculations, never applied to vehicles/training replay.
  const rows=actual.rows.filter(r=>r.inference.gate===1);assert.equal(rows.length,428);
  for(const row of rows){const old=row.commands;assert.deepEqual(Command.compose(old,1,[-1,-1]),[-1,0,1]);assert.deepEqual(Command.compose(old,1,[1,1]),[1,1,0]);}
});
test('Axes remain independent and malformed/overlapping/nonfinite motor values fail closed',()=>{
  const old=[.2,.7,0];assert.equal(Command.compose(old,.5,[0,-.4])[0],old[0]);assert.deepEqual(Command.compose(old,.5,[.4,0]).slice(1),old.slice(1));
  assert.throws(()=>Command.compose([0,.2,.2],1,[0,0]),/exclusive/);assert.throws(()=>Command.compose(old,NaN,[0,0]),/observed/);assert.throws(()=>Command.compose(old,1,[2,0]),/corrections/);
});
test('The command decoder is a distinctly checksummed private format, not an old compatible model/save',()=>{
  const data={format:'male-cns-private-neuronal-command-model',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',decoderRevision:'neuronal-command-residual-v1',parentEnvelope:JSON.parse(fs.readFileSync(prepared.parentModelFile,'utf8')),basis:prepared.basis,normalization:prepared.normalization,actor:JSON.parse(fs.readFileSync(path.join(base,'projected-residual-3803-sac-bounded/initial-actor.json'),'utf8')),verifiedFullResult:prepared.sourceResult,verifiedTraceSha256:prepared.actualSourceTraceSha256};
  const text=Model.encode(data),parsed=Model.parse(text);assert.equal(parsed.data.decoderRevision,'neuronal-command-residual-v1');assert.equal(parsed.data.actor.dimensions[0],521);
  assert.throws(()=>Old.parse(text),/checksum/);assert.throws(()=>Model.parse(fs.readFileSync(path.join(base,'projected-residual-3803-sac-bounded/model.malecns-neuronal-sac.json'),'utf8')),/checksum/);
  assert.throws(()=>Model.parse(Model.encode({...data,decoderRevision:'projected-neuronal-sac-residual-v1'})),/revision/);
});
test('Direct motor transport still requires actual biological-neuron activity and exclusive pedals',()=>{
  const State=require('./neural-command-state.cjs'),env=State.create();env.reset('full');env.inspect().car.brain.activity.fill(0);
  assert.throws(()=>env.stepMotor([0,.5,.5]),/exclusive/);env.stepMotor([.8,1,0]);assert.deepEqual(env.inspect().lastCommands,[0,0,0]);
});
