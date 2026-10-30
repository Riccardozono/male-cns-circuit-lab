'use strict';
// Research-only variance readout. No geometry, clock, desired action or gate.
const AR=require('./neural-exploration-ar1.cjs');
function validate(c,n){
  if(!c||c.format!=='learned-neural-log-sigma-v1'||!Number.isFinite(c.rho)||c.rho<0||c.rho>.98||
    !Array.isArray(c.weights)||c.weights.length!==2*n+2||c.weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8)||
    !['floor','ceiling','initial'].every(k=>Array.isArray(c[k])&&c[k].length===2)||
    c.floor.some((v,a)=>!Number.isFinite(v)||v<1e-6||!Number.isFinite(c.ceiling[a])||c.ceiling[a]>.5||
      !Number.isFinite(c.initial[a])||v>=c.initial[a]||c.initial[a]>=c.ceiling[a]))throw Error('Bounded learned neural variance required');
  return c;
}
function create(n=64){return {format:'learned-neural-log-sigma-v1',rho:.9,floor:[.0001,.005],ceiling:[.08,.5],initial:[.0015,.04],weights:Array(2*n+2).fill(0)};}
function scale(features,c){
  const response=c.weights.slice(-2),norm=1/Math.sqrt(features.length);
  for(let j=0;j<features.length;j++)for(let a=0;a<2;a++)response[a]+=features[j]*norm*c.weights[2*j+a];
  const sigma=response.map((r,a)=>{const low=Math.log(c.floor[a]),high=Math.log(c.ceiling[a]),fraction=(Math.log(c.initial[a])-low)/(high-low),
    offset=Math.log(fraction/(1-fraction));return Math.exp(low+(high-low)/(1+Math.exp(-r-offset)));});
  return {response,sigma,gate:null};
}
function sameFamily(a,b){return ['format','rho','floor','ceiling','initial'].every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));}
module.exports={validate,create,scale,sameFamily,conditional:AR.conditional,logp:AR.logp,kl:AR.kl};
