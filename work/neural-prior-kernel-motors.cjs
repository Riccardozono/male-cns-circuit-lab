'use strict';
// An unsupervised neuronal basis, fitted to real observations, not a route.
const P=require('./neural-prior-local-support.cjs').parameters;
const DIMENSION=642,COUNT=P.centres.length,COEFFICIENTS=2*COUNT;
function validate(w){if(!Array.isArray(w)||w.length!==COEFFICIENTS||w.some(v=>!Number.isFinite(v)||Math.abs(v)>4))throw Error('Sixteen finite bounded neuronal motor coefficients required');}
function features(x){
 if(!Array.isArray(x)||x.length!==DIMENSION||x.some(v=>!Number.isFinite(v)))throw Error('Actual642neuronal input required');
 const z=x.map((v,j)=>(v-P.normalizationCenter[j])/P.normalizationScale[j]*P.featureWeights[j]);
 return P.centres.map((c,k)=>{let d=0;for(let j=0;j<DIMENSION;j++){const e=z[j]-c[j];d+=e*e;}const q=Math.sqrt(d)/P.radii[k];return q<1?(1-q)**4*(4*q+1):0;});
}
function mean(x,w){validate(w);const h=features(x),y=[x[640],x[641]];for(let k=0;k<COUNT;k++){y[0]+=.2*h[k]*w[2*k];y[1]+=h[k]*w[2*k+1];}return y;}
module.exports={features,mean,validate,DIMENSION,COUNT,COEFFICIENTS,initialWeights:()=>Array(COEFFICIENTS).fill(0)};
