'use strict';
// Nonlinear motor readout over actual neural history, not extra fly neurons.
const X=require('./neural-exploration-ar1.cjs'),M=require('./neural-context-motor.cjs');
function wrap(F,graph,heads){
  if(!Array.isArray(heads)||heads.length<1||heads.length>8)throw Error('Bounded private head bank required');heads.forEach(spec=>M.validate(graph,spec));
  return {...F,neuralStep(...args){
    const original=F.neuralStep(...args),brain=args[1],genome=args[2],p=graph.learning;
    if(args[4]===false||args[5]===false||!brain.policyFeatures||p.nodes.every(n=>Math.abs(brain.activity[n])<1e-7)){
      brain.contextMotorGate=0;brain.contextMotorMemory=0;brain.contextBankMemories=Array(heads.length).fill(0);brain.contextBankGates=Array(heads.length).fill(0);return original;
    }
    const memories=brain.contextBankMemories?.length===heads.length?brain.contextBankMemories:(brain.contextBankMemories=Array(heads.length).fill(0)),gates=[],extra=[0,0];
    for(let h=0;h<heads.length;h++){
      const spec=heads[h],gate=X.scale(brain.policyFeatures,spec.context).gate,memory=Math.max(gate,(memories[h]||0)*spec.retention);memories[h]=memory;gates.push(gate);
      for(let a=0;a<2;a++)if(spec.weights[a]!==0)extra[a]+=memory*spec.weights[a];
    }
    brain.contextBankGates=gates;brain.contextMotorGate=gates[0];brain.contextMotorMemory=memories[0];
    if(extra.every(v=>v===0))return original;
    const w=genome.policyWeights,norm=1/Math.sqrt(p.nodes.length),logits=[0,0];
    for(let j=0;j<p.nodes.length;j++)for(let a=0;a<2;a++)logits[a]+=brain.policyFeatures[j]*w[p.readoutOffset+j*2+a]*norm;
    for(let a=0;a<2;a++)logits[a]+=w[w.length-2+a]+extra[a];
    const steering=Math.tanh(logits[0]),longitudinal=Math.tanh(logits[1]);return [steering,Math.max(0,longitudinal),Math.max(0,-longitudinal)];
  }};
}
module.exports={wrap};
