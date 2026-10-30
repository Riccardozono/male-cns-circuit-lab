'use strict';
// Instantaneous actual-neuronal contexts: no retained max, route or clock.
const Context=require('./neural-context-readout.cjs'),Stack=require('./neural-context-stack.cjs'),Motor=require('./neural-command-residual.cjs');
function validate(basis,genes){Stack.validateBasis(basis);if(!Array.isArray(genes)||genes.length!==basis.centres.length*2||genes.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Bounded instantaneous neuronal coefficients required');}
function features(raw,basis){if(!Array.isArray(raw)||raw.length!==516||raw.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual neuronal/controller observation required');return basis.centres.map(c=>Context.feature(raw,c,basis.scales));}
function compose(parent,raw,basis,genes){validate(basis,genes);const f=features(raw,basis),sum=[0,0],norm=1/Math.sqrt(f.length);for(let i=0;i<f.length;i++)for(let j=0;j<2;j++)sum[j]+=f[i]*genes[2*i+j]*norm;return Motor.compose(parent,1,sum.map(Math.tanh));}
module.exports={validate,features,compose};
