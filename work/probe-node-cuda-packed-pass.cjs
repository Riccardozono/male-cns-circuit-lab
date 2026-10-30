'use strict';
// Same entire-pass fixtures through actual Node FFI/CUDA, not Python fallback.
const fs=require('node:fs'),path=require('node:path'),I=require('./neural-research-source-identity.cjs'),Model=require('./neural-statehead-model.cjs'),{CudaPass}=require('./cuda-exact-v3-packed-pass.cjs');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/neural-sacl'),input=path.join(base,'neuronal-cuda-pass-inputs'),out=path.join(base,'node-cuda-packed-pass-probe');if(fs.existsSync(out))throw Error('Preserve existing evidence');fs.mkdirSync(out,{recursive:false});
const metadataFile=path.join(input,'metadata.json'),m=JSON.parse(fs.readFileSync(metadataFile,'utf8'));for(const [f,sha]of Object.entries(m.sourceHashes))if(I.sha(fs.readFileSync(path.join(root,f)))!==sha)throw Error('Input source identity changed');
for(const [file,info]of Object.entries(m.files))if(I.sha(fs.readFileSync(path.join(input,file)))!==info.sha256)throw Error('Input/reference bytes changed');
const model=Model.load(m.modelFile),env=Model.createFromLoaded(model),graph=env.graph,gains=env.runtime.synapticGains(graph,env.currentCar().genome),gpu=new CudaPass();
const read=file=>{const b=fs.readFileSync(path.join(input,file)),a=new Float64Array(b.length/8);Buffer.from(a.buffer).set(b);return a;};let comparedValues=0,mismatches=0;const cases=[];
try{
  for(const state of m.states)for(const expected of state.expected){
    const brain=Object.fromEntries(['activity','next','sum','injection'].map(k=>[k,read(state.input[k])]));gpu.pass(graph,brain,expected.iterations,true,gains);
    const fields={};for(const key of ['activity','next','sum']){const a=brain[key],b=read(expected[key]);let count=0;for(let i=0;i<a.length;i++){comparedValues++;if(!Object.is(a[i],b[i]))count++;}fields[key]=count;mismatches+=count;}cases.push({state:state.control,iterations:expected.iterations,fields});
  }
  const stats=gpu.stats(),report={passed:mismatches===0&&stats.gpuCalls===32&&stats.cpuFallbacks===0,comparedValues,mismatches,cases,stats,engineIdentity:gpu.identity(),inputMetadataSha256:I.sha(fs.readFileSync(metadataFile)),probeSourceSha256:I.sha(fs.readFileSync(__filename)),boundary:'Actual Node24.19FFI -> NVIDIA driver -> precompiled exact-order CUDA kernel -> entire Nodebrain arrays.8reached initial states x1/2/4/8iterations, ORIGINALCOOreferences. No Python inference/CPUfallback counted as GPU. Finite numerical component proof, NOT complete driving, benchmark or app deployment.'};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,comparedValues,mismatches,stats}));if(!report.passed)process.exitCode=1;
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,stats:gpu.stats()},null,2));throw error;}finally{gpu.close();}
