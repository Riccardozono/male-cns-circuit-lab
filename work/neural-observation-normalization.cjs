'use strict';
// Fixed componentwise conditioning fitted only on genuine observed neural and
// controller state. No dimension reduction, action target or driving rule.
const fs=require('node:fs'),crypto=require('node:crypto');
const REVISION='fixed-observed520-tanh-normalization-v1';
function create(data){
  if(data?.format!=='male-cns-actual-neuronal-observation-normalization-v1'||data.schema!==1||data.dimensions!==520||data.transform!=='tanh((actualObservedX-mean)/scale)'||data.scaleFloor!==.05||!Number.isSafeInteger(data.actualObservationRows)||data.actualObservationRows<256||!Array.isArray(data.mean)||data.mean.length!==520||data.mean.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||!Array.isArray(data.scales)||data.scales.length!==520||data.scales.some(v=>!Number.isFinite(v)||v<.05||v>2)||!/^[a-f0-9]{64}$/.test(data.sourceModelSha256))throw Error('Fixed actual520-dimensional neural normalization required');
  const mean=data.mean.slice(),scales=data.scales.slice();
  return x=>{if(!Array.isArray(x)||x.length!==520||x.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual bounded neuronal/controller values required');return x.map((v,i)=>Math.tanh((v-mean[i])/scales[i]));};
}
function load(file,modelSha256){const bytes=fs.readFileSync(file),data=JSON.parse(bytes.toString('utf8'));if(data.sourceModelSha256!==modelSha256)throw Error('Normalization originated from a different neural controller');return {encode:create(data),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),revision:REVISION,actualObservationRows:data.actualObservationRows};}
module.exports={REVISION,create,load};
