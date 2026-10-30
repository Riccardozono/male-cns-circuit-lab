'use strict';
// Zero-centred exploration. Variance reads real neural features only; the AR
// conditional uses previous sampled latent actions, not position or a clock.
function validate(c,n){
  if(!c||!Array.isArray(c.direction)||c.direction.length!==n+1||c.direction.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)||
    !Number.isFinite(c.threshold)||c.threshold<=-1||c.threshold>=1||!Number.isFinite(c.rho)||c.rho<0||c.rho>.98||
    !Array.isArray(c.floor)||!Array.isArray(c.ceiling)||c.floor.length!==2||c.ceiling.length!==2||
    c.floor.some((v,a)=>!Number.isFinite(v)||v<1e-6||!Number.isFinite(c.ceiling[a])||v>c.ceiling[a]||c.ceiling[a]>.5))throw Error('Bounded neural exploration required');
  return c;
}
function scale(features,c){
  let response=c.direction.at(-1);const norm=1/Math.sqrt(features.length);
  for(let j=0;j<features.length;j++)response+=features[j]*norm*c.direction[j];
  let gate=Math.max(0,Math.min(1,(response-c.threshold)/(1-c.threshold)));gate=gate*gate*(3-2*gate);
  return {response,gate,sigma:c.floor.map((v,a)=>v+(c.ceiling[a]-v)*gate)};
}
function conditional(mean,sigma,previous,rho){
  if(!previous||!rho)return {mean:mean.slice(),std:sigma.slice()};
  return {mean:mean.map((v,a)=>v+rho*sigma[a]*(previous.action[a]-previous.mean[a])/previous.sigma[a]),
    std:sigma.map(v=>v*Math.sqrt(1-rho*rho))};
}
function logp(action,mean,std){return action.reduce((s,v,a)=>s-.5*((v-mean[a])/std[a])**2-Math.log(std[a])-.5*Math.log(2*Math.PI),0);}
function kl(oldMean,oldStd,newMean,newStd){return oldMean.reduce((s,v,a)=>s+Math.max(0,Math.log(newStd[a]/oldStd[a])+
  (oldStd[a]**2+(v-newMean[a])**2)/(2*newStd[a]**2)-.5),0);}
module.exports={validate,scale,conditional,logp,kl};
