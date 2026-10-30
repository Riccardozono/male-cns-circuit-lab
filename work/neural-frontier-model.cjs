'use strict';
// Data-only private model: exported parent, observed neuronal basis and two
// retained or ten projected learned coefficients. No historical loader/tape.
const fs=require('node:fs'),Stack=require('./neural-context-stack.cjs'),Head=require('./neural-json-head.cjs'),Context=require('./neural-context-readout.cjs'),Live=require('./neural-context-live.cjs');
function encode(data){const payloadJson=JSON.stringify(data);return JSON.stringify({format:'male-cns-private-frontier-envelope',schema:1,payloadJson,sha256:Head.sha(payloadJson)});}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>16*1024*1024)throw Error('Bounded private frontier model required');
  const envelope=JSON.parse(text);
  if(envelope.format!=='male-cns-private-frontier-envelope'||envelope.schema!==1||typeof envelope.payloadJson!=='string'||Head.sha(envelope.payloadJson)!==envelope.sha256)throw Error('Invalid private frontier checksum');
  const data=JSON.parse(envelope.payloadJson);
  const projected=data.decoderRevision==='learned-projected-frontier-v2';
  if(data.format!=='male-cns-private-frontier-model'||data.schema!==1||data.appVersion!=='5.6.0'||!['learned-retained-frontier-v1','learned-projected-frontier-v2'].includes(data.decoderRevision)||data.numericRuntime!=='24.19.0')throw Error('Incompatible private frontier model');
  const model=Stack.parse(JSON.stringify(data.baseModelEnvelope));Stack.validateBasis(data.basis);
  if(!Array.isArray(data.weights)||data.weights.length!==(projected?10:2)||data.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid learned frontier coefficients');
  if(projected){
    const p=data.projection,vector=(v,n,bound=Infinity)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=bound);
    if(!p||!vector(p.mean,516,1)||!vector(p.scales,516)||p.scales.some(v=>v<=0)||!Array.isArray(p.components)||p.components.length!==4||p.components.some(v=>!vector(v,516,1.000001))||!vector(p.componentStd,4)||p.componentStd.some(v=>v<=0))throw Error('Invalid exported neuronal projection');
  }
  else if(data.projection!==undefined)throw Error('Projection requires its dedicated decoder revision');
  const result=data.verifiedFullResult;
  if(!result||!Number.isFinite(result.bestProgress)||!Number.isFinite(result.fitness)||!Number.isInteger(result.laps)||result.laps<0||result.laps>2||typeof result.reason!=='string'||!Number.isFinite(result.totalSimulationSeconds))throw Error('Actual full verification required');
  return {data,model};
}
const ownedModels=new WeakSet();
function load(modelFile){const text=fs.readFileSync(modelFile,'utf8'),parsed=parse(text);Object.assign(parsed,{modelFile,sha256:Head.sha(text)});ownedModels.add(parsed);return parsed;}
function createFromLoaded(parsed,{weights=parsed.data.weights,sharedTopology=null,id=0,previousLapTime=null}={}){
  if(!ownedModels.has(parsed)||!Array.isArray(weights)||weights.length!==parsed.data.weights.length||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Actual loaded numerical model and bounded learned weights required');
  const learnedWeights=weights.slice(),basis=parsed.data.basis,coefficients=learnedWeights.map(v=>Math.tanh(v));let peak=0;
  const actionOverride=(model,obs)=>{
    for(const centre of basis.centres)peak=Math.max(peak,Context.feature(obs,centre,basis.scales));
    const action=Stack.action(model,obs);
    let actual=coefficients;
    if(parsed.data.projection){
      const p=parsed.data.projection,normalized=p.mean.map((m,j)=>(obs[j]-m)/p.scales[j]);
      const features=[1,...p.components.map((row,i)=>Math.tanh(row.reduce((sum,v,j)=>sum+v*normalized[j],0)/p.componentStd[i]))];
      actual=[0,1].map(a=>Math.tanh(features.reduce((sum,v,k)=>sum+v*learnedWeights[2*k+a],0)));
    }
    for(let k=0;k<2;k++)if(peak!==0&&actual[k]!==0)action[k+2]=Math.tanh(Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,action[k+2])))+peak*actual[k]*(k===0?1:2));
    return action;
  };
  const env=Live.create(parsed.modelFile,{modelOverride:parsed.model,actionOverride,onReset:()=>{peak=0;},sharedTopology,modelSha256:parsed.sha256,id,previousLapTime});
  return {...env,verificationExpected:parsed.data.verifiedFullResult,decoderRevision:parsed.data.decoderRevision,learnedWeights,frontierState:()=>({peak})};
}
const create=modelFile=>createFromLoaded(load(modelFile));
module.exports={encode,parse,load,create,createFromLoaded};
