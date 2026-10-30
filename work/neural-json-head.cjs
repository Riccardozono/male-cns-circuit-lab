'use strict';
// A bounded, data-only model parser. Never deserialize Python pickle or code.
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>16*1024*1024)throw Error('Private model size exceeded');
  const e=JSON.parse(text);
  if(e.format!=='male-cns-private-neural-envelope'||e.schema!==1||typeof e.payloadJson!=='string'||sha(e.payloadJson)!==e.sha256)throw Error('Invalid private model envelope or checksum');
  const p=JSON.parse(e.payloadJson);
  if(p.format!=='male-cns-private-neural-head'||p.schema!==1||p.appVersion!=='5.6.0'||p.environment?.decoderRevision!=='neural-bilateral-authority-v4'||p.environment?.actionDimensions!==4||p.environment?.objectiveRevision!=='progress-5-crash-safety-experiment')throw Error('Incompatible private neural decoder');
  const dims=[516,256,256,2],finite=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000;
  if(JSON.stringify(p.actor?.dimensions)!==JSON.stringify(dims)||p.actor?.layers?.length!==3)throw Error('Unsupported private actor dimensions');
  for(let k=0;k<3;k++){
    const l=p.actor.layers[k];
    if(l.activation!==(k<2?'relu':'tanh-unscale')||l.weights?.length!==dims[k+1]||l.bias?.length!==dims[k+1]||l.bias.some(v=>!finite(v))||l.weights.some(row=>!Array.isArray(row)||row.length!==dims[k]||row.some(v=>!finite(v))))throw Error('Invalid private actor coefficients');
  }
  const r=p.learnedResidual;
  if(!r||['bias','priorLongWeight','steeringBias'].some(k=>!finite(r[k]))||!Number.isFinite(r.width)||r.width<=0||r.width>100)throw Error('Invalid private motor readout');
  return p;
}
function actor(p,observation){
  if(!Array.isArray(observation)||observation.length!==516||observation.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded neuronal observation required');
  const f=Math.fround;let input=observation.map(f);
  for(let k=0;k<3;k++){
    const l=p.actor.layers[k];
    input=l.weights.map((row,i)=>{
      let sum=l.bias[i];for(let j=0;j<row.length;j++)sum+=row[j]*input[j];sum=f(sum);
      // NumPy unscale on [-1,1] rounds the intermediate action+1.
      return k<2?Math.max(0,sum):f(f(f(Math.tanh(sum))+1)-1);
    });
  }
  return input;
}
function action(p,observation){
  const a=actor(p,observation),r=p.learnedResidual;
  const x=observation[512]*2,y=observation[513]*2,feature=Math.exp(-(x*x+y*y)/(2*r.width*r.width));
  return a.concat([Math.tanh(r.steeringBias)*feature,Math.tanh(r.bias+r.priorLongWeight*observation[515])*feature]);
}
function validateEnvironment(p,environment){
  if(JSON.stringify(p.environment)!==JSON.stringify(environment))throw Error('Private checkpoint environment differs');
}
module.exports={parse,load:file=>parse(fs.readFileSync(file,'utf8')),actor,action,validateEnvironment,sha};
