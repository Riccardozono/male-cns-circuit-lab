'use strict';
// Frozen parent decoder, including all causal memories. Only neuronal input.
const Stack=require('./neural-context-stack.cjs'),Context=require('./neural-context-readout.cjs'),Retained=require('./neural-retained-features.cjs');
const atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
function create(loaded){
  const parent=loaded.parent,p=parent.data.projection,stages=loaded.data.stages,owned=new WeakSet();let peak,retained;
  function reset(){peak=0;retained=stages.map(s=>Array(s.basis.centres.length).fill(0));}reset();
  function action(obs){
    if(obs.length!==516||obs.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual bounded neuronal observation required');
    for(const c of parent.data.basis.centres)peak=Math.max(peak,Context.feature(obs,c,parent.data.basis.scales));
    let a=Stack.action(parent.model,obs);const normalized=p.mean.map((m,j)=>(obs[j]-m)/p.scales[j]),f=[1,...p.components.map((r,k)=>Math.tanh(r.reduce((sum,v,j)=>sum+v*normalized[j],0)/p.componentStd[k]))];
    const residual=[0,1].map(k=>Math.tanh(f.reduce((sum,v,j)=>sum+v*parent.data.weights[2*j+k],0)));
    for(let k=0;k<2;k++)if(peak!==0&&residual[k]!==0)a[k+2]=Math.tanh(atanh(a[k+2])+peak*residual[k]*(k===0?1:2));
    for(let i=0;i<stages.length;i++){
      const s=stages[i];if(s.retention==='peak'){for(let k=0;k<retained[i].length;k++)retained[i][k]=Math.max(retained[i][k],Context.feature(obs,s.basis.centres[k],s.basis.scales));a=Retained.adjust(a,retained[i],s.weights);}else a=Stack.adjust(a,obs,s.basis,s.weights);
    }
    return a;
  }
  function capture(){const state=Object.freeze({peak,retained:Object.freeze(retained.map(r=>Object.freeze(r.slice())))});owned.add(state);return state;}
  function restore(state){if(!owned.has(state))throw Error('Only an actually captured parent memory can be restored');peak=state.peak;retained=state.retained.map(r=>r.slice());}
  return {action,reset,capture,restore};
}
module.exports={create};
