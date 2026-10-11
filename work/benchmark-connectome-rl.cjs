'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../outputs/simulation.js'),Legacy=require('../outputs/legacy-models.js');
const root=path.join(__dirname,'..'),out=path.join(root,'outputs'),source=require('../outputs/data/connectome.json'),catalog=require('../outputs/data/circuits.json');
// Capture the code at load time, not after a long run during which files may be edited.
const sourceSha256=Object.fromEntries(['simulation.js','neural-learning.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')]));
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:fallback;};
const model=arg('model','v2'),generations=Number(arg('generations',60)),population=Number(arg('population',32)),circuit=arg('circuit','lab'),seed=Number(arg('seed',7717));
if(!Number.isInteger(generations)||generations<1||generations>10000||!Number.isInteger(population)||population<4||population>32||!Number.isFinite(seed))throw Error('Invalid benchmark configuration.');
let data;
if(model==='v2')data=Legacy.buildV2(source);else if(model==='v3')data=Legacy.tagV3(source);else if(model==='v4'){
  const meta=require('../outputs/data/connectome-full.json'),bytes=fs.readFileSync(path.join(out,'data',meta.binary)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),types={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array};
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==meta.binarySha256)throw Error('Invalid connectome');
  data={...meta,compact:true};for(const [name,item]of Object.entries(meta.arrays))data[name]=new types[item.dtype](buffer,item.offset,item.length);
}else throw Error('Unknown model.');
const sim=new F.Simulation(data,{population,mutation:.16,seed,circuits:catalog,circuitId:circuit}),started=Date.now(),history=[];
const topologyBefore=crypto.createHash('sha256').update(Buffer.from(sim.graph.targets.buffer,sim.graph.targets.byteOffset,sim.graph.targets.byteLength)).digest('hex');
let firstLap=null;
for(let n=0;n<generations;n++){
  const generation=sim.generation;let ticks=0;
  while(sim.generation===generation&&ticks++<60000)sim.tick();
  if(sim.generation===generation)throw Error('Benchmark guard reached; generation not forced.');
  const entry=sim.history.at(-1);history.push(entry);
  if(!firstLap&&entry.laps>0)firstLap=entry.generation;
  console.log('RL_GENERATION '+JSON.stringify({model,circuit,generation:entry.generation,progress:entry.bestProgress,laps:entry.laps,lap:entry.bestLapTime,fitness:entry.best,episodes:entry.learning.episodes}));
  if(entry.laps>=2&&!process.argv.includes('--all-generations'))break;
}
const report={generatedAt:new Date().toISOString(),version:'4.4.0',warmStart:false,trainingLabels:false,algorithm:sim.optimizer.metrics(),configuration:{model,circuit,population,mutation:.16,seed,generations},graph:{nodes:sim.graph.n,edges:sim.graph.edgeCount,readoutNodes:sim.graph.learning.nodes.length,topologyUnchanged:topologyBefore===crypto.createHash('sha256').update(Buffer.from(sim.graph.targets.buffer,sim.graph.targets.byteOffset,sim.graph.targets.byteLength)).digest('hex')},initialProgress:history[0].bestProgress,bestProgress:Math.max(...history.map(e=>e.bestProgress)),firstLapGeneration:firstLap,completedTwoLaps:history.some(e=>e.laps>=2),elapsedWallSeconds:(Date.now()-started)/1000,sourceSha256,sourceHashCapture:'module load',history};
fs.writeFileSync(path.join(out,`benchmark-rl-v44-${model}-${circuit}-${seed}.json`),JSON.stringify(report,null,2)+'\n');
console.log('RL_RESULT '+JSON.stringify({...report,history:undefined}));
