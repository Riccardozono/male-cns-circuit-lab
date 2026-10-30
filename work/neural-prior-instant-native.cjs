'use strict';
// Standalone native inference, without Bridge or practice-state capture.
const fs=require('node:fs'),Origin=require('./neural-statehead-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Live=require('./neural-prior-control-live.cjs'),Core=require('./neural-instant-context.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs'),I=require('./neural-research-source-identity.cjs');
// Only immutable parsed numeric data are shared. Changes to either file get
// another digest; mutable controller/brain/physical state is created per car.
const bundles=new Map();
function bundle(modelFile,preparedFile){const model=fs.readFileSync(modelFile),prepared=fs.readFileSync(preparedFile),key=I.sha(model)+':'+I.sha(prepared);let value=bundles.get(key);if(!value){value={loaded:Origin.load(modelFile),p:JSON.parse(prepared.toString('utf8'))};bundles.set(key,value);if(bundles.size>4)bundles.delete(bundles.keys().next().value);}return value;}
function create({modelFile,preparedFile,weights,id=0,sharedTopology=null,previousLapTime=null}={}){
 const {loaded,p}=bundle(modelFile,preparedFile);if(p.format!=='male-cns-actual-instant-neural-context-preparation-v1'||p.modelSha256!==loaded.sha256)throw Error('Actual source-matched instant context required');Core.validate(p.basis,weights);const genes=weights.slice(),chain=Chain.controller(loaded.parent),head=State.create(loaded.data);
 return Live.create(modelFile,{id,sharedTopology,previousLapTime,modelOverride:loaded.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,onReset:()=>{chain.reset();head.reset();},
  actionOverride:(_model,raw)=>{const old=chain.observe(raw);head.observe(raw);return old;},
  motorOverride:(_model,raw,prior)=>Core.compose(head.compose(chain.compose(prior),loaded.data.weights),raw,p.basis,genes)});
}
module.exports={create,stats:Cuda.stats,close:Cuda.close};
