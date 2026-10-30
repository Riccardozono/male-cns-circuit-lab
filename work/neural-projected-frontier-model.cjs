'use strict';
const fs=require('node:fs'),Head=require('./neural-json-head.cjs'),Grown=require('./neural-grown-model.cjs'),Parent=require('./neural-progressive-action.cjs'),Projected=require('./neural-projected-frontier.cjs'),Live=require('./neural-context-live.cjs');
const owned=new WeakSet();
function encode(data){const payloadJson=JSON.stringify(data);return JSON.stringify({format:'male-cns-private-projected-frontier-envelope',schema:1,payloadJson,sha256:Head.sha(payloadJson)});}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>32*1024*1024)throw Error('Bounded numeric projected model required');const e=JSON.parse(text);
  if(e.format!=='male-cns-private-projected-frontier-envelope'||e.schema!==1||typeof e.payloadJson!=='string'||Head.sha(e.payloadJson)!==e.sha256)throw Error('Projected format/checksum mismatch');
  const data=JSON.parse(e.payloadJson);if(data.format!=='male-cns-private-projected-frontier-model'||data.schema!==1||data.appVersion!=='5.6.0'||data.numericRuntime!=='24.19.0'||data.decoderRevision!=='projected-neuronal-frontier-v3')throw Error('Dedicated projected decoder revision required');
  const parent=Grown.parse(JSON.stringify(data.parentEnvelope));Projected.validate(data);if(data.weights?.length!==18||data.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Eighteen bounded numeric coefficients required');
  const r=data.verifiedFullResult;if(!r||r.complete!==true||![r.bestProgress,r.fitness,r.totalSimulationSeconds].every(Number.isFinite)||r.bestProgress<0||r.totalSimulationSeconds<=0||!Number.isInteger(r.laps)||r.laps<0||r.laps>2||typeof r.reason!=='string')throw Error('Verified actual complete result required');return {data,parent};
}
function load(file){const text=fs.readFileSync(file,'utf8'),parsed=parse(text);Object.assign(parsed,{modelFile:file,sha256:Head.sha(text)});owned.add(parsed);return parsed;}
function createFromLoaded(parsed,{weights=parsed.data.weights,sharedTopology=null,id=0,previousLapTime=null}={}){
  if(!owned.has(parsed)||process.versions.node!=='24.19.0'||weights.length!==18||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Actually loaded projected model and pinned runtime required');
  const parent=Parent.create(parsed.parent),projected=Projected.create(parsed.data),actionOverride=(_model,obs)=>projected.adjust(parent.action(obs),projected.observe(obs),weights);
  const env=Live.create(parsed.modelFile,{modelOverride:parsed.parent.parent.model,actionOverride,onReset:()=>{parent.reset();projected.reset();},sharedTopology,id,previousLapTime,modelSha256:parsed.sha256});
  return {...env,decoderRevision:parsed.data.decoderRevision,learnedWeights:weights.slice(),verificationExpected:parsed.data.verifiedFullResult};
}
module.exports={encode,parse,load,createFromLoaded};
