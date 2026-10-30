'use strict';
// Artificial causal memory driven only by the current neuronal observation.
// No position, step index, route, desired action or reward input.
const Context=require('./neural-context-readout.cjs');
function create(basis){
  let retained=Array(basis.centres.length).fill(0);
  return {reset(){retained.fill(0);},observe(obs){for(let k=0;k<retained.length;k++)retained[k]=Math.max(retained[k],Context.feature(obs,basis.centres[k],basis.scales));return retained.slice();},snapshot:()=>retained.slice()};
}
function adjust(old,features,weights){
  if(weights.length!==features.length*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Bounded learned retained coefficients required');
  const norm=1/Math.sqrt(features.length),a=old.slice();for(let action=0;action<2;action++){const delta=features.reduce((s,f,k)=>s+f*weights[2*k+action]*norm,0);if(delta!==0)a[action+2]=Math.tanh(Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,a[action+2])))+delta);}return a;
}
module.exports={create,adjust};
