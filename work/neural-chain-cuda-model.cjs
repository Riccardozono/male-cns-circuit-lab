'use strict';
// A separate desktop adapter. The proven inference implementation and every
// existing model remain byte-identical. Only the last two learned coefficients
// are varied; every agent owns its neuronal history, gates and physical car.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Chain=require('./neural-frontier-chain.cjs'),Live=require('./neural-command-live-cuda-packed.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs');
const root=path.resolve(__dirname,'..'),owned=new WeakSet();
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function view(parsed){
  const last=parsed.data.stages.at(-1);
  if(!last||last.genes.some(v=>Math.abs(v)>8))throw Error('A clean chain with two bounded final coefficients is required');
  return {inner:parsed,data:{weights:last.genes.slice(),verifiedFullResult:structuredClone(parsed.data.expectedResult),decoderRevision:'neuronal-chain-last-pair-v1',contextStages:parsed.data.stages.length}};
}
function parse(text){return view(Chain.parse(text));}
function load(file){const inner=Chain.load(file),parsed={...view(inner),modelFile:file,sha256:inner.sha256};owned.add(parsed);return parsed;}
function createFromLoaded(parsed,{weights=parsed.data.weights,sharedTopology=null,id=0,previousLapTime=null}={}){
  if(!owned.has(parsed)||process.versions.node!=='24.19.0'||!Array.isArray(weights)||weights.length!==2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Actually loaded clean chain, two coefficients and pinned numerical runtime required');
  const frozenWeights=weights.slice(),brain=Chain.controller(parsed.inner);
  const env=Live.create(parsed.modelFile,{sharedTopology,id,previousLapTime,modelOverride:parsed.inner.anchor.parent.parent.parent.model,modelSha256:parsed.sha256,
    onReset:()=>brain.reset(),actionOverride:(_model,raw)=>brain.observe(raw),motorOverride:(_model,_raw,prior)=>brain.compose(prior,frozenWeights)});
  return {...env,decoderRevision:parsed.data.decoderRevision,learnedWeights:frozenWeights.slice(),verificationExpected:parsed.data.verifiedFullResult};
}
function defaultChoice(){
  const selected=require('./neural-chain-desktop-model.cjs').defaultChoice();
  const proofFile=path.join(root,'.impeccable/review/neural-sacl/chain-cuda-desktop-preflight-current.json');
  const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));
  if(!proof.passed||proof.modelSha256!==selected.modelSha256||proof.actionTraceSha256!==selected.actionTraceSha256||proof.engineIdentity!==require('./neural-chain-cuda-save.cjs').identity()||!proof.cuda.gpuCalls||proof.cuda.cpuFallbacks!==0)throw Error('Run the current pinned CUDA preflight before opening this separate copy');
  return {...selected,proofFile};
}

module.exports={parse,load,createFromLoaded,defaultChoice,stats:Cuda.stats,closeCuda:Cuda.close};
