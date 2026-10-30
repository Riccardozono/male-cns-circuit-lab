'use strict';
// Data-only, appendable learned neuronal contexts. Nothing is a driving tape.
const fs=require('node:fs'),Head=require('./neural-json-head.cjs'),Context=require('./neural-context-readout.cjs');
function validateBasis(b){
  if(!b||b.scales?.length!==516||b.scales.some(v=>!Number.isFinite(v)||v<=0)||!Array.isArray(b.centres)||b.centres.length<1||b.centres.length>12)throw Error('Invalid observed context basis');
  for(const c of b.centres)if(c.values?.length!==516||c.values.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||!Number.isFinite(c.radius)||c.radius<=0)throw Error('Invalid observed neural centre');
}
function encode(data){
  const payloadJson=JSON.stringify(data);return JSON.stringify({format:'male-cns-private-context-envelope',schema:1,payloadJson,sha256:Head.sha(payloadJson)});
}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>16*1024*1024)throw Error('Bounded context model required');
  const e=JSON.parse(text);
  if(e.format!=='male-cns-private-context-envelope'||e.schema!==1||typeof e.payloadJson!=='string'||Head.sha(e.payloadJson)!==e.sha256)throw Error('Invalid context model checksum');
  const data=JSON.parse(e.payloadJson);
  if(data.format!=='male-cns-private-context-model'||data.schema!==1||data.appVersion!=='5.6.0'||data.decoderRevision!=='observed-neural-context-stack-v1'||!Array.isArray(data.stages)||data.stages.length>64)throw Error('Incompatible context model');
  const head=Head.parse(JSON.stringify(data.baseHeadEnvelope));
  for(const s of data.stages){validateBasis(s.basis);if(s.weights?.length!==s.basis.centres.length*2||s.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid context motor coefficients');}
  return {data,head};
}
function adjust(old,obs,basis,weights){
  const features=basis.centres.map(c=>Context.feature(obs,c,basis.scales)),norm=1/Math.sqrt(basis.centres.length);
  const a=old.slice();for(let action=0;action<2;action++){
    const delta=features.reduce((sum,f,k)=>sum+f*weights[k*2+action]*norm,0);
    if(delta!==0)a[action+2]=Math.tanh(Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,a[action+2])))+delta);
  }
  return a;
}
function action(model,obs){let a=Head.action(model.head,obs);for(const s of model.data.stages)a=adjust(a,obs,s.basis,s.weights);return a;}
function append(model,basis,weights,provenance){
  const data={...model.data,stages:model.data.stages.concat({basis,weights:weights.slice(),provenance})};return parse(encode(data));
}
module.exports={parse,encode,action,adjust,append,validateBasis,load:file=>parse(fs.readFileSync(file,'utf8'))};
