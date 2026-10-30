'use strict';
// Real reached V3 brain states, plus independent original-COO numeric pass
// references. Extra neural iterations hold sensors fixed: NOT new car episodes.
const fs=require('node:fs'),path=require('node:path'),I=require('./neural-research-source-identity.cjs'),Model=require('./neural-statehead-model.cjs'),Exact=require('./exact-coo.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.impeccable/review/neural-sacl/neuronal-cuda-pass-inputs');
if(process.versions.node!=='24.19.0'||fs.existsSync(out))throw Error('Pinned runtime and NEW input directory required');fs.mkdirSync(out,{recursive:false});
const modelFile=path.join(root,'.impeccable/review/neural-sacl/neuronal-statehead-6584-cma-search/clean.malecns-statehead.json'),loaded=Model.load(modelFile),env=Model.createFromLoaded(loaded),graph=env.graph,files={};
function write(name,array){const b=Buffer.from(array.buffer,array.byteOffset,array.byteLength);fs.writeFileSync(path.join(out,name),b);files[name]={sha256:I.sha(b),elements:array.length,bytes:array.byteLength};return name;}
const offsets=new Uint32Array(graph.n+1);for(const target of graph.to)offsets[target+1]++;for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];const cursor=offsets.slice(0,graph.n),sources=new Uint32Array(graph.from.length),scaled=new Float64Array(graph.weights.length);
for(let e=0;e<graph.from.length;e++){const k=cursor[graph.to[e]]++;sources[k]=graph.from[e];scaled[k]=.9*graph.weights[e];}
const graphFiles={offsets:write('offsets.u32',offsets),sources:write('sources.u32',sources),scaled:write('scaled.f64',scaled)},states=[];
const clone=b=>Object.fromEntries(['activity','next','sum','injection'].map(k=>[k,b[k].slice()]));
for(let control=0;control<8;control++){
  const car=env.currentCar(),brain=clone(car.brain),gains=env.runtime.synapticGains(graph,car.genome),gainPerNode=Float64Array.from(graph.learning.groups,g=>gains[g]),prefix='state-'+String(control).padStart(2,'0'),input={};
  for(const key of ['activity','next','sum','injection'])input[key]=write(prefix+'-'+key+'.f64',brain[key]);input.gains=write(prefix+'-gains.f64',gainPerNode);
  const expected=[];for(const iterations of [1,2,4,8]){const b=clone(brain);Exact.pass(graph,b,iterations,true,gains);const record={iterations};for(const key of ['activity','next','sum'])record[key]=write(prefix+'-expected-'+iterations+'-'+key+'.f64',b[key]);expected.push(record);}
  states.push({control,simulationSeconds:env.state().totalSimulationSeconds,progress:car.bestProgress,input,expected});if(control<7)env.step();
}
const record={format:'male-cns-actual-v3-neural-pass-fixtures-v1',nodeVersion:process.versions.node,v8Version:process.versions.v8,n:graph.n,edgeCount:graph.edgeCount,modelFile,modelSha256:loaded.sha256,graphFiles,states,files,sourceHashes:I.collect(['work/collect-cuda-neural-pass-inputs.cjs','.impeccable/runtime-node24/node.exe','outputs/data/connectome.json','outputs/data/circuits.json']),boundary:'8initial actually reached brains over7physicalcontrols. OriginalCOOreference passes1/2/4/8iterations each hold actual injection/gains fixed: numerical counterfactuals, NOT alternative driving episodes, laps, model-training examples or teacher actions. Stable per-target edge order, scaled weights and mapped Float32gains exported as Float64.'};fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({states:states.length,n:graph.n,edges:graph.edgeCount,files:Object.keys(files).length}));
