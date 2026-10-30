'use strict';
// Exact Float64 dense rate pass: keep each target's original addition order.
// Only the memory layout changes. Live weight values are refreshed per call.
const cache=new WeakMap();
function incoming(graph){
  let p=cache.get(graph);if(p&&p.edgeCount===graph.from.length&&p.n===graph.n)return p;
  const offsets=new Uint32Array(graph.n+1);for(const target of graph.to)offsets[target+1]++;for(let n=1;n<offsets.length;n++)offsets[n]+=offsets[n-1];
  const cursor=offsets.slice(0,graph.n),edges=new Uint32Array(graph.from.length);for(let e=0;e<graph.from.length;e++)edges[cursor[graph.to[e]]++]=e;
  p={n:graph.n,edgeCount:graph.from.length,offsets,edges,source:new Uint32Array(edges.length),scaled:new Float64Array(edges.length),groups:new Uint8Array(edges.length)};cache.set(graph,p);return p;
}
function pass(graph,brain,iterations,edgesEnabled,gains){
  const p=incoming(graph);
  if(edgesEnabled)for(let k=0;k<p.edges.length;k++){const e=p.edges[k],source=graph.from[e];p.source[k]=source;p.scaled[k]=.9*graph.weights[e];if(gains)p.groups[k]=graph.learning.groups[source];}
  for(let iter=0;iter<iterations;iter++){
    for(let target=0;target<graph.n;target++){
      let sum=brain.injection[target];if(edgesEnabled)for(let k=p.offsets[target];k<p.offsets[target+1];k++)sum+=p.scaled[k]*brain.activity[p.source[k]]*(gains?gains[p.groups[k]]:1);
      brain.sum[target]=sum;brain.next[target]=.45*brain.activity[target]+.55*Math.tanh(sum);
    }
    [brain.activity,brain.next]=[brain.next,brain.activity];
  }
}
function invalidate(graph){cache.delete(graph);}
function wrap(F,compute=pass){
  return {...F,neuralStep(graph,brain,genome,sensors,enabled=true,edgesEnabled=true,physicsGain=F.PHYSICS_ADAPTER_GAIN,launchBias=F.NEURAL_MOTOR_LAUNCH_BIAS){
    if(graph.full||!enabled||!(brain.sum instanceof Float64Array)||!(brain.activity instanceof Float64Array)||!(brain.next instanceof Float64Array))return F.neuralStep(graph,brain,genome,sensors,enabled,edgesEnabled,physicsGain,launchBias);
    const gains=genome.policyWeights?F.synapticGains(graph,genome):null;brain.injection.fill(0);graph.inputs.forEach((index,k)=>{brain.injection[index]=F.sensorDrive(graph,genome,sensors,k,physicsGain);});
    compute(graph,brain,graph.modelId==='v2'?2:4,edgesEnabled,gains);
    return !edgesEnabled&&genome.policyWeights?[0,0,0]:F.neuralOutputsFromBrain(graph,brain,genome,launchBias);
  }};
}
module.exports={pass,invalidate,wrap};
