'use strict';
// Paired, headless physical benchmark for the prolonged-stagnation evolution
// schedule. The control is compiled in memory; no production source is edited.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),source=path.join(root,'outputs'),arg=(key,fallback)=>process.argv.find(s=>s.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const models=arg('models','v2,v3,v4').split(','),circuits=arg('circuits','monza').split(','),seeds=arg('seeds','7717').split(',').map(Number),generations=Number(arg('generations','7')),population=Number(arg('population','16')),triggerWindow=Number(arg('trigger-window','6')),variants=arg('variants','control,adaptive').split(',');
const output=path.resolve(root,arg('out','.impeccable/review/learning-ml/adaptive-ab-20261020.json'));
if(!Number.isInteger(generations)||generations<3||generations>100||!Number.isInteger(population)||population<4||population>100||!Number.isInteger(triggerWindow)||triggerWindow<1||triggerWindow>50||variants.some(v=>!['control','adaptive'].includes(v))||!variants.length||seeds.some(s=>!Number.isInteger(s)||s<0||s>0xffffffff)||models.some(m=>!['v2','v3','v4'].includes(m))||circuits.some(c=>!['monza','monaco','le-mans'].includes(c)))throw Error('Invalid benchmark configuration.');
if(fs.existsSync(output))throw Error('Refusing to overwrite an existing report: '+output);
const simulationFile=path.join(source,'simulation.js'),simulationText=fs.readFileSync(simulationFile,'utf8'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function loadControl(){
  let text=simulationText;
  for(const [before,after]of [['prolongedStagnantFrontierOffspringRate:.5','prolongedStagnantFrontierOffspringRate:.25'],['prolongedStagnationMutationMultiplier:2','prolongedStagnationMutationMultiplier:1.5']]){
    if(text.split(before).length!==2)throw Error('Control source contract changed: '+before);
    text=text.replace(before,after);
  }
  const instance=new Module(simulationFile,module);instance.filename=simulationFile;instance.paths=Module._nodeModulePaths(source);instance._compile(text,simulationFile);return instance.exports;
}
function loadTreatment(){
  let text=simulationText;
  if(triggerWindow!==6){const before='prolongedStagnationWindow:6',after=`prolongedStagnationWindow:${triggerWindow}`;if(text.split(before).length!==2)throw Error('Treatment source contract changed: '+before);text=text.replace(before,after);}
  const instance=new Module(simulationFile,module);instance.filename=simulationFile;instance.paths=Module._nodeModulePaths(source);instance._compile(text,simulationFile);return instance.exports;
}
const control=loadControl(),treatment=triggerWindow===6?require(simulationFile):loadTreatment(),Legacy=require(path.join(source,'legacy-models.js')),Profiles=require(path.join(source,'model-profiles.js'));
const compact=require(path.join(source,'data/connectome.json')),catalog=require(path.join(source,'data/circuits.json'));let full;
function modelData(id){
  if(id==='v2')return Legacy.buildV2(compact);
  if(id==='v3')return Legacy.tagV3(compact);
  if(!full){
    const meta=require(path.join(source,'data/connectome-full.json')),bytes=fs.readFileSync(path.join(source,'data',meta.binary));
    if(sha(bytes)!==meta.binarySha256)throw Error('Full connectome checksum mismatch');
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),types={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array};
    full={...meta,compact:true};for(const [name,item]of Object.entries(meta.arrays))full[name]=new types[item.dtype](buffer,item.offset,item.length);
  }
  return full;
}
const modelCache=new Map(),dataFor=id=>{if(!modelCache.has(id))modelCache.set(id,modelData(id));return modelCache.get(id);};
const report={format:'adaptive-evolution-paired-physical-benchmark-v1',version:require(path.join(root,'package.json')).version,runtime:process.version,cpu:os.cpus()[0]?.model||'unknown',sourceSha256:sha(simulationText),settings:{models,circuits,seeds,generations,population,mutation:.16,triggerWindow,variants,wallLimitSeconds:null},variants:{control:'Same current engine except prolonged-stagnation mutation remains 1.5x and frontier offspring rate remains 25% after 6+ stagnant generations.',treatment:`Current engine with prolonged-stagnation threshold at ${triggerWindow}: mutation rises to 2x and frontier offspring rate to 50% after that many stagnant generations.`},cases:[],boundary:'Actual headless CPU generations with real sensors, MaleCNS neural control, circuit physics, rewards and natural termination. Deterministic settings and seed. No user save, GPU, teacher, route controller or release binary is used. One seed is exploratory evidence only.'};
function runCase(engine,variant,modelId,circuitId,seed){
  const data=dataFor(modelId),sim=new engine.Simulation(data,{population,mutation:.16,seed,circuits:catalog,circuitId}),initialMean=sim.optimizer?.mean.slice()||[],history=[],started=performance.now();
  for(let index=0;index<generations;index++){
    const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks++<60000)sim.tick();
    if(sim.generation===generation)throw Error(`Natural generation guard reached: ${variant}/${modelId}/${circuitId}/seed-${seed}/gen-${generation}`);
    const h=sim.history.at(-1);history.push({generation:h.generation,bestProgressMeters:h.bestProgress/(sim.track.pixelsPerMeter||1),meanProgressMeters:h.meanProgress/(sim.track.pixelsPerMeter||1),fitness:h.best,laps:h.maxLaps??h.laps,bestLapTime:h.bestLapTime,stagnation:h.stagnation,mutationUsed:h.mutationAmount,frontierOffspring:sim.lastFrontierOffspringCount,episodes:sim.optimizer?.episodes??0});
  }
  const delta=sim.optimizer?.mean.map((v,i)=>v-initialMean[i])||[];
  return {variant,modelId,circuitId,seed,population,generations,elapsedSeconds:(performance.now()-started)/1000,firstFiveMedianMeters:median(history.slice(0,5).map(h=>h.bestProgressMeters)),lastFiveMedianMeters:median(history.slice(-5).map(h=>h.bestProgressMeters)),maxProgressMeters:Math.max(...history.map(h=>h.bestProgressMeters)),maxLaps:Math.max(...history.map(h=>h.laps)),firstTwoLapGeneration:history.find(h=>h.laps>=2)?.generation??null,meanDeltaRms:delta.length?Math.sqrt(delta.reduce((s,v)=>s+v*v,0)/delta.length):0,optimizerUpdates:sim.optimizer?.updates??0,history};
}
function median(values){const sorted=values.slice().sort((a,b)=>a-b);return (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2;}
fs.mkdirSync(path.dirname(output),{recursive:true});
const engines={control,adaptive:treatment};
for(const modelId of models)for(const circuitId of circuits)for(const seed of seeds)for(const variant of variants){
  const engine=engines[variant];
  const result=runCase(engine,variant,modelId,circuitId,seed);report.cases.push(result);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('ADAPTIVE_CASE '+JSON.stringify({...result,history:undefined}));
}
console.log('ADAPTIVE_REPORT '+output);
