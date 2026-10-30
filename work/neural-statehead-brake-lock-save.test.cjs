'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Model=require('./neural-statehead-cuda-model.cjs');
const {Coordinator}=require('./neural-statehead-brake-lock-coordinator.cjs');
const Save=require('./neural-statehead-brake-lock-save.cjs');
const Base=require('./neural-statehead-cuda-save.cjs');
after(()=>Model.closeCuda());
function seedState(coordinator){
  const weights=coordinator.loaded.data.weights.slice();
  return {population:16,mutation:.16,speedMultiplier:1,randomState:coordinator.random.getState(),
    generation:1,history:[],completedEpisodes:0,updates:0,previousLapTime:null,
    archive:coordinator.archive.snapshot(),
    entries:Array.from({length:16},(_,id)=>({id,weights:weights.slice()}))};
}

test('separate v5.6.0 save protocol round-trips a paused, 16-car verified seed',async()=>{
  const choice=Model.defaultChoice(),coordinator=new Coordinator({modelFile:choice.file,population:16,workers:4});
  const state=seedState(coordinator),modelText=fs.readFileSync(choice.file,'utf8');
  const encoded=Save.encode(modelText,state),parsed=Save.parse(encoded);
  assert.equal(parsed.protocol,Save.PROTOCOL);
  assert.equal(parsed.rewardRevision,Save.REVISION);
  assert.equal(parsed.state.population,16);
  assert.equal(parsed.state.generation,1);
  assert.equal(parsed.state.history.length,0);
  assert.throws(()=>Base.parse(encoded),/Checksum|Formato/);
});

test('reward-directed neural context survives its private save without widening the base protocol',async()=>{
  const choice=Model.defaultChoice(),coordinator=new Coordinator({modelFile:choice.file,population:16,workers:4});
  const state=seedState(coordinator),modelText=fs.readFileSync(choice.file,'utf8');
  const context={features:[1,.5,-.25,.75,-.4,.3,-.6,.2,.1],gate:.89,brakeLockPenalty:869.16,
    progress:6584,laps:1,reason:'ferma / senza progresso'};
  state.archive.champion.rewardDirectedContext=context;
  const parsed=Save.parse(Save.encode(modelText,state));
  assert.deepEqual(parsed.state.archive.champion.rewardDirectedContext,context);
  const restored=new Coordinator({modelFile:choice.file,population:16,workers:4,restored:parsed.state});
  assert.deepEqual(restored.archive.champion.rewardDirectedContext,context,'coordinator reconstruction retains the isolated context');
  const legacy=Base.parse(Base.encode(modelText,Save.toBaseState(state)));
  assert.equal(legacy.state.archive.champion.rewardDirectedContext,undefined,'base format stays strict and isolated');
  const invalid=structuredClone(state);invalid.archive.champion.rewardDirectedContext.features[2]=2;
  assert.throws(()=>Save.encode(modelText,invalid),/Invalid reward-directed observed neural context/);
});

test('previous CUDA DEV save protocol is not accepted by the brake-lock copy',async()=>{
  const choice=Model.defaultChoice(),coordinator=new Coordinator({modelFile:choice.file,population:16,workers:4});
  const state=seedState(coordinator),modelText=fs.readFileSync(choice.file,'utf8');
  const oldFormat=Base.encode(modelText,Save.toBaseState(state));
  assert.throws(()=>Save.parse(oldFormat),/Formato\/checksum/);
});
