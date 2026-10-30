'use strict';
// Stable incoming-edge layout: each target receives additions in precisely
// the original COO order. Byte comparisons invalidate any in-place changes.
// No action/episode cache, approximation, synapse removal or gain rounding.
const Exact=require('./exact-coo.cjs'),nativeTanh=Math.tanh;
let cache=new WeakMap(),counts={calls:0,builds:0,refreshes:0,fallbacks:0};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),same=(a,b)=>a.length===b.length&&a.equals(b);
function pass(graph,brain,iterations,edgesEnabled,gains){
  counts.calls++;
  const n=graph.n,arrays=['activity','next','sum','injection'].map(k=>brain[k]),from=graph.from,to=graph.to,w=graph.weights;
  const suitable=edgesEnabled===true&&Math.tanh===nativeTanh&&Number.isInteger(n)&&n>0&&Number.isInteger(iterations)&&iterations>0&&iterations<=8
    &&from instanceof Uint32Array&&to instanceof Uint32Array&&w instanceof Float64Array&&from.length===to.length&&from.length===w.length
    &&(!gains||graph.learning?.groups instanceof Uint8Array)&&arrays.every(a=>a instanceof Float64Array&&a.length===n)&&new Set(arrays.map(a=>a.buffer)).size===4;
  if(!suitable){counts.fallbacks++;return Exact.pass(graph,brain,iterations,edgesEnabled,gains);}
  const fBytes=bytes(from),tBytes=bytes(to),wBytes=bytes(w);let p=cache.get(graph);
  if(!p||p.n!==n||!same(fBytes,p.from)||!same(tBytes,p.to)){
    const offsets=new Uint32Array(n+1);
    for(let e=0;e<from.length;e++){if(from[e]>=n||to[e]>=n){counts.fallbacks++;return Exact.pass(graph,brain,iterations,edgesEnabled,gains);}offsets[to[e]+1]++;}
    for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
    const cursor=offsets.slice(0,n),order=new Uint32Array(from.length),source=new Uint32Array(from.length);
    for(let e=0;e<from.length;e++){const k=cursor[to[e]]++;order[k]=e;source[k]=from[e];}
    p={n,from:Buffer.from(fBytes),to:Buffer.from(tBytes),offsets,order,source,scaled:new Float64Array(w.length),weights:null,groups:null,gains:null,sourceGain:new Float64Array(n)};
    cache.set(graph,p);counts.builds++;
  }
  if(!p.weights||!same(wBytes,p.weights)){
    for(let k=0;k<p.order.length;k++)p.scaled[k]=.9*w[p.order[k]];
    p.weights=Buffer.from(wBytes);counts.refreshes++;
  }
  if(gains){
    const groupBytes=bytes(graph.learning.groups),gainBytes=bytes(Float64Array.from(gains));
    if(!p.groups||!p.gains||!same(groupBytes,p.groups)||!same(gainBytes,p.gains)){
      for(let i=0;i<n;i++)p.sourceGain[i]=gains[graph.learning.groups[i]];
      p.groups=Buffer.from(groupBytes);p.gains=Buffer.from(gainBytes);counts.refreshes++;
    }
  }
  const {offsets,source,scaled,sourceGain}=p;
  for(let iter=0;iter<iterations;iter++){
    const activity=brain.activity,next=brain.next,sum=brain.sum,injection=brain.injection;
    for(let target=0;target<n;target++){
      let value=injection[target];
      if(gains)for(let k=offsets[target];k<offsets[target+1];k++)value+=scaled[k]*activity[source[k]]*sourceGain[source[k]];
      else for(let k=offsets[target];k<offsets[target+1];k++)value+=scaled[k]*activity[source[k]]*1;
      sum[target]=value;next[target]=.45*activity[target]+.55*Math.tanh(value);
    }
    [brain.activity,brain.next]=[next,activity];
  }
}
function stats(){return {...counts};}
function reset(){cache=new WeakMap();counts={calls:0,builds:0,refreshes:0,fallbacks:0};}
module.exports={pass,stats,reset};
