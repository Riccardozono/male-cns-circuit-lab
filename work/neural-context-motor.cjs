'use strict';
// Private nonlinear readout, not added anatomical neurons or an app save format.
const X=require('./neural-exploration-ar1.cjs');
function validate(graph,spec){
  X.validate(spec.context,graph.learning.nodes.length);
  if(!Array.isArray(spec.weights)||spec.weights.length!==2||spec.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>3)||
    !Number.isFinite(spec.retention)||spec.retention<0||spec.retention>.99)throw Error('Bounded private context motor readout required');
  return spec;
}
function wrap(F,graph,spec){
  validate(graph,spec);const active=spec.weights.some(w=>w!==0);
  return {...F,neuralStep(...args){
    const original=F.neuralStep(...args),brain=args[1],genome=args[2],p=graph.learning;
    if(args[4]===false||args[5]===false||!brain.policyFeatures||p.nodes.every(n=>Math.abs(brain.activity[n])<1e-7)){
      brain.contextMotorMemory=0;brain.contextMotorGate=0;return original;
    }
    const gate=X.scale(brain.policyFeatures,spec.context).gate;
    const memory=Math.max(gate,(brain.contextMotorMemory||0)*spec.retention);
    brain.contextMotorGate=gate;brain.contextMotorMemory=memory;
    if(!active||memory===0)return original;
    const w=genome.policyWeights,norm=1/Math.sqrt(p.nodes.length),logits=[0,0];
    for(let j=0;j<p.nodes.length;j++)for(let a=0;a<2;a++)logits[a]+=brain.policyFeatures[j]*w[p.readoutOffset+j*2+a]*norm;
    for(let a=0;a<2;a++)logits[a]+=w[w.length-2+a]+memory*spec.weights[a];
    const steering=Math.tanh(logits[0]),longitudinal=Math.tanh(logits[1]);
    return [steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
  }};
}
module.exports={validate,wrap};
