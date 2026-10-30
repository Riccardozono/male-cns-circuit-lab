'use strict';
// Portable numeric inference only: no experiment bridge, pickle or old save.
const fs=require('node:fs'),Head=require('./neural-json-head.cjs'),Projected=require('./neural-projected-frontier-model.cjs'),Residual=require('./neural-projected-residual.cjs'),Live=require('./neural-context-live.cjs');
const owned=new WeakSet();
function encode(data){const payloadJson=JSON.stringify(data);return JSON.stringify({format:'male-cns-private-neuronal-sac-envelope',schema:1,payloadJson,sha256:Head.sha(payloadJson)});}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>64*1024*1024)throw Error('Bounded numeric SAC model required');const e=JSON.parse(text);
  if(e.format!=='male-cns-private-neuronal-sac-envelope'||e.schema!==1||typeof e.payloadJson!=='string'||Head.sha(e.payloadJson)!==e.sha256)throw Error('Private SAC format/checksum mismatch');
  const data=JSON.parse(e.payloadJson);
  if(data.format!=='male-cns-private-neuronal-sac-model'||data.schema!==1||data.appVersion!=='5.6.0'||data.numericRuntime!=='24.19.0'||data.decoderRevision!=='projected-neuronal-sac-residual-v1')throw Error('Dedicated SAC decoder revision required');
  const parent=Projected.parse(JSON.stringify(data.parentEnvelope));Residual.createGate(data.basis);Residual.validateNormalization(data.normalization);Residual.validateActor(data.actor);
  const r=data.verifiedFullResult;if(!r||r.complete!==true||!['bestProgress','fitness','totalSimulationSeconds'].every(k=>Number.isFinite(r[k]))||r.bestProgress<0||r.totalSimulationSeconds<=0||!Number.isInteger(r.laps)||r.laps<0||r.laps>2||typeof r.reason!=='string')throw Error('Actual complete full result required');
  return {data,parent};
}
function load(file){const text=fs.readFileSync(file,'utf8'),parsed=parse(text);Object.assign(parsed,{modelFile:file,sha256:Head.sha(text)});owned.add(parsed);return parsed;}
function createFromLoaded(parsed,{sharedTopology=null,id=0}={}){
  if(!owned.has(parsed)||process.versions.node!=='24.19.0')throw Error('Actually loaded SAC model and pinned runtime required');
  const parent=Residual.createParent(parsed.parent),gate=Residual.createGate(parsed.data.basis);
  return Live.create(parsed.modelFile,{modelOverride:parsed.parent.parent.parent.model,sharedTopology,id,modelSha256:parsed.sha256,onReset:()=>{parent.reset();gate.reset();},
    actionOverride:(_m,raw)=>{const old=parent.action(raw),g=gate.observe(raw),obs=raw.concat(old,[g]);return Residual.compose(old,g,Residual.forward(parsed.data.actor,Residual.normalize(obs,parsed.data.normalization)));}});
}
module.exports={encode,parse,load,createFromLoaded};
