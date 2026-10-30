'use strict';
// Artificial readout of actual descending-neuron activity. Inputs are four
// observed neural frames and the previous two executed motor commands only.
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
function observer(F,graph,track,spec){
  const p=F.ensureLearning(graph),indices=spec.readoutIndices;
  if(spec.history!==4||spec.previousActions!==2||indices.length!==128||new Set(indices).size!==128||indices.some((i,k)=>graph.bodyIds[i]!==spec.readoutBodyIds[k]||graph.classNames[graph.classCodes[i]]!=='descending_neuron'))throw Error('Actual declared descending-neuron observations required.');
  if(spec.baseGenome.adapterVersion!==p.version||spec.baseGenome.policyWeights.length!==p.length)throw Error('Current neural encoder layout required.');
  let brain,history;
  const reset=()=>{brain=F.makeBrain(graph);history=[];};reset();
  return {reset,get brain(){return brain;},observe(car,previous=[0,0]){
    const perception={...car,footprintSensorsEnabled:true};
    const sensors=F.sense(track,perception).concat(F.physicsSense(perception,track));
    F.neuralStepForTrack(track,graph,brain,spec.baseGenome,sensors,true,true,car.vehicle.speedMps);
    const frame=indices.map(i=>Math.tanh(8*brain.activity[i]));history.push(frame);if(history.length>4)history.shift();
    const input=Array.from({length:4-history.length},()=>history[0]).concat(history).flat().concat(previous);
    if(input.length!==514||input.some(v=>!Number.isFinite(v)))throw Error('Finite causal neural observations required.');
    return input;
  },signal:()=>indices.some(i=>Math.abs(brain.activity[i])>=1e-7)};
}
function parse(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>64*1024*1024)throw Error('Bounded readout model required.');
  const envelope=JSON.parse(text);
  if(envelope.format!=='male-cns-neural-self-readout-envelope-v1'||typeof envelope.payloadJson!=='string'||sha(envelope.payloadJson)!==envelope.sha256)throw Error('Readout format/checksum mismatch.');
  const data=JSON.parse(envelope.payloadJson);
  if(data.format!=='male-cns-neural-self-readout-v1'||data.status!=='research-unverified'||data.inputSize!==514||data.outputSize!==2||!data.observerSpec||!data.sourceSha256)throw Error('Declared research readout required.');
  if(data.mean?.length!==514||data.scale?.length!==514||data.mean.some(v=>!Number.isFinite(v))||data.scale.some(v=>!Number.isFinite(v)||v<.02))throw Error('Finite fixed neural normalization required.');
  if(!Array.isArray(data.layers)||data.layers.length<1||data.layers.length>4)throw Error('Bounded readout architecture required.');
  let width=514;
  for(const layer of data.layers){
    if(layer.input!==width||!Number.isInteger(layer.output)||layer.output<1||layer.output>512||layer.weights?.length!==width*layer.output||layer.bias?.length!==layer.output||[...layer.weights,...layer.bias].some(v=>!Number.isFinite(v)||Math.abs(v)>100))throw Error('Invalid readout layer.');
    width=layer.output;
  }
  if(width!==2)throw Error('Two signed motor outputs required.');
  return data;
}
function load(file){return parse(fs.readFileSync(file,'utf8'));}
function action(data,input,signal=true,enabled=true){
  if(!signal||!enabled)return [0,0,0];
  if(input.length!==514||input.some(v=>!Number.isFinite(v)))throw Error('Finite causal neural input required.');
  let x=Float64Array.from(input,(v,i)=>Math.max(-10,Math.min(10,(v-data.mean[i])/data.scale[i])));
  for(const layer of data.layers){
    const next=new Float64Array(layer.output);
    for(let row=0;row<next.length;row++){let value=layer.bias[row];for(let col=0;col<x.length;col++)value+=x[col]*layer.weights[row*x.length+col];next[row]=Math.tanh(value);}
    x=next;
  }
  return [x[0],Math.max(0,x[1]),Math.max(0,-x[1])];
}
function parityError(data,probes){
  if(!Array.isArray(probes)||probes.length<1||probes.length>256)throw Error('Nonempty bounded parity probes required.');
  let maximum=0;
  for(const probe of probes){
    if(!Array.isArray(probe?.input)||probe.input.length!==514||probe.input.some(v=>!Number.isFinite(v))||
       !Array.isArray(probe.expectedSignedOutputs)||probe.expectedSignedOutputs.length!==2||
       probe.expectedSignedOutputs.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Finite complete parity probes required.');
    const a=action(data,probe.input),actual=[a[0],a[1]-a[2]];
    for(let j=0;j<2;j++)maximum=Math.max(maximum,Math.abs(actual[j]-probe.expectedSignedOutputs[j]));
  }
  if(!Number.isFinite(maximum)||maximum>1e-10)throw Error('Torch/Node motor prediction parity failed.');
  return maximum;
}
module.exports={observer,parse,load,action,parityError,sha};
