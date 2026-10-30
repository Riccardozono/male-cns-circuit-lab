'use strict';
// Compact, observation-only motor features. No body, route or clock inputs.
const Head=require('./neural-json-head.cjs');
function distance(a,b,scales){
  let sum=0;for(let i=0;i<a.length;i++){const d=(a[i]-b[i])/scales[i];sum+=d*d;}
  return Math.sqrt(sum/a.length);
}
function feature(obs,centre,scales){
  const d=distance(obs,centre.values,scales)/centre.radius;
  return d>=1?0:(1-d)**4*(4*d+1);
}
function grow(observations,{limit=6,protectedFraction=.8}={}){
  if(!Array.isArray(observations)||observations.length<100||!Number.isInteger(limit)||limit<1||limit>12||protectedFraction<.5||protectedFraction>=.95)throw Error('Actual observations and bounded growth settings required');
  const n=516;
  if(observations.some(row=>!Array.isArray(row)||row.length!==n||row.some(v=>!Number.isFinite(v)||Math.abs(v)>1)))throw Error('Bounded real neuronal observations required');
  const mean=Array.from({length:n},(_,j)=>observations.reduce((s,row)=>s+row[j],0)/observations.length);
  const scales=mean.map((m,j)=>Math.max(.02,Math.sqrt(observations.reduce((s,row)=>s+(row[j]-m)**2,0)/observations.length)));
  const protectedCount=Math.floor(observations.length*protectedFraction),prefix=observations.slice(0,protectedCount),late=observations.slice(protectedCount),centres=[];
  while(centres.length<limit){
    let selected=null,largest=.0001;
    for(const row of late){
      const early=Math.min(...prefix.map(p=>distance(row,p,scales)));
      const novelty=Math.min(early,...centres.map(c=>distance(row,c.values,scales)));
      if(novelty>largest){largest=novelty;selected={row,early};}
    }
    if(!selected)break;
    centres.push({values:selected.row.slice(),radius:selected.early*.75});
  }
  if(!centres.length)throw Error('No distinct actual late neural context');
  if(prefix.some(row=>centres.some(c=>feature(row,c,scales)!==0)))throw Error('New context does not preserve the observed prefix');
  return {centres,scales,protectedCount,sourceObservationCount:observations.length};
}
function action(head,obs,basis,weights){
  if(weights.length!==basis.centres.length*2||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>8))throw Error('Invalid context motor weights');
  const old=Head.action(head,obs),features=basis.centres.map(c=>feature(obs,c,basis.scales));
  const norm=1/Math.sqrt(basis.centres.length),atanh=v=>Math.atanh(Math.max(-1+1e-12,Math.min(1-1e-12,v)));
  for(let a=0;a<2;a++){
    const delta=features.reduce((s,f,k)=>s+f*weights[k*2+a]*norm,0);
    if(delta!==0)old[a+2]=Math.tanh(atanh(old[a+2])+delta);
  }
  return old;
}
module.exports={distance,feature,grow,action};
