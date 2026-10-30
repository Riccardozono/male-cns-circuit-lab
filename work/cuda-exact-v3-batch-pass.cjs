'use strict';
// Use the existing qualified kernel's batch parameter with independent states.
const {CudaPass}=require('./cuda-exact-v3-pass.cjs');
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),nativeTanh=Math.tanh;
class BatchCudaPass extends CudaPass{
  constructor(){super();this.batchGraphs=new WeakMap();this.counts.batchCalls=0;this.counts.batchAgentSteps=0;}
  batchGraph(graph){
    const n=graph.n,parts=[graph.from,graph.to,graph.weights].map(bytes);let s=this.batchGraphs.get(graph);
    if(s&&parts.every((p,i)=>p.equals(s.parts[i])))return s;
    if(s)for(const address of s.owned)this.release(address);
    const offsets=new Uint32Array(n+1);
    for(let e=0;e<graph.from.length;e++){if(graph.from[e]>=n||graph.to[e]>=n||!Number.isFinite(graph.weights[e]))throw Error('Invalid actual graph');offsets[graph.to[e]+1]++;}
    for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
    const cursor=offsets.slice(0,n),sources=new Uint32Array(graph.from.length),scaled=new Float64Array(graph.weights.length);
    for(let e=0;e<graph.from.length;e++){const k=cursor[graph.to[e]]++;sources[k]=graph.from[e];scaled[k]=.9*graph.weights[e];}
    const capacity=100,size=n*capacity,stride=BigInt(size*8),owned=[this.alloc(offsets.byteLength),this.alloc(sources.byteLength),this.alloc(scaled.byteLength),this.alloc(size*8*5)];
    const base=owned[3],device={offsets:owned[0],sources:owned[1],scaled:owned[2],injection:base,a:base+stride,b:base+2n*stride,gains:base+3n*stride,sum:base+4n*stride};
    this.upload(device.offsets,offsets);this.upload(device.sources,sources);this.upload(device.scaled,scaled);
    s={n,capacity,owned,device,parts:parts.map(p=>Buffer.from(p)),injection:new Float64Array(size),a:new Float64Array(size),b:new Float64Array(size),gains:new Float64Array(size),sum:new Float64Array(size)};
    this.batchGraphs.set(graph,s);this.counts.graphUploads++;return s;
  }
  passMany(graph,brains,iterations,gains){
    const n=graph.n,count=brains.length;
    if(!count)return;
    if(count>100||Math.tanh!==nativeTanh||n!==this.manifest.nTested||graph.from.length!==this.manifest.edgesTested||!(graph.from instanceof Uint32Array)||!(graph.to instanceof Uint32Array)||!(graph.weights instanceof Float64Array)||!Number.isInteger(iterations)||iterations<1||iterations>8||gains.length!==count)throw Error('Unsupported exact V3 batch');
    const arrays=brains.flatMap(b=>['activity','next','sum','injection'].map(k=>b[k]));
    if(!arrays.every(a=>a instanceof Float64Array&&a.length===n)||new Set(arrays.map(a=>a.buffer)).size!==arrays.length)throw Error('Independent full Float64 brain arrays required');
    this.current();const s=this.batchGraph(graph),d=s.device,span=n*count;
    for(let c=0;c<count;c++){
      const offset=c*n,b=brains[c];s.injection.set(b.injection,offset);s.a.set(b.activity,offset);s.b.set(b.next,offset);
      for(let i=0;i<n;i++){const value=gains[c]?gains[c][graph.learning.groups[i]]:1;if(!Number.isFinite(value))throw Error('Finite actual gains required');s.gains[offset+i]=value;}
    }
    this.upload(d.injection,s.injection.subarray(0,span));this.upload(d.a,s.a.subarray(0,span));this.upload(d.b,s.b.subarray(0,span));this.upload(d.gains,s.gains.subarray(0,span));
    const pointer=v=>{const b=Buffer.allocUnsafe(8);b.writeBigUInt64LE(v);return b;},integer=v=>{const b=Buffer.allocUnsafe(4);b.writeInt32LE(v);return b;};
    let a=d.a,b=d.b;
    for(let i=0;i<iterations;i++){
      const params=[d.offsets,d.sources,d.scaled,d.injection,a,d.gains,b,d.sum].map(pointer).concat([integer(n),integer(count)]);
      this.check(this.api.launch(this.function,Math.ceil(span/128),1,1,128,1,1,0,null,params,null),'cuLaunchKernel batch');this.counts.kernelLaunches++;[a,b]=[b,a];
    }
    this.download(s.a.subarray(0,span),a);this.download(s.b.subarray(0,span),b);this.download(s.sum.subarray(0,span),d.sum);
    for(let c=0;c<count;c++){
      const brain=brains[c],start=c*n,end=start+n;if(iterations%2)[brain.activity,brain.next]=[brain.next,brain.activity];
      brain.activity.set(s.a.subarray(start,end));brain.next.set(s.b.subarray(start,end));brain.sum.set(s.sum.subarray(start,end));
    }
    this.counts.calls+=count;this.counts.gpuCalls+=count;this.counts.batchCalls++;this.counts.batchAgentSteps+=count;
  }
  identity(){return {...super.identity(),revision:'cuda-exact-v3-batch-driver-v1',batchCapacity:100};}
}
module.exports={BatchCudaPass};
