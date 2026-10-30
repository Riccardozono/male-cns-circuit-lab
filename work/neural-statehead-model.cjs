'use strict';
// New private family: embedded proven parent + learned state-dependent head.
// No changes to the frozen chain model, old saves or existing Windows copies.
const fs=require('node:fs'),path=require('node:path'),Parent=require('./neural-frontier-chain.cjs'),State=require('./neural-statehead.cjs'),Live=require('./neural-command-live.cjs'),Identity=require('./neural-research-source-identity.cjs');
const root=path.resolve(__dirname,'..'),owned=new WeakSet(),sha=Identity.sha;
const compatibility=()=>Identity.collect(['work/neural-statehead-model.cjs','.impeccable/runtime-node24/node.exe','outputs/data/connectome.json','outputs/data/circuits.json']);
function encode(data){const payloadJson=JSON.stringify(data);return JSON.stringify({format:'male-cns-neuronal-state-head-envelope',schema:1,payloadJson,sha256:sha(payloadJson)});}
function parse(text,{allowResearch=false}={}){
  if(typeof text!=='string'||Buffer.byteLength(text)>64*1024*1024)throw Error('Bounded private state-head model required');const e=JSON.parse(text);
  if(e.format!=='male-cns-neuronal-state-head-envelope'||e.schema!==1||typeof e.payloadJson!=='string'||sha(e.payloadJson)!==e.sha256)throw Error('Distinct state-head format/checksum required');const data=JSON.parse(e.payloadJson);
  if(data.format!=='male-cns-neuronal-state-head-model'||data.schema!==1||data.appVersion!=='5.6.0'||data.numericRuntime!=='24.19.0'||data.modelId!=='v3'||data.circuitId!=='monza'||!['research-unverified','exploration-only','clean-verified'].includes(data.status)||data.status!=='clean-verified'&&!allowResearch)throw Error('Explicit research permission or a physically verified clean model required');
  if(JSON.stringify(data.sourceCompatibility)!==JSON.stringify(compatibility())||typeof data.parentModelText!=='string'||sha(data.parentModelText)!==data.parentSha256)throw Error('Exact state-head source/runtime/parent identity required');const parent=Parent.parse(data.parentModelText);State.create(data);State.weights(data.weights);
  const r=data.expectedResult;if(!r||r.complete!==true||!['bestProgress','fitness','totalSimulationSeconds'].every(k=>Number.isFinite(r[k]))||!Number.isInteger(r.laps)||r.laps<0||r.laps>2||!Array.isArray(r.lapTimes)||r.lapTimes.length!==r.laps||r.lapTimes.some(v=>!Number.isFinite(v)||v<=0)||typeof r.reason!=='string'||!(/^[0-9a-f]{64}$/).test(data.fullTraceSha256))throw Error('Actual complete result/trace metadata required');
  if(data.status==='clean-verified'&&(['urto','fuori pista','progresso non valido'].includes(r.reason)||r.fitness<parent.data.expectedResult.fitness||r.bestProgress<parent.data.expectedResult.bestProgress||r.laps<parent.data.expectedResult.laps))throw Error('A weaker or crashing state head cannot be a clean replacement');
  return {data};
}
function load(file,options){
  const text=fs.readFileSync(file,'utf8'),parsed=parse(text,options),cache=path.join(root,'.impeccable/review/neural-sacl/statehead-parent-cache'),parentFile=path.join(cache,parsed.data.parentSha256+'.json');fs.mkdirSync(cache,{recursive:true});
  try{fs.writeFileSync(parentFile,parsed.data.parentModelText,{encoding:'utf8',flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(sha(fs.readFileSync(parentFile,'utf8'))!==parsed.data.parentSha256)throw Error('Private embedded-parent cache differs');}
  Object.assign(parsed,{parent:Parent.load(parentFile),modelFile:file,sha256:sha(text)});owned.add(parsed);return parsed;
}
function createFromLoaded(parsed,{weights=parsed.data.weights,sharedTopology=null,id=0,previousLapTime=null}={}){
  if(!owned.has(parsed)||process.versions.node!=='24.19.0')throw Error('Actually loaded state-head model and pinned numerical runtime required');State.weights(weights);const genes=weights.slice(),brain=Parent.controller(parsed.parent),head=State.create(parsed.data);
  const env=Live.create(parsed.modelFile,{sharedTopology,id,previousLapTime,modelOverride:parsed.parent.anchor.parent.parent.parent.model,modelSha256:parsed.sha256,onReset:()=>{brain.reset();head.reset();},
    actionOverride:(_model,raw)=>{const old=brain.observe(raw);head.observe(raw);return old;},motorOverride:(_model,_raw,prior)=>head.compose(brain.compose(prior),genes)});
  return {...env,stateHeadSnapshot:()=>({gate:head.value(),features:head.features()})};
}
function seed(preparedFile,outFile){
  if(fs.existsSync(outFile))throw Error('Preserve existing research model');const p=JSON.parse(fs.readFileSync(preparedFile,'utf8')),parentModelText=fs.readFileSync(p.parentFile,'utf8');
  if(p.format!=='male-cns-actual-neuronal-state-head-preparation-v1'||sha(parentModelText)!==p.parentSha256)throw Error('Actual prepared neural projection required');
  const data={format:'male-cns-neuronal-state-head-model',schema:1,appVersion:'5.6.0',numericRuntime:'24.19.0',modelId:'v3',circuitId:'monza',status:'research-unverified',sourceCompatibility:compatibility(),parentModelText,parentSha256:p.parentSha256,basis:p.basis,projection:p.projection,weights:p.weights.slice(),expectedResult:p.sourceFullResult,fullTraceSha256:p.sourceFullTraceSha256,provenance:{preparedSha256:sha(fs.readFileSync(preparedFile,'utf8')),zeroCorrectionExpectedFromActualParent:true}};
  const text=encode(data);parse(text,{allowResearch:true});fs.writeFileSync(outFile,text,{encoding:'utf8',flag:'wx'});return {modelFile:outFile,sha256:sha(text)};
}
module.exports={encode,parse,load,createFromLoaded,compatibility,seed};
