'use strict';
// Explicitly DIFFERENT private exact-CUDA engine, not a save bypass.
// The numeric model is validated by its original loader; inference uses the
// new declared runtime. Complete native traces must prove equivalence before
// any Windows integration. No existing worker/app/source is replaced here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Model=require('./neural-statehead-model.cjs'),Parent=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Live=require('./neural-command-live-cuda.cjs'),Memo=require('./cuda-exact-v3-runtime.cjs'),Identity=require('./neural-research-source-identity.cjs'),Safety=require('./neural-statehead-cuda-safety.cjs');
const root=path.resolve(__dirname,'..'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const owned=new WeakSet(),revision='state-head-exact-cuda-driver-v1';
function load(file){const core=Model.load(file),loaded={core,data:core.data,modelFile:file,sha256:core.sha256};owned.add(loaded);return loaded;}
function loadResearch(file,{expectedParentModelSha256=null}={}){
  const modelFile=path.resolve(file),text=fs.readFileSync(modelFile,'utf8'),core=Model.parse(text,{allowResearch:true}),data=core.data;
  const provenance=data.provenance||{},early=provenance.earlyGateRevision==='observed-neural-gate-uniform-mid-episode-v1'&&(provenance.motorCorrectionGain===undefined||provenance.motorCorrectionGain===1)||provenance.earlyGateRevision==='observed-neural-gate-uniform-mid-episode-v2-low-gain'&&provenance.motorCorrectionGain===.2;
  const postLap=provenance.earlyGateRevision==='observed-neural-gate-post-lap-v1'&&provenance.motorCorrectionGain===.2||provenance.earlyGateRevision==='observed-neural-gate-post-lap-v2-ultra-low-gain'&&provenance.motorCorrectionGain===.02||provenance.earlyGateRevision==='observed-neural-gate-post-lap-v3-physics-safety'&&provenance.motorCorrectionGain===.2&&provenance.physicsSafety===Safety.revision;
  const validPostLap=postLap&&Number.isFinite(provenance.protectedFraction)&&provenance.protectedFraction>=.85&&provenance.protectedFraction<.99&&Number.isInteger(provenance.gateFirstActivatedControl)&&Number.isInteger(provenance.firstLapControl)&&provenance.gateFirstActivatedControl>provenance.firstLapControl;
  if(data.status!=='research-unverified'||!early&&!validPostLap||!/^[0-9a-f]{64}$/.test(provenance.parentCleanModelSha256||'')||expectedParentModelSha256&&provenance.parentCleanModelSha256!==expectedParentModelSha256||!Number.isFinite(provenance.protectedFraction)||early&&provenance.protectedFraction>=.8)throw Error('Only an explicitly prepared early-gate or post-lap research model derived from the protected parent is allowed');
  const cache=path.join(root,'.impeccable/review/neural-sacl/statehead-parent-cache'),parentFile=path.join(cache,data.parentSha256+'.json');fs.mkdirSync(cache,{recursive:true});
  try{fs.writeFileSync(parentFile,data.parentModelText,{encoding:'utf8',flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(sha(fs.readFileSync(parentFile,'utf8'))!==data.parentSha256)throw Error('Embedded research parent cache checksum mismatch');}
  core.parent=Parent.load(parentFile);core.modelFile=modelFile;core.sha256=sha(text);
  const loaded={core,data,modelFile,sha256:core.sha256};data.verifiedFullResult=structuredClone(core.parent.data.expectedResult);data.migratedWeights=data.weights.slice();data.weights=Array(18).fill(0);
  if(!data.verifiedFullResult?.complete||!Number.isFinite(data.verifiedFullResult.bestProgress)||!Number.isInteger(data.verifiedFullResult.laps))throw Error('A measured physical result from the frozen parent is required');
  owned.add(loaded);return loaded;
}
function createFromLoaded(loaded,{weights=loaded.data.weights,sharedTopology=null,id=0,previousLapTime=null}={}){
  if(!owned.has(loaded)||process.versions.node!=='24.19.0')throw Error('Actual model and pinned distinct CUDA runtime required');State.weights(weights);const genes=weights.slice(),gain=loaded.data.provenance?.motorCorrectionGain??1,effectiveGenes=genes.map(value=>value*gain),brain=Parent.controller(loaded.core.parent),head=State.create(loaded.data);
  const env=Live.create(loaded.modelFile,{sharedTopology,id,previousLapTime,modelOverride:loaded.core.parent.anchor.parent.parent.parent.model,modelSha256:loaded.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const old=brain.observe(raw);head.observe(raw);return old;},motorOverride:(_model,_raw,prior,car)=>{const safety=loaded.data.provenance?.physicsSafety===Safety.revision?Safety.scale(car):1;return head.compose(brain.compose(prior),safety===1?effectiveGenes:effectiveGenes.map(value=>value*safety));}});
  return {...env,experimentalEngineRevision:revision,stateHeadSnapshot:()=>({gate:head.value(),features:head.features()})};
}
const identity=()=>({revision,cuda:Memo.identity(),sources:Identity.collect(['work/neural-statehead-cuda-runtime.cjs','.impeccable/runtime-node24/node.exe','outputs/data/connectome.json','outputs/data/circuits.json'])});
module.exports={load,loadResearch,createFromLoaded,identity,stats:Memo.stats,closeCuda:Memo.close};
