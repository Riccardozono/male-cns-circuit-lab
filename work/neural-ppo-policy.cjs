'use strict';
// Continuous learned residual. Inputs are neural projections, parent motor
// commands and this policy's preceding residual, never geometry or rewards.
const Motor=require('./neural-command-residual.cjs');
const DIM=13;
function weights(w){if(!Array.isArray(w)||w.length!==DIM*2||w.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('26 finite bounded policy weights required');}
function features(neural,parent,previous){
  if(!Array.isArray(neural)||neural.length!==9||!Array.isArray(parent)||parent.length!==3||!Array.isArray(previous)||previous.length!==2)throw Error('Observed neuronal/controller features required');
  const x=neural.concat([parent[0],parent[1]-parent[2]],previous);
  if(x.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded actual features required');return x;
}
function mean(x,w){weights(w);if(!Array.isArray(x)||x.length!==DIM||x.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Bounded observed features required');const y=[0,0];for(let i=0;i<DIM;i++)for(let j=0;j<2;j++)y[j]+=x[i]*w[i*2+j];return y;}
function compose(parent,gate,action){if(!Array.isArray(action)||action.length!==2||action.some(v=>!Number.isFinite(v)))throw Error('Finite sampled latent action required');return Motor.compose(parent,gate,[Math.tanh(.2*action[0]),Math.tanh(action[1])]);}
module.exports={DIM,weights,features,mean,compose};
