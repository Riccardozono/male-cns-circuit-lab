'use strict';
// Standalone recurrent readout over the selected real descending-neuron frame.
// This research model is not an app controller or a native save format.
const fs=require('node:fs');
const crypto=require('node:crypto');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));

function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>64*1024*1024)throw Error('Bounded recurrent model required.');
  const envelope=JSON.parse(text);
  if(envelope.format!=='male-cns-neural-self-gru-envelope-v1'||typeof envelope.payloadJson!=='string'||sha(envelope.payloadJson)!==envelope.sha256)throw Error('Recurrent model format/checksum mismatch.');
  const data=JSON.parse(envelope.payloadJson),h=data.hiddenSize,n=data.inputSize;
  if(data.format!=='male-cns-neural-self-gru-v1'||data.status!=='research-unverified'||data.outputSize!==2||!Number.isInteger(h)||h<1||h>256||!Number.isInteger(n)||n<1||n>128)throw Error('Declared research GRU required.');
  const finite=(values,size,max=100)=>Array.isArray(values)&&values.length===size&&values.every(v=>Number.isFinite(v)&&Math.abs(v)<=max);
  if(!data.observerSpec||data.observerSpec.history!==4||data.observerSpec.previousActions!==2||data.observerSpec.readoutIndices?.length!==128||data.observerSpec.readoutBodyIds?.length!==128)throw Error('Actual neural observer contract required.');
  if(!finite(data.mean,128)||!finite(data.scale,128)||data.scale.some(v=>v<.02)||
     !finite(data.weightIH,3*h*n)||!finite(data.weightHH,3*h*h)||!finite(data.biasIH,3*h)||!finite(data.biasHH,3*h)||
     !finite(data.weightOut,2*h)||!finite(data.biasOut,2))throw Error('Invalid recurrent tensor dimensions or values.');
  if(data.projection){
    if(data.projection.method!=='observed-neural-pca-whitening-v1'||!finite(data.projection.weights,n*128,10000)||
       !finite(data.projection.eigenvalues,n,1e9)||!Number.isFinite(data.projection.varianceFloor)||data.projection.varianceFloor<=0)throw Error('Invalid observed-neural projection.');
  }else if(n!==128)throw Error('Reduced input requires an observed-neural projection.');
  return data;
}
function load(file){return parse(fs.readFileSync(file,'utf8'));}

function policy(data){
  const {hiddenSize:h,inputSize:n,mean,scale,weightIH,weightHH,biasIH,biasHH,weightOut,biasOut}=data;
  let hidden=new Float64Array(h),last=new Float64Array(2);
  function reset(){hidden.fill(0);last.fill(0);}
  function step(input,signal=true,enabled=true){
    if(!signal||!enabled){reset();return [0,0];}
    if(!Array.isArray(input)||input.length!==514||input.some(v=>!Number.isFinite(v)))throw Error('Finite 514-value causal observation required.');
    const normalized=new Float64Array(128);
    for(let i=0;i<128;i++)normalized[i]=Math.max(-10,Math.min(10,(input[384+i]-mean[i])/scale[i]));
    let x;
    if(data.projection){
      x=new Float64Array(n);
      const matrix=data.projection.weights;
      for(let r=0;r<n;r++){let sum=0,offset=r*128;for(let c=0;c<128;c++)sum+=matrix[offset+c]*normalized[c];x[r]=Math.max(-10,Math.min(10,sum));}
    }else x=normalized;
    const old=hidden,next=new Float64Array(h),gate=new Float64Array(3*h);
    for(let r=0;r<3*h;r++){let v=biasIH[r]+biasHH[r];const xOffset=r*n,hhOffset=r*h;for(let c=0;c<n;c++)v+=weightIH[xOffset+c]*x[c];for(let c=0;c<h;c++)v+=weightHH[hhOffset+c]*old[c];gate[r]=v;}
    for(let i=0;i<h;i++){
      const resetGate=sigmoid(gate[i]);
      const updateGate=sigmoid(gate[h+i]);
      const candidate=Math.tanh((biasIH[2*h+i]+ArrayDot(weightIH,(2*h+i)*n,x))+
        resetGate*(biasHH[2*h+i]+ArrayDot(weightHH,(2*h+i)*h,old)));
      next[i]=(1-updateGate)*candidate+updateGate*old[i];
    }
    hidden=next;
    for(let out=0;out<2;out++){let v=biasOut[out],offset=out*h;for(let c=0;c<h;c++)v+=weightOut[offset+c]*hidden[c];last[out]=Math.tanh(v);}
    return Array.from(last);
  }
  return {step,reset,state:()=>Array.from(hidden)};
}
function ArrayDot(weights,offset,values){let sum=0;for(let i=0;i<values.length;i++)sum+=weights[offset+i]*values[i];return sum;}

function parityError(data,probes){
  if(!Array.isArray(probes)||probes.length<1||probes.length>256)throw Error('Nonempty bounded recurrent parity probes required.');
  const p=policy(data);let maximum=0,hiddenMaximum=0;
  for(const probe of probes){
    const output=p.step(probe.input,true,true),state=p.state();
    if(!Array.isArray(probe.expectedSignedOutputs)||probe.expectedSignedOutputs.length!==2||!Array.isArray(probe.expectedHidden)||probe.expectedHidden.length!==data.hiddenSize)throw Error('Complete recurrent parity target required.');
    for(let i=0;i<2;i++)maximum=Math.max(maximum,Math.abs(output[i]-probe.expectedSignedOutputs[i]));
    for(let i=0;i<data.hiddenSize;i++)hiddenMaximum=Math.max(hiddenMaximum,Math.abs(state[i]-probe.expectedHidden[i]));
  }
  if(!Number.isFinite(maximum)||maximum>1e-10||!Number.isFinite(hiddenMaximum)||hiddenMaximum>1e-10)throw Error(`Torch/Node recurrent parity failed (${maximum}, ${hiddenMaximum}).`);
  return {maxOutputError:maximum,maxHiddenError:hiddenMaximum};
}
module.exports={parse,load,policy,parityError,sha};
