'use strict';
// Separate Windows adapter for the already-qualified numeric research model.
const fs=require('node:fs'),path=require('node:path'),Base=require('./neural-instant-context-model.cjs'),Live=require('./neural-instant-training-native.cjs'),Cuda=require('./cuda-exact-v3-packed-runtime.cjs'),I=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),owned=new WeakSet();
function view(inner){return {inner,data:{weights:inner.data.weights.slice(),verifiedFullResult:structuredClone(inner.data.expectedResult),decoderRevision:'instant-neuronal-context-direct-motor-v1',contextStages:JSON.parse(inner.data.preparedText).basis.centres.length}};}
function parse(text){return view(Base.parse(text));}
function load(file){const inner=Base.load(file),parsed={...view(inner),modelFile:file,sha256:inner.sha256};owned.add(parsed);return parsed;}
function createFromLoaded(parsed,{weights=parsed.data.weights,sharedTopology=null,id=0,previousLapTime=null}={}){
 if(!owned.has(parsed)||process.versions.node!=='24.19.0')throw Error('Actually loaded verified numeric model and pinned runtime required');
 const env=Live.create({modelFile:parsed.inner.parentFile,preparedFile:parsed.inner.preparedFile,weights,sharedTopology,id,previousLapTime});
 return {...env,modelSha256:parsed.sha256,decoderRevision:parsed.data.decoderRevision,learnedWeights:weights.slice(),verificationExpected:parsed.data.verifiedFullResult};
}
function defaultChoice(){
 const registryFile=path.join(root,'.impeccable/review/neural-sacl/verified-research-frontier-v2.json'),registry=JSON.parse(fs.readFileSync(registryFile,'utf8')),s=registry.selected;
 if(registry.format!=='male-cns-private-verified-research-frontier-v2'||registry.appVersion!=='5.6.0'||registry.modelId!=='v3'||registry.circuitId!=='monza'||s.family!=='instant-neural-context-v1')throw Error('Qualified instantaneous-neural research registry required');
 const loaded=load(s.modelFile);if(loaded.sha256!==s.modelSha256||loaded.inner.data.fullTraceSha256!==s.fullTraceSha256)throw Error('Selected numeric model changed');
 for(const [name,digest]of Object.entries(s.evidence))if(I.sha(fs.readFileSync(path.join(path.dirname(s.modelFile),name)))!==digest)throw Error('Selected physical evidence changed');
 const proofFile=path.join(root,'.impeccable/review/neural-sacl/instant-desktop-preflight.json'),p=JSON.parse(fs.readFileSync(proofFile,'utf8'));
 if(!p.passed||p.modelSha256!==loaded.sha256||p.actionTraceSha256!==s.fullTraceSha256||p.engineIdentity!==require('./neural-instant-save.cjs').identity()||!p.cuda.gpuCalls||p.cuda.cpuFallbacks!==0)throw Error('Current independent Windows-adapter preflight required');
 return {file:s.modelFile,modelSha256:loaded.sha256,result:loaded.data.verifiedFullResult,actionTraceSha256:s.fullTraceSha256,registryFile,proofFile};
}
module.exports={parse,load,createFromLoaded,defaultChoice,stats:Cuda.stats,closeCuda:Cuda.close};
