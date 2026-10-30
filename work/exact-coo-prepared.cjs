'use strict';
// Original COO arithmetic/order; only unchanged weight/gain preparation is
// reused. Live from/to arrays remain live. Exact byte checks catch mutations.
const Original=require('./exact-coo.cjs'),nativeTanh=Math.tanh;
let cache=new WeakMap(),counts={calls:0,weightRefreshes:0,gainRefreshes:0,fallbacks:0};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),same=(a,b)=>a.length===b.length&&a.equals(b);
function pass(graph,brain,iterations,edgesEnabled,gains){
  counts.calls++;
  const from=graph.from,to=graph.to,weights=graph.weights,n=graph.n;
  if(edgesEnabled!==true||Math.tanh!==nativeTanh||!(from instanceof Uint32Array)||!(to instanceof Uint32Array)||!(weights instanceof Float64Array)||from.length!==to.length||from.length!==weights.length
      ||(gains&&(!(gains instanceof Float32Array)&&!(gains instanceof Float64Array)||!(graph.learning?.groups instanceof Uint8Array)))){
    counts.fallbacks++;return Original.pass(graph,brain,iterations,edgesEnabled,gains);
  }
  let p=cache.get(graph);if(!p||p.scaled.length!==weights.length||p.gain.length!==n){p={scaled:new Float64Array(weights.length),gain:new Float64Array(n),weights:null,gains:null,groups:null};cache.set(graph,p);}
  const weightBytes=bytes(weights);
  if(!p.weights||!same(weightBytes,p.weights)){for(let e=0;e<weights.length;e++)p.scaled[e]=.9*weights[e];p.weights=Buffer.from(weightBytes);counts.weightRefreshes++;}
  if(gains){const gainBytes=bytes(gains),groupBytes=bytes(graph.learning.groups),gainKind=gains instanceof Float32Array?'f32':'f64';
    if(!p.gains||!p.groups||p.gainKind!==gainKind||!same(gainBytes,p.gains)||!same(groupBytes,p.groups)){
      for(let i=0;i<n;i++)p.gain[i]=gains[graph.learning.groups[i]];
      p.gains=Buffer.from(gainBytes);p.groups=Buffer.from(groupBytes);p.gainKind=gainKind;counts.gainRefreshes++;
    }
  }
  const scaled=p.scaled,sourceGain=p.gain,sum=brain.sum,injection=brain.injection;
  for(let iter=0;iter<iterations;iter++){
    const activity=brain.activity,next=brain.next;sum.set(injection);
    if(gains){for(let e=0;e<from.length;e++){const source=from[e];sum[to[e]]+=scaled[e]*activity[source]*sourceGain[source];}}
    else for(let e=0;e<from.length;e++){const source=from[e];sum[to[e]]+=scaled[e]*activity[source]*1;}
    for(let i=0;i<n;i++)next[i]=.45*activity[i]+.55*Math.tanh(sum[i]);[brain.activity,brain.next]=[next,activity];
  }
}
function stats(){return {...counts};}
function reset(){cache=new WeakMap();counts={calls:0,weightRefreshes:0,gainRefreshes:0,fallbacks:0};}
module.exports={pass,stats,reset};
