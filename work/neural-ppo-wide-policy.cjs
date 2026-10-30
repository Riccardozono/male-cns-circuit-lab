'use strict';
// Full observed neuronal history, not the8component PCA bottleneck. The parent
// still runs its proven neural controller. No raw sensors/geometry/teacher.
const Motor=require('./neural-command-residual.cjs');
const DIM=520,HIDDEN=64,COUNT=DIM*HIDDEN+HIDDEN+HIDDEN*2+2;
function weights(w){if(!Array.isArray(w)||w.length!==COUNT||w.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('33474 finite bounded MLP parameters required');}
function features(raw,parent,previous){if(!Array.isArray(raw)||raw.length!==516||!Array.isArray(parent)||parent.length!==3||!Array.isArray(previous)||previous.length!==2)throw Error('Actual observed neuronal history and controller context required');const x=raw.concat([parent[0],parent[1]-parent[2]],previous);if(x.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Actual bounded neural features required');return x;}
function mean(x,w){weights(w);if(!Array.isArray(x)||x.length!==DIM||x.some(v=>!Number.isFinite(v)||Math.abs(v)>1))throw Error('Observed520bounded neural/controller inputs required');const hidden=Array.from({length:HIDDEN},(_,j)=>w[DIM*HIDDEN+j]);for(let i=0;i<DIM;i++)for(let j=0;j<HIDDEN;j++)hidden[j]+=x[i]*w[i*HIDDEN+j];for(let j=0;j<HIDDEN;j++)hidden[j]=Math.tanh(hidden[j]);const offset=DIM*HIDDEN+HIDDEN,y=[w[COUNT-2],w[COUNT-1]];for(let i=0;i<HIDDEN;i++)for(let j=0;j<2;j++)y[j]+=hidden[i]*w[offset+i*2+j];return y;}
function compose(parent,gate,action){if(!Array.isArray(action)||action.length!==2||action.some(v=>!Number.isFinite(v)))throw Error('Finite sampled latent action required');return Motor.compose(parent,gate,[Math.tanh(.2*action[0]),Math.tanh(action[1])]);}
module.exports={DIM,HIDDEN,COUNT,weights,features,mean,compose};
