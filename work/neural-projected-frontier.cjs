'use strict';
const Stack=require('./neural-context-stack.cjs'),Context=require('./neural-context-readout.cjs');
function validate(data){
  Stack.validateBasis(data.basis);const p=data.projection;
  if(!p||p.mean?.length!==516||p.scales?.length!==516||p.components?.length!==8||p.componentStd?.length!==8||p.mean.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||p.scales.some(v=>!Number.isFinite(v)||v<=0)||p.componentStd.some(v=>!Number.isFinite(v)||v<.05)||p.components.some(r=>r.length!==516||r.some(v=>!Number.isFinite(v)||Math.abs(v)>1)||Math.abs(r.reduce((s,v)=>s+v*v,0)-1)>1e-6))throw Error('Eight bounded neuronal projection axes required');
}
function create(data){
  validate(data);const p=data.projection,owned=new WeakSet();let gate=0;
  function observe(obs){
    if(obs.length!==516||obs.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual bounded neuronal input required');
    for(const c of data.basis.centres)gate=Math.max(gate,Context.feature(obs,c,data.basis.scales));
    const normalized=p.mean.map((m,j)=>(obs[j]-m)/p.scales[j]);return [1,...p.components.map((r,k)=>Math.tanh(r.reduce((s,v,j)=>s+v*normalized[j],0)/p.componentStd[k]))];
  }
  function adjust(old,features,weights){
    if(weights.length!==18||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Eighteen bounded learned coefficients required');
    const a=old.slice(),norm=1/3;for(let action=0;action<2;action++){const d=features.reduce((s,f,k)=>s+f*weights[k*2+action]*norm,0)*gate;if(d!==0)a[action+2]=Math.tanh(Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,a[action+2])))+d);}return a;
  }
  return {observe,adjust,reset:()=>{gate=0;},capture(){const state=Object.freeze({gate});owned.add(state);return state;},restore(s){if(!owned.has(s))throw Error('Own observed neural gate required');gate=s.gate;}};
}
module.exports={validate,create};
