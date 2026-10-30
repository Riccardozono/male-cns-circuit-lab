'use strict';
const Parent=require('./neural-context-memory-parent.cjs'),Chain=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Live=require('./neural-command-live-cuda-packed.cjs'),Instant=require('./neural-instant-context.cjs'),Memory=require('./neural-learned-context-memory.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs');
function create(genes){
 const p=Parent.load(),{winner,loaded,old,prepared}=p;Memory.validate(prepared.basis,genes);const weights=genes.slice(),chain=Chain.controller(loaded.parent),head=State.create(loaded.data),memory=Memory.create(prepared.basis);
 const env=Live.create(winner.parentFile,{modelOverride:loaded.parent.anchor.parent.parent.parent.model,modelSha256:winner.sha256,onReset:()=>{chain.reset();head.reset();memory.reset();},actionOverride:(_model,raw)=>{const a=chain.observe(raw);head.observe(raw);memory.observe(raw,weights);return a;},motorOverride:(_model,raw,prior)=>memory.compose(Instant.compose(head.compose(chain.compose(prior),loaded.data.weights),raw,old.basis,winner.data.weights),weights)});
 return {...env,memoryValues:memory.values,parent:p};
}
module.exports={create,stats:Cuda.stats,close:Cuda.close};
