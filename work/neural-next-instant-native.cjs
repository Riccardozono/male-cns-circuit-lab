'use strict';
// Independent from-line native integration; no Bridge or captured physics.
const fs=require('node:fs'),Model=require('./neural-instant-context-model.cjs'),Origin=require('./neural-statehead-model.cjs'),Chain=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Live=require('./neural-command-live-cuda-packed.cjs'),Core=require('./neural-instant-context.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs');
function create({modelFile,preparedFile,weights}={}){
 const winner=Model.load(modelFile),loaded=Origin.load(winner.parentFile),old=JSON.parse(winner.data.preparedText),p=JSON.parse(fs.readFileSync(preparedFile,'utf8'));
 if(process.versions.node!=='24.19.0'||p.format!=='male-cns-next-instant-context-preparation-v1'||p.modelSha256!==winner.sha256)throw Error('Exact verified parent/new basis required');Core.validate(p.basis,weights);
 const genes=weights.slice(),chain=Chain.controller(loaded.parent),head=State.create(loaded.data);
 return Live.create(winner.parentFile,{modelOverride:loaded.parent.anchor.parent.parent.parent.model,modelSha256:winner.sha256,onReset:()=>{chain.reset();head.reset();},actionOverride:(_model,raw)=>{const action=chain.observe(raw);head.observe(raw);return action;},motorOverride:(_model,raw,prior)=>Core.compose(Core.compose(head.compose(chain.compose(prior),loaded.data.weights),raw,old.basis,winner.data.weights),raw,p.basis,genes)});
}
module.exports={create,stats:Cuda.stats,close:Cuda.close};
