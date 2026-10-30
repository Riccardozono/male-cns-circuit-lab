'use strict';
// Normalized Gaussian neuronal basis. No compact gate can silently remove
// all motor authority at an unseen state. No first-lap protection is implied.
const P=require('../.impeccable/review/neural-sacl/learned-prior-greedy-support-r2/support.json');
if(P.format!=='male-cns-neuronal-gaussian-support-v2')throw Error('Normalized neuronal support required');
const DIMENSION=642,COUNT=P.centres.length,COEFFICIENTS=2*COUNT;
function validate(w){if(!Array.isArray(w)||w.length!==COEFFICIENTS||w.some(v=>!Number.isFinite(v)||Math.abs(v)>4))throw Error('Sixteen finite bounded neuronal motor coefficients required');}
function features(x){
 if(!Array.isArray(x)||x.length!==DIMENSION||x.some(v=>!Number.isFinite(v)))throw Error('Actual642neuronal input required');
 const z=x.map((v,j)=>(v-P.normalizationCenter[j])/P.normalizationScale[j]*P.featureWeights[j]);
 const logits=P.centres.map((c,k)=>{let d=0;for(let j=0;j<DIMENSION;j++){const e=z[j]-c[j];d+=e*e;}return -.5*d/(P.radii[k]*P.radii[k]);}),peak=Math.max(...logits),h=logits.map(v=>Math.exp(v-peak)),sum=h.reduce((a,b)=>a+b,0);return h.map(v=>v/sum);
}
function mean(x,w){validate(w);const h=features(x),y=[x[640],x[641]];for(let k=0;k<COUNT;k++){y[0]+=.5*h[k]*w[2*k];y[1]+=h[k]*w[2*k+1];}return y;}
module.exports={features,mean,validate,DIMENSION,COUNT,COEFFICIENTS,initialWeights:()=>Array(COEFFICIENTS).fill(0)};
