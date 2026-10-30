/* Exact Float64 CPU pass. Edge order, rate dynamics and live weights unchanged. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MaleCNSDense=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';const cache=new WeakMap();
  function step(graph,brain,iterations,edgesEnabled,gains){
    const from=graph.from,to=graph.to,weights=graph.weights,n=graph.n;let p=cache.get(graph);
    if(!p||p.scaled.length!==weights.length||p.gain.length!==n){p={scaled:new Float64Array(weights.length),gain:new Float64Array(n)};cache.set(graph,p);}
    if(edgesEnabled){for(let e=0;e<weights.length;e++)p.scaled[e]=.9*weights[e];if(gains){const groups=graph.learning.groups;for(let i=0;i<n;i++)p.gain[i]=gains[groups[i]];}}
    const scaled=p.scaled,sourceGain=p.gain,sum=brain.sum,injection=brain.injection;
    for(let iter=0;iter<iterations;iter++){
      const activity=brain.activity,next=brain.next;sum.set(injection);
      if(edgesEnabled){if(gains){for(let e=0;e<from.length;e++){const source=from[e];sum[to[e]]+=scaled[e]*activity[source]*sourceGain[source];}}
        else for(let e=0;e<from.length;e++){const source=from[e];sum[to[e]]+=scaled[e]*activity[source]*1;}}
      for(let i=0;i<n;i++)next[i]=.45*activity[i]+.55*Math.tanh(sum[i]);[brain.activity,brain.next]=[next,activity];
    }
  }
  return {step};
});
