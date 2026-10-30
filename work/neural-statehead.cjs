'use strict';
// State-dependent learned correction, unlike a retained constant motor offset.
// Inputs are the actual516neuronal/controller values. PCA axes are unsupervised
// descriptions of recorded activity, never desired steering/braking labels.
const Projected=require('./neural-projected-frontier.cjs'),R=require('./neural-projected-residual.cjs'),Motor=require('./neural-command-residual.cjs');
function weights(x){if(!Array.isArray(x)||x.length!==18||x.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Eighteen bounded state-head coefficients required');}
function create(data){
  Projected.validate(data);const p=data.projection,gate=R.createGate(data.basis),owned=new WeakSet();let features=null;
  function observe(raw){
    if(!Array.isArray(raw)||raw.length!==516||raw.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual bounded neuronal input required');gate.observe(raw);
    const normalized=p.mean.map((m,j)=>(raw[j]-m)/p.scales[j]);features=[1,...p.components.map((r,k)=>Math.tanh(r.reduce((s,v,j)=>s+v*normalized[j],0)/p.componentStd[k]))];return features.slice();
  }
  function compose(prior,genes){weights(genes);if(!features)throw Error('Actually observed neuronal state required');const drive=[0,1].map(a=>features.reduce((s,f,k)=>s+f*genes[k*2+a],0)/3);return Motor.compose(prior,gate.value(),[Math.tanh(.2*drive[0]),Math.tanh(drive[1])]);}
  return {observe,compose,reset(){gate.reset();features=null;},value:()=>gate.value(),features:()=>features?.slice()||null,
    capture(){if(!features)throw Error('Actual observed context required');const state={gate:gate.capture(),features:features.slice()};owned.add(state);return state;},
    restore(state){if(!owned.has(state))throw Error('Only own actually captured neuronal state allowed');gate.restore(state.gate);features=state.features.slice();}};
}
module.exports={create,weights};
