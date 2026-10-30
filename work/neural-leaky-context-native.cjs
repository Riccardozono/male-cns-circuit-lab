'use strict';
// Standalone native inference, without Bridge or practice-state capture.
const fs=require('node:fs'),Origin=require('./neural-statehead-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Live=require('./neural-command-live-cuda-packed.cjs'),Core=require('./neural-leaky-context.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs');
function create({modelFile,preparedFile,weights,id=0,sharedTopology=null}={}){
 const loaded=Origin.load(modelFile),p=JSON.parse(fs.readFileSync(preparedFile,'utf8'));if(p.format!=='male-cns-actual-instant-neural-context-preparation-v1'||p.modelSha256!==loaded.sha256)throw Error('Actual source-matched instant context required');Core.validate(p.basis,weights);const genes=weights.slice(),chain=Chain.controller(loaded.parent),head=State.create(loaded.data),memory=Core.create(p.basis);
 return Live.create(modelFile,{id,sharedTopology,modelOverride:loaded.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,onReset:()=>{chain.reset();head.reset();memory.reset();},
  actionOverride:(_model,raw)=>{const old=chain.observe(raw);head.observe(raw);memory.observe(raw);return old;},
  motorOverride:(_model,raw,prior)=>memory.compose(head.compose(chain.compose(prior),loaded.data.weights),genes)});
}
module.exports={create,stats:Cuda.stats,close:Cuda.close};
