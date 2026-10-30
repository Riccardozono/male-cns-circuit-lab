'use strict';
// Dedicated data-only decoder: frozen learned PCA parent plus compact learned
// neuronal-context stages. Not compatible with the ordinary/native-v1 saves.
const fs=require('node:fs'),Original=require('./neural-frontier-model.cjs'),Stack=require('./neural-context-stack.cjs'),Context=require('./neural-context-readout.cjs'),Live=require('./neural-context-live.cjs'),Head=require('./neural-json-head.cjs'),Retained=require('./neural-retained-features.cjs');
const owned=new WeakSet(),atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
function encode(data){const payloadJson=JSON.stringify(data);return JSON.stringify({format:'male-cns-private-grown-envelope',schema:1,payloadJson,sha256:Head.sha(payloadJson)});}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>24*1024*1024)throw Error('Bounded grown model required');
  const e=JSON.parse(text);if(e.format!=='male-cns-private-grown-envelope'||e.schema!==1||typeof e.payloadJson!=='string'||Head.sha(e.payloadJson)!==e.sha256)throw Error('Invalid grown model checksum/format');
  const data=JSON.parse(e.payloadJson);
  if(data.format!=='male-cns-private-grown-model'||data.schema!==1||data.appVersion!=='5.6.0'||!['grown-neuronal-context-v1','grown-neuronal-context-v2'].includes(data.decoderRevision)||data.numericRuntime!=='24.19.0'||!Array.isArray(data.stages)||data.stages.length<1||data.stages.length>64)throw Error('Incompatible grown neuronal decoder');
  const parent=Original.parse(JSON.stringify(data.parentEnvelope));if(parent.data.decoderRevision!=='learned-projected-frontier-v2')throw Error('Verified projected parent required');
  for(const stage of data.stages){Stack.validateBasis(stage.basis);if(!Array.isArray(stage.weights)||stage.weights.length!==stage.basis.centres.length*2||stage.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid grown coefficients');}
  if(data.stages.some(s=>s.retention!==undefined&&s.retention!=='peak')||data.decoderRevision==='grown-neuronal-context-v1'&&data.stages.some(s=>s.retention!==undefined)||data.decoderRevision==='grown-neuronal-context-v2'&&!data.stages.some(s=>s.retention==='peak'))throw Error('Explicit compatible neuronal retention revision required');
  const r=data.verifiedFullResult;if(!r||!Number.isFinite(r.bestProgress)||r.bestProgress<0||!Number.isFinite(r.fitness)||!Number.isInteger(r.laps)||r.laps<0||r.laps>2||typeof r.reason!=='string'||r.complete!==true||!Number.isFinite(r.totalSimulationSeconds)||r.totalSimulationSeconds<=0)throw Error('Actual complete full result required');
  return {data,parent};
}
function load(file){const text=fs.readFileSync(file,'utf8'),parsed=parse(text);Object.assign(parsed,{modelFile:file,sha256:Head.sha(text)});owned.add(parsed);return parsed;}
function createFromLoaded(parsed,{weights=parsed.data.stages.at(-1).weights,sharedTopology=null,id=0,previousLapTime=null}={}){
  if(process.versions.node!=='24.19.0')throw Error('Numerical runtime Node24.19.0 required');
  if(!owned.has(parsed)||!Array.isArray(weights)||weights.length!==parsed.data.stages.at(-1).weights.length||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Actual loaded model and bounded local weights required');
  const stages=parsed.data.stages.map((s,i)=>({...s,weights:(i===parsed.data.stages.length-1?weights:s.weights).slice()})),memories=stages.map(s=>s.retention==='peak'?Retained.create(s.basis):null),parent=parsed.parent,p=parent.data.projection;let peak=0;
  const actionOverride=(model,obs)=>{
    for(const c of parent.data.basis.centres)peak=Math.max(peak,Context.feature(obs,c,parent.data.basis.scales));
    let action=Stack.action(model,obs);const normalized=p.mean.map((m,j)=>(obs[j]-m)/p.scales[j]),f=[1,...p.components.map((r,k)=>Math.tanh(r.reduce((sum,v,j)=>sum+v*normalized[j],0)/p.componentStd[k]))];
    const residual=[0,1].map(a=>Math.tanh(f.reduce((sum,v,k)=>sum+v*parent.data.weights[2*k+a],0)));
    for(let k=0;k<2;k++)if(peak!==0&&residual[k]!==0)action[k+2]=Math.tanh(atanh(action[k+2])+peak*residual[k]*(k===0?1:2));
    for(let i=0;i<stages.length;i++){const stage=stages[i];action=memories[i]?Retained.adjust(action,memories[i].observe(obs),stage.weights):Stack.adjust(action,obs,stage.basis,stage.weights);}return action;
  };
  const env=Live.create(parsed.modelFile,{modelOverride:parent.model,actionOverride,onReset:()=>{peak=0;for(const m of memories)m?.reset();},sharedTopology,id,previousLapTime,modelSha256:parsed.sha256});
  return {...env,decoderRevision:parsed.data.decoderRevision,learnedWeights:weights.slice(),verificationExpected:parsed.data.verifiedFullResult};
}
module.exports={encode,parse,load,createFromLoaded,create:file=>createFromLoaded(load(file))};
