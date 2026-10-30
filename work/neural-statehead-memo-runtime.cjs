'use strict';
// Explicitly DIFFERENT private engine, not a source/save compatibility bypass.
// The numeric model is validated by its original loader; inference uses the
// new declared runtime. Complete native traces must prove equivalence before
// any Windows integration. No existing worker/app/source is replaced here.
const Model=require('./neural-statehead-model.cjs'),Parent=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Live=require('./neural-command-live-memo.cjs'),Memo=require('./exact-coo-memo.cjs'),Identity=require('./neural-research-source-identity.cjs');
const owned=new WeakSet(),revision='state-head-exact-memo-v1';
function load(file){const core=Model.load(file),loaded={core,data:core.data,modelFile:file,sha256:core.sha256};owned.add(loaded);return loaded;}
function createFromLoaded(loaded,{weights=loaded.data.weights,sharedTopology=null,id=0,previousLapTime=null}={}){
  if(!owned.has(loaded)||process.versions.node!=='24.19.0')throw Error('Actual model and pinned distinct memo runtime required');State.weights(weights);const genes=weights.slice(),brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);
  const env=Live.create(loaded.modelFile,{sharedTopology,id,previousLapTime,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const old=brain.observe(raw);head.observe(raw);return old;},motorOverride:(_model,_raw,prior)=>head.compose(brain.compose(prior),genes)});
  return {...env,experimentalEngineRevision:revision,stateHeadSnapshot:()=>({gate:head.value(),features:head.features()})};
}
const identity=()=>({revision,sources:Identity.collect(['work/neural-statehead-memo-runtime.cjs','.impeccable/runtime-node24/node.exe','outputs/data/connectome.json','outputs/data/circuits.json'])});
module.exports={load,createFromLoaded,identity,stats:Memo.stats,resetCache:Memo.reset};
