'use strict';
// Same proven CUDA arithmetic. Pack per-control vectors into one host->device
// and one device->host copy, not a change in neurons/actions or a fake batch.
const fs=require('node:fs'),I=require('./neural-research-source-identity.cjs'),{CudaPass}=require('./cuda-exact-v3-pass.cjs'),Original=require('./exact-coo.cjs'),nativeTanh=Math.tanh;
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),same=(a,b)=>a.length===b.length&&a.equals(b);
class PackedCudaPass extends CudaPass {
  constructor(){super();this.counts.hostToDeviceCopies=0;this.counts.deviceToHostCopies=0;}
  upload(address,data){super.upload(address,data);this.counts.hostToDeviceCopies++;}
  download(data,address){super.download(data,address);this.counts.deviceToHostCopies++;}
  graph(graph){
    const n=graph.n,from=graph.from,to=graph.to,weights=graph.weights,parts=[from,to,weights].map(bytes);let s=this.graphs.get(graph);
    if(s&&s.n===n&&parts.every((b,i)=>same(b,s.parts[i])))return s;
    if(s)for(const address of s.owned)this.release(address);
    const offsets=new Uint32Array(n+1);for(let e=0;e<from.length;e++){if(from[e]>=n||to[e]>=n||!Number.isFinite(weights[e]))throw Error('Invalid actual graph');offsets[to[e]+1]++;}for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
    const cursor=offsets.slice(0,n),sources=new Uint32Array(from.length),scaled=new Float64Array(weights.length);for(let e=0;e<from.length;e++){const k=cursor[to[e]]++;sources[k]=from[e];scaled[k]=.9*weights[e];}
    const owned=[this.alloc(offsets.byteLength),this.alloc(sources.byteLength),this.alloc(scaled.byteLength),this.alloc(n*8*5)],stride=BigInt(n*8),state=owned[3];
    const device={offsets:owned[0],sources:owned[1],scaled:owned[2],injection:state,gains:state+stride,a:state+2n*stride,b:state+3n*stride,sum:state+4n*stride};
    this.upload(device.offsets,offsets);this.upload(device.sources,sources);this.upload(device.scaled,scaled);
    s={n,owned,device,parts:parts.map(b=>Buffer.from(b)),input:new Float64Array(n*4),output:new Float64Array(n*3)};this.graphs.set(graph,s);this.counts.graphUploads++;return s;
  }
  pass(graph,brain,iterations,edgesEnabled,gains){
    this.counts.calls++;
    const n=graph.n,arrays=['activity','next','sum','injection'].map(k=>brain[k]);
    const suitable=edgesEnabled===true&&Math.tanh===nativeTanh&&n===this.manifest.nTested&&graph.from instanceof Uint32Array&&graph.to instanceof Uint32Array&&graph.weights instanceof Float64Array&&graph.from.length===this.manifest.edgesTested&&graph.to.length===graph.from.length&&graph.weights.length===graph.from.length&&arrays.every(a=>a instanceof Float64Array&&a.length===n)&&new Set(arrays.map(a=>a.buffer)).size===4&&Number.isInteger(iterations)&&iterations>0&&iterations<=8&&(!gains||graph.learning?.groups instanceof Uint8Array);
    if(!suitable){this.counts.cpuFallbacks++;return Original.pass(graph,brain,iterations,edgesEnabled,gains);}
    this.current();const s=this.graph(graph),d=s.device;
    s.input.set(brain.injection,0);s.input.set(brain.activity,n*2);s.input.set(brain.next,n*3);
    for(let i=0;i<n;i++){const g=gains?gains[graph.learning.groups[i]]:1;if(!Number.isFinite(g))throw Error('Finite actual gains required');s.input[n+i]=g;}
    this.upload(d.injection,s.input);
    let a=d.a,b=d.b;const pointer=v=>{const x=Buffer.allocUnsafe(8);x.writeBigUInt64LE(v);return x;},integer=v=>{const x=Buffer.allocUnsafe(4);x.writeInt32LE(v);return x;};
    for(let i=0;i<iterations;i++){
      const parameters=[d.offsets,d.sources,d.scaled,d.injection,a,d.gains,b,d.sum].map(pointer).concat([integer(n),integer(1)]);
      this.check(this.api.launch(this.function,Math.ceil(n/128),1,1,128,1,1,0,null,parameters,null),'cuLaunchKernel');this.counts.kernelLaunches++;[a,b]=[b,a];
    }
    this.download(s.output,d.a);
    if(iterations%2){[brain.activity,brain.next]=[brain.next,brain.activity];brain.activity.set(s.output.subarray(n,n*2));brain.next.set(s.output.subarray(0,n));}
    else{brain.activity.set(s.output.subarray(0,n));brain.next.set(s.output.subarray(n,n*2));}
    brain.sum.set(s.output.subarray(n*2,n*3));this.counts.gpuCalls++;
  }
  identity(){const base=super.identity();return {...base,revision:'cuda-exact-v3-packed-driver-v1',packedSourceSha256:I.sha(fs.readFileSync(__filename))};}
}
module.exports={CudaPass:PackedCudaPass};
