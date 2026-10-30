'use strict';
// Artificial neuronal eligibility memory, not route/clock/body-state input.
const Instant=require('./neural-instant-context.cjs'),Motor=require('./neural-command-residual.cjs');
const DECAY=.98;
function create(basis){
 Instant.validate(basis,Array(basis.centres.length*2).fill(0));let values=Array(basis.centres.length).fill(0);const owned=new WeakSet();
 return {observe(raw){const f=Instant.features(raw,basis);values=values.map((v,i)=>Math.max(f[i],DECAY*v));return values.slice();},
  compose(parent,genes){Instant.validate(basis,genes);const sums=[0,0],norm=1/Math.sqrt(values.length);for(let i=0;i<values.length;i++)for(let j=0;j<2;j++)sums[j]+=values[i]*genes[2*i+j]*norm;return Motor.compose(parent,1,sums.map(Math.tanh));},
  values:()=>values.slice(),reset(){values.fill(0);},capture(){const state=Object.freeze({values:values.slice()});owned.add(state);return state;},restore(state){if(!owned.has(state))throw Error('Only own actual neuronal trace snapshot may be restored');values=state.values.slice();}};
}
module.exports={create,DECAY,validate:Instant.validate};
