'use strict';
// Explicit private CUDA driver backend. Own context/memory only; no global
// device reset, model mutation, prerecorded actions or hidden CPU success.
const fs=require('node:fs'),path=require('node:path'),I=require('./neural-research-source-identity.cjs'),Original=require('./exact-coo.cjs');
const root=path.resolve(__dirname,'..'),packet=path.join(root,'.impeccable/review/neural-sacl/cuda-v3-kernel-prepared-r2'),nativeTanh=Math.tanh;
const ffiFolder='.impeccable/cuda-node-runtime/node_modules',koffi=require(path.join(root,ffiFolder,'koffi'));
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength),same=(a,b)=>a.length===b.length&&a.equals(b);
class CudaPass {
  constructor(){
    if(process.platform!=='win32'||process.arch!=='x64')throw Error('Private Windows x64 CUDA backend required');
    const manifestFile=path.join(packet,'manifest.json'),m=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    if(m.format!=='male-cns-private-exact-v3-cuda-kernel-v1'||process.versions.node!==m.nodeVersion||process.versions.v8!==m.v8Version||I.sha(fs.readFileSync(process.execPath))!==m.nodeExecutableSha256)throw Error('Pinned CUDA math/runtime identity differs');
    for(const [file,sha]of [['kernel.ptx',m.ptxSha256],['licensed-kernel-source.cu',m.sourceSha256],['LICENSE.V8-fdlibm.txt',m.licenseSha256]])if(I.sha(fs.readFileSync(path.join(packet,file)))!==sha)throw Error('CUDA kernel packet changed: '+file);
    this.manifest=m;this.closed=false;this.allocations=new Map();this.graphs=new WeakMap();this.context=null;this.module=null;
    this.counts={calls:0,gpuCalls:0,kernelLaunches:0,cpuFallbacks:0,graphUploads:0,bytesHtoD:0,bytesDtoH:0,peakDeviceBytes:0};
    this.driverPath=path.join(process.env.SystemRoot,'System32','nvcuda.dll');this.library=koffi.load(this.driverPath);
    const bind=s=>this.library.func(s);
    this.api={init:bind('int __stdcall cuInit(unsigned int flags)'),version:bind('int __stdcall cuDriverGetVersion(_Out_ int *version)'),
      getDevice:bind('int __stdcall cuDeviceGet(_Out_ int *device, int ordinal)'),capability:bind('int __stdcall cuDeviceComputeCapability(_Out_ int *major, _Out_ int *minor, int device)'),name:bind('int __stdcall cuDeviceGetName(_Out_ char *name, int length, int device)'),
      createContext:bind('int __stdcall cuCtxCreate_v2(_Out_ void **context, unsigned int flags, int device)'),setContext:bind('int __stdcall cuCtxSetCurrent(void *context)'),destroyContext:bind('int __stdcall cuCtxDestroy_v2(void *context)'),
      loadModule:bind('int __stdcall cuModuleLoadData(_Out_ void **module, const void *image)'),unloadModule:bind('int __stdcall cuModuleUnload(void *module)'),getFunction:bind('int __stdcall cuModuleGetFunction(_Out_ void **function, void *module, const char *name)'),
      allocate:bind('int __stdcall cuMemAlloc_v2(_Out_ uint64_t *address, size_t bytes)'),free:bind('int __stdcall cuMemFree_v2(uint64_t address)'),
      htod:bind('int __stdcall cuMemcpyHtoD_v2(uint64_t device, const void *host, size_t bytes)'),dtoh:bind('int __stdcall cuMemcpyDtoH_v2(_Out_ void *host, uint64_t device, size_t bytes)'),
      launch:bind('int __stdcall cuLaunchKernel(void *function, unsigned int gx, unsigned int gy, unsigned int gz, unsigned int bx, unsigned int by, unsigned int bz, unsigned int shared, void *stream, void **parameters, void **extra)'),
      synchronize:bind('int __stdcall cuCtxSynchronize()')};
    try{
      this.check(this.api.init(0),'cuInit');const version=[0],device=[0],major=[0],minor=[0];this.check(this.api.version(version),'cuDriverGetVersion');this.check(this.api.getDevice(device,0),'cuDeviceGet');this.check(this.api.capability(major,minor,device[0]),'cuDeviceComputeCapability');
      if(JSON.stringify([major[0],minor[0]])!==JSON.stringify(m.computeCapability))throw Error('Kernel packet is qualified only for the tested compute capability');
      const name=Buffer.alloc(256);this.check(this.api.name(name,name.length,device[0]),'cuDeviceGetName');this.device={name:name.toString('utf8').split('\0')[0],capability:[major[0],minor[0]],driverVersion:version[0]};
      const context=[null];this.check(this.api.createContext(context,4,device[0]),'cuCtxCreate_v2');this.context=context[0];
      this.image=fs.readFileSync(path.join(packet,'kernel.ptx'));const module=[null];this.check(this.api.loadModule(module,this.image),'cuModuleLoadData');this.module=module[0];
      const function_=[null];this.check(this.api.getFunction(function_,this.module,m.kernelName),'cuModuleGetFunction');this.function=function_[0];
    }catch(e){this.close();throw e;}
    this.pass=this.pass.bind(this);
  }
  check(code,operation){if(code!==0)throw Error(operation+': CUDA driver code '+code);}
  current(){if(this.closed||!this.context)throw Error('CUDA context is not active');this.check(this.api.setContext(this.context),'cuCtxSetCurrent');}
  alloc(size){if(!Number.isSafeInteger(size)||size<=0||size>256*1024*1024)throw Error('Bounded private device allocation required');const out=[0];this.check(this.api.allocate(out,size),'cuMemAlloc_v2');const address=BigInt(out[0]);this.allocations.set(address,size);this.counts.peakDeviceBytes=Math.max(this.counts.peakDeviceBytes,[...this.allocations.values()].reduce((a,b)=>a+b,0));return address;}
  upload(address,data){const b=bytes(data);this.check(this.api.htod(address,b,b.length),'cuMemcpyHtoD_v2');this.counts.bytesHtoD+=b.length;}
  download(data,address){const b=bytes(data);this.check(this.api.dtoh(b,address,b.length),'cuMemcpyDtoH_v2');this.counts.bytesDtoH+=b.length;}
  release(address){if(!this.allocations.has(address))throw Error('Refuse an unowned device pointer');this.check(this.api.free(address),'cuMemFree_v2');this.allocations.delete(address);}
  graph(graph){
    const n=graph.n,from=graph.from,to=graph.to,weights=graph.weights,parts=[from,to,weights].map(bytes);let s=this.graphs.get(graph);
    if(s&&s.n===n&&parts.every((b,i)=>same(b,s.parts[i])))return s;
    if(s)for(const address of Object.values(s.device))this.release(address);
    const offsets=new Uint32Array(n+1);for(let e=0;e<from.length;e++){if(from[e]>=n||to[e]>=n||!Number.isFinite(weights[e]))throw Error('Invalid actual graph');offsets[to[e]+1]++;}for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
    const cursor=offsets.slice(0,n),sources=new Uint32Array(from.length),scaled=new Float64Array(weights.length);for(let e=0;e<from.length;e++){const k=cursor[to[e]]++;sources[k]=from[e];scaled[k]=.9*weights[e];}
    const device={offsets:this.alloc(offsets.byteLength),sources:this.alloc(sources.byteLength),scaled:this.alloc(scaled.byteLength),injection:this.alloc(n*8),a:this.alloc(n*8),b:this.alloc(n*8),gains:this.alloc(n*8),sum:this.alloc(n*8)};
    this.upload(device.offsets,offsets);this.upload(device.sources,sources);this.upload(device.scaled,scaled);
    s={n,parts:parts.map(b=>Buffer.from(b)),device,gainPerNode:new Float64Array(n)};this.graphs.set(graph,s);this.counts.graphUploads++;return s;
  }
  pass(graph,brain,iterations,edgesEnabled,gains){
    this.counts.calls++;
    const arrays=['activity','next','sum','injection'].map(k=>brain[k]),n=graph.n;
    const suitable=edgesEnabled===true&&Math.tanh===nativeTanh&&n===this.manifest.nTested&&graph.from instanceof Uint32Array&&graph.to instanceof Uint32Array&&graph.weights instanceof Float64Array&&graph.from.length===this.manifest.edgesTested&&graph.to.length===graph.from.length&&graph.weights.length===graph.from.length&&arrays.every(a=>a instanceof Float64Array&&a.length===n)&&new Set(arrays.map(a=>a.buffer)).size===4&&Number.isInteger(iterations)&&iterations>0&&iterations<=8&&(!gains||graph.learning?.groups instanceof Uint8Array);
    if(!suitable){this.counts.cpuFallbacks++;return Original.pass(graph,brain,iterations,edgesEnabled,gains);}
    this.current();const s=this.graph(graph),d=s.device;
    for(let i=0;i<n;i++){const g=gains?gains[graph.learning.groups[i]]:1;if(!Number.isFinite(g))throw Error('Finite actual synaptic gains required');s.gainPerNode[i]=g;}
    this.upload(d.injection,brain.injection);this.upload(d.a,brain.activity);this.upload(d.b,brain.next);this.upload(d.gains,s.gainPerNode);
    let a=d.a,b=d.b;const deviceArgument=v=>{const x=Buffer.allocUnsafe(8);x.writeBigUInt64LE(v);return x;},intArgument=v=>{const x=Buffer.allocUnsafe(4);x.writeInt32LE(v);return x;};
    for(let i=0;i<iterations;i++){
      const parameters=[d.offsets,d.sources,d.scaled,d.injection,a,d.gains,b,d.sum].map(deviceArgument).concat([intArgument(n),intArgument(1)]);
      this.check(this.api.launch(this.function,Math.ceil(n/128),1,1,128,1,1,0,null,parameters,null),'cuLaunchKernel');this.counts.kernelLaunches++;[a,b]=[b,a];
    }
    if(iterations%2)[brain.activity,brain.next]=[brain.next,brain.activity];
    this.download(brain.activity,a);this.download(brain.next,b);this.download(brain.sum,d.sum);this.counts.gpuCalls++;
  }
  stats(){return {...this.counts,device:this.device,allocatedDeviceBytes:[...this.allocations.values()].reduce((a,b)=>a+b,0)};}
  identity(){return {revision:'cuda-exact-v3-driver-v1',manifestSha256:I.sha(fs.readFileSync(path.join(packet,'manifest.json'))),driverPath:this.driverPath,driverSha256:I.sha(fs.readFileSync(this.driverPath)),sources:I.collect(['work/cuda-exact-v3-pass.cjs','.impeccable/runtime-node24/node.exe','.impeccable/cuda-node-runtime/package-lock.json',ffiFolder+'/koffi/index.cjs',ffiFolder+'/koffi/package.json',ffiFolder+'/@koromix/koffi-win32-x64/package.json',ffiFolder+'/@koromix/koffi-win32-x64/win32_x64/koffi.node'])};}
  close(){if(this.closed)return;this.closed=true;if(this.context){this.api.setContext(this.context);this.api.synchronize();for(const address of this.allocations.keys())this.api.free(address);this.allocations.clear();if(this.module)this.api.unloadModule(this.module);this.api.destroyContext(this.context);this.context=null;}}
}
module.exports={CudaPass};
