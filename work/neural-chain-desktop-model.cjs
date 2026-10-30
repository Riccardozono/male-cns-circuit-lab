'use strict';
// A separate desktop adapter. The proven inference implementation and every
// existing model remain byte-identical. Only the last two learned coefficients
// are varied; every agent owns its neuronal history, gates and physical car.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Chain=require('./neural-frontier-chain.cjs'),Live=require('./neural-command-live.cjs');
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
  const registryFile=path.join(root,'.impeccable/review/neural-sacl/neuronal-clean-champion.json'),registry=JSON.parse(fs.readFileSync(registryFile,'utf8')),s=registry.selected;
  if(registry.format!=='male-cns-private-verified-clean-champion-registry-v1'||registry.schema!==1||registry.appVersion!=='5.6.0'||registry.modelId!=='v3'||registry.circuitId!=='monza'||!s)throw Error('Verified clean-model registry required');
  if(sha(fs.readFileSync(path.join(root,'.impeccable/runtime-node24/node.exe')))!==registry.nodeExecutableSha256)throw Error('The verified numerical runtime has changed');
  const file=path.resolve(s.modelFile),reportFile=path.resolve(s.reportFile),verificationFile=path.join(path.dirname(reportFile),'verification.json');
  if(sha(fs.readFileSync(file))!==s.modelSha256||sha(fs.readFileSync(reportFile))!==s.reportSha256||sha(fs.readFileSync(verificationFile))!==s.verificationSha256)throw Error('The selected model or its independent evidence has changed');
  const loaded=load(file),report=JSON.parse(fs.readFileSync(reportFile,'utf8')),v=JSON.parse(fs.readFileSync(verificationFile,'utf8'));
  const keys=['bestProgress','fitness','laps','reason','totalSimulationSeconds'];
  if(!report.passed||!v.passed||v.reportSha256!==s.reportSha256||v.cleanModelSha256!==s.modelSha256||!keys.every(k=>loaded.data.verifiedFullResult[k]===s.result[k])||JSON.stringify(loaded.data.verifiedFullResult.lapTimes)!==JSON.stringify(s.result.lapTimes)||loaded.inner.data.fullTraceSha256!==s.actionTraceSha256||!Array.isArray(report.nativeCleanProofs)||report.nativeCleanProofs.length!==2||!report.nativeCleanProofs.every(p=>p.passed&&p.complete&&!p.censored&&!p.overlap&&p.modelSha256===s.modelSha256&&p.actionTraceSha256===s.actionTraceSha256&&keys.every(k=>p.result[k]===s.result[k])))throw Error('Two matching complete native proofs are required for the default model');
  return {file,modelSha256:s.modelSha256,result:structuredClone(s.result),actionTraceSha256:s.actionTraceSha256,registryFile};
}
module.exports={parse,load,createFromLoaded,defaultChoice};
