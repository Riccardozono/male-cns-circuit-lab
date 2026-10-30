'use strict';
// Data-only CUDA-trained residual. Anatomical simulation stays in pinned Node24.
// Inference inputs are neuronal history, old motor memory and own old actions.
const Context=require('./neural-context-readout.cjs'),Stack=require('./neural-context-stack.cjs'),Parent=require('./neural-progressive-action.cjs'),Projected=require('./neural-projected-frontier.cjs');
const DIMENSIONS=[521,64,64,2],atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
function createParent(loaded){
  const parent=Parent.create(loaded.parent),projected=Projected.create(loaded.data),owned=new WeakSet();
  return {
    action(obs){return projected.adjust(parent.action(obs),projected.observe(obs),loaded.data.weights);},
    reset(){parent.reset();projected.reset();},
    capture(){const state=Object.freeze({parent:parent.capture(),projected:projected.capture()});owned.add(state);return state;},
    restore(state){if(!owned.has(state))throw Error('Own actually observed parent memory required');parent.restore(state.parent);projected.restore(state.projected);}
  };
}
function createGate(basis){
  Stack.validateBasis(basis);let gate=0;const owned=new WeakSet();
  return {
    observe(obs){if(!Array.isArray(obs)||obs.length!==516||obs.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual bounded neuronal input required');for(const c of basis.centres)gate=Math.max(gate,Math.max(0,Math.min(1,Context.feature(obs,c,basis.scales))));return gate;},
    reset(){gate=0;},value:()=>gate,
    capture(){const state=Object.freeze({gate});owned.add(state);return state;},
    restore(state){if(!owned.has(state))throw Error('Own retained neuronal gate required');gate=state.gate;}
  };
}
function validateNormalization(normalization){
  if(!normalization||normalization.mean?.length!==521||normalization.deviation?.length!==521||normalization.mean.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||normalization.deviation.some(v=>!Number.isFinite(v)||v<.005||v>10)||normalization.clip!==10)throw Error('Bounded actual neuronal normalization required');
}
function normalize(raw,normalization){
  if(!Array.isArray(raw)||raw.length!==521||raw.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('521 actual bounded controller-state values required');
  const f=Math.fround;return raw.map((v,j)=>Math.max(-10,Math.min(10,f(f(f(v)-normalization.mean[j])/normalization.deviation[j]))));
}
function validateActor(actor){
  const finite=v=>Number.isFinite(v)&&Math.abs(v)<=1000;
  if(!actor||JSON.stringify(actor.dimensions)!==JSON.stringify(DIMENSIONS)||actor.layers?.length!==3)throw Error('Dedicated 521-64-64-2 numeric actor required');
  for(let k=0;k<3;k++){const l=actor.layers[k];if(l.activation!==(k<2?'relu':'tanh-unscale')||l.weights?.length!==DIMENSIONS[k+1]||l.bias?.length!==DIMENSIONS[k+1]||l.bias.some(v=>!finite(v))||l.weights.some(row=>!Array.isArray(row)||row.length!==DIMENSIONS[k]||row.some(v=>!finite(v))))throw Error('Finite bounded numeric residual coefficients required');}
}
function forward(actor,normalized){
  const f=Math.fround;let input=normalized;
  for(let k=0;k<3;k++){const l=actor.layers[k];input=l.weights.map((row,i)=>{let sum=l.bias[i];for(let j=0;j<row.length;j++)sum+=row[j]*input[j];sum=f(sum);return k<2?Math.max(0,sum):f(f(f(Math.tanh(sum))+1)-1);});}
  return input;
}
function compose(old,gate,residual){
  if(!Array.isArray(old)||old.length!==4||old.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||!Number.isFinite(gate)||gate<0||gate>1||!Array.isArray(residual)||residual.length!==2||residual.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded neuronal actions and observed gate required: '+JSON.stringify({old,gate,residual}));
  const action=old.slice();for(let k=0;k<2;k++)if(residual[k]!==0&&gate!==0)action[k+2]=Math.tanh(atanh(action[k+2])+gate*residual[k]*(k===0?1:2));return action;
}
module.exports={DIMENSIONS,createParent,createGate,validateNormalization,normalize,validateActor,forward,compose};
