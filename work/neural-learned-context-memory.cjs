'use strict';
// Learned artificial eligibility memory driven ONLY by actual neuronal input.
const Instant=require('./neural-instant-context.cjs'),Motor=require('./neural-command-residual.cjs');
function validate(basis,genes){Instant.validate(basis,genes.slice(0,6));if(basis.centres.length!==3||!Array.isArray(genes)||genes.length!==9||genes.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Six motor and three bounded retention parameters required');}
const decays=genes=>genes.slice(6).map(v=>-Math.expm1(-Math.max(0,v)));
function create(basis){
 Instant.validate(basis,Array(6).fill(0));if(basis.centres.length!==3)throw Error('Three neuronal contexts required');
 let values=[0,0,0],features=null;const owned=new WeakSet();
 return {observe(raw,genes){validate(basis,genes);features=Instant.features(raw,basis);const d=decays(genes);values=values.map((v,i)=>Math.max(features[i],d[i]*v));return values.slice();},
 compose(parent,genes){validate(basis,genes);if(!features)throw Error('Observe actual neurons first');const sums=[0,0],norm=1/Math.sqrt(3);for(let i=0;i<3;i++)for(let j=0;j<2;j++)sums[j]+=values[i]*genes[2*i+j]*norm;return Motor.compose(parent,1,sums.map(Math.tanh));},
 values:()=>values.slice(),reset(){values=[0,0,0];features=null;},capture(){if(!features)throw Error('Capture requires actual observation');const s={values:values.slice(),features:features.slice()};owned.add(s);return s;},restore(s){if(!owned.has(s))throw Error('Only own reached neuronal memory allowed');values=s.values.slice();features=s.features.slice();}};
}
module.exports={create,validate,decays};
