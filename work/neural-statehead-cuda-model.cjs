'use strict';
// Isolated adapter for the globally protected V3 state-dependent head.
// It deliberately uses its own save format and does not alter the frozen
// Windows-compatible frontier-chain model.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Core=require('./neural-statehead-model.cjs'),Cuda=require('./neural-statehead-cuda-runtime.cjs');
const root=path.resolve(__dirname,'..'),catalogFile=path.join(root,'.impeccable/review/neural-sacl/neuronal-verified-model-catalog.json'),lockstepFile=path.join(root,'.impeccable/review/neural-sacl/neuronal-statehead-cuda-lockstep-20261019-01/report.json');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function resolveEvidencePath(value){
  if(typeof value!=='string'||!value)throw Error('A model proof path is required');
  const normalized=value.replaceAll('\\','/'),marker='/.impeccable/review/neural-sacl/',index=normalized.toLowerCase().lastIndexOf(marker);
  if(index>=0){
    const bundled=path.join(root,normalized.slice(index+1).split('/').join(path.sep));
    if(fs.existsSync(bundled))return bundled;
  }
  const fallback=path.isAbsolute(value)?value:path.resolve(root,value);
  if(!fs.existsSync(fallback))throw Error('The verified model or proof is missing from this copy: '+value);
  return fallback;
}
function decorate(data){return Object.assign(data,{verifiedFullResult:data.verifiedFullResult||structuredClone(data.expectedResult),contextStages:data.projection.components.length,decoderRevision:data.provenance?.earlyGateRevision||'state-dependent-neural-head-18-coefficient-v1'});}
function parse(text,options){const parsed=Core.parse(text,options);return {...parsed,data:decorate(parsed.data)};}
function load(file,options){const loaded=Cuda.load(file,options);decorate(loaded.data);return loaded;}
function loadResearch(file){const loaded=Cuda.loadResearch(file,{expectedParentModelSha256:defaultChoice().modelSha256});decorate(loaded.data);return loaded;}
function createFromLoaded(loaded,options){return Cuda.createFromLoaded(loaded,options);}
function defaultChoice(){
  const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8')),selected=catalog.selectedResearch;
  if(catalog.appVersion!=='5.6.0'||catalog.modelId!=='v3'||catalog.circuitId!=='monza'||selected.family!=='state-head')throw Error('No protected global state-head V3/Monza candidate is catalogued');
  const modelFile=resolveEvidencePath(selected.modelFile),reportFile=resolveEvidencePath(selected.reportFile),modelText=fs.readFileSync(modelFile,'utf8'),modelSha256=sha(modelText),research=JSON.parse(fs.readFileSync(reportFile,'utf8')),verificationFile=path.join(path.dirname(reportFile),'verification.json'),verification=JSON.parse(fs.readFileSync(verificationFile,'utf8')),lockstep=JSON.parse(fs.readFileSync(lockstepFile,'utf8'));
  const expectedTrace=selected.actionTraceSha256,expected=selected.result,actual=lockstep.results?.[0];
  if(modelSha256!==selected.modelSha256||sha(fs.readFileSync(selected.reportFile))!==selected.reportSha256||sha(fs.readFileSync(verificationFile))!==selected.verificationSha256||research.passed!==true||verification.passed!==true||verification.modelSha256!==modelSha256||!lockstep.passed||lockstep.modelSha256!==modelSha256||lockstep.nodeVersion!=='24.19.0'||lockstep.nodeExecutableSha256!==catalog.nodeExecutableSha256||!lockstep.cuda?.gpuCalls||lockstep.cuda.cpuFallbacks!==0||!actual||actual.actionTraceSha256!==expectedTrace||!actual.result.complete||actual.result.bestProgress!==expected.bestProgress||actual.result.fitness!==expected.fitness||actual.result.laps!==expected.laps||actual.result.reason!==expected.reason||actual.result.totalSimulationSeconds!==expected.totalSimulationSeconds||JSON.stringify(actual.result.lapTimes)!==JSON.stringify(expected.lapTimes))throw Error('Global state-head candidate lacks matching current CPU/native and exact-CUDA physical proofs');
  return {family:selected.family,file:modelFile,modelSha256,expected:structuredClone(expected),actionTraceSha256:expectedTrace,proofFile:lockstepFile};
}
module.exports={parse,load,loadResearch,createFromLoaded,defaultChoice,resolveEvidencePath,identity:Cuda.identity,stats:Cuda.stats,closeCuda:Cuda.closeCuda};
