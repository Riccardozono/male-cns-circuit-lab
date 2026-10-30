'use strict';

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),D6=require('./decoder6-model.cjs'),D7=require('./decoder7-model.cjs'),{P,L}=D6;
const input=path.join(root,'.impeccable/review/decoder7/four-updates-rtx-20261028/decoder7-gen68-result.malecns-save');
const output=path.join(root,'.impeccable/review/decoder7/continuation-updates-rtx-20261028');
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const started=performance.now();let Cuda=null,DenseRef=null,originalDense=null,uninstall=null;

async function main(){
  fs.mkdirSync(output,{recursive:true});
  const inputHash=sha256(input),appSave=await P.decode(fs.readFileSync(input,'utf8'),'5.6.0');
  const state=appSave.payload.workers[0].state;
  if(state.generation!==68||state.population!==40||state.genomes.some(g=>g!==null&&g.adapterVersion!==7))throw Error('Unexpected decoder 7 continuation save.');
  const base=D6.runtime,simPath=path.join(base,'outputs/simulation.js'),densePath=path.join(root,'outputs/dense-neural.js');
  let simSource=fs.readFileSync(simPath,'utf8');
  const rewardsImport="  const Rewards=typeof module!=='undefined'&&module.exports?require('./rewards.js'):root.MaleCNSRewards;";
  const cpuLoop="for(let iter=0;iter<iterations;iter++){brain.sum.set(injection);if(edgesEnabled)for(let e=0;e<graph.from.length;e++){const source=graph.from[e];brain.sum[graph.to[e]]+=.9*graph.weights[e]*brain.activity[source]*(gains?gains[graph.learning.groups[source]]:1);}for(let i=0;i<graph.n;i++)brain.next[i]=.45*brain.activity[i]+.55*Math.tanh(brain.sum[i]);[brain.activity,brain.next]=[brain.next,brain.activity];}";
  if(simSource.split(rewardsImport).length!==2||simSource.split(cpuLoop).length!==2)throw Error('Decoder 6 GPU source anchors are not unique.');
  simSource=simSource.replace(rewardsImport,rewardsImport+'\n  const Dense=require('+JSON.stringify(densePath)+');');
  simSource=simSource.replace(cpuLoop,'if(Dense&&brain.sum instanceof Float64Array&&brain.activity instanceof Float64Array&&brain.next instanceof Float64Array)Dense.step(graph,brain,iterations,edgesEnabled,gains);else '+cpuLoop);
  const simModule=new Module(simPath,module);simModule.filename=simPath;simModule.paths=Module._nodeModulePaths(path.dirname(simPath));simModule._compile(simSource,simPath);
  DenseRef=require(densePath);const F=simModule.exports,Dense=DenseRef;
  const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8'));
  uninstall=D7.install(L);
  const data=D7.model(source),catalog=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const sim=new F.Simulation(data,{population:state.population,circuitId:state.circuitId,circuits:catalog});
  P.validatePayload(appSave.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);sim.running=true;
  Cuda=require('./cuda-exact-v3-runtime.cjs');originalDense=Dense.step;Dense.step=(...args)=>Cuda.pass(...args);
  let history=[],cars=[],lastProgress=performance.now(),maxThrottle=0,maxBrake=0,maxSteering=0;
  sim.onTrialTick=s=>{
    for(const car of s.cars)if(car.speed/(car.pixelsPerMeter||1)>2){maxThrottle=Math.max(maxThrottle,car.slowOutputs?.[1]||0);maxBrake=Math.max(maxBrake,car.slowOutputs?.[2]||0);maxSteering=Math.max(maxSteering,Math.abs(car.slowOutputs?.[0]||0));}
    if(performance.now()-lastProgress>20000){lastProgress=performance.now();console.log('DECODER7_CONTINUING '+JSON.stringify({generation:s.generation,elapsed:s.elapsed,alive:s.cars.filter(c=>c.alive).length,progress:Math.max(...s.cars.map(c=>c.bestProgress))}));}
    if(s.cars.every(c=>!c.alive))cars=s.cars.map(c=>({id:c.id,progress:c.bestProgress,fitness:c.fitness,laps:c.laps,reason:c.reason}));
  };
  for(let update=0;update<4;update++){
    maxThrottle=0;maxBrake=0;maxSteering=0;cars=[];const generation=sim.generation;let ticks=0;
    while(sim.generation===generation&&ticks++<60000)sim.tick();
    if(sim.generation===generation)throw Error('Natural generation unfinished; refusing forced evolve.');
    const item={...sim.history.at(-1),maxThrottle,maxBrake,maxSteering,cars,agentsAt750:cars.filter(c=>c.progress>=750).length,agentsAt850:cars.filter(c=>c.progress>=850).length,agentsAt1200:cars.filter(c=>c.progress>=1200).length};
    history.push(item);fs.writeFileSync(path.join(output,'decoder7-continuation-partial.json'),JSON.stringify({history},null,2));
    console.log('DECODER7_CONTINUATION_GENERATION '+JSON.stringify({generation:item.generation,bestProgress:item.bestProgress,meanProgress:item.meanProgress,laps:item.maxLaps,at750:item.agentsAt750,at850:item.agentsAt850,at1200:item.agentsAt1200,maxThrottle,maxBrake,maxSteering,wallSeconds:(performance.now()-started)/1000}));
  }
  const gpu=Cuda.stats(),gpuIdentity=Cuda.identity();
  if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060')throw Error('Expected RTX 4060 CUDA execution without CPU fallback.');
  const result={variant:'decoder7-three-action-heads-continuation',appVersion:appSave.appVersion,settings:{population:state.population,mutation:state.mutation,circuitId:state.circuitId,seed:state.seed,startingGeneration:state.generation},policy:{version:sim.graph.learning.version,actions:sim.graph.learning.actionCount,parameters:sim.graph.learning.length},history,gpu,gpuIdentity,gpuHarnessSha256:crypto.createHash('sha256').update(simSource).digest('hex'),wallSeconds:(performance.now()-started)/1000,inputIntegrity:{inputUnchanged:sha256(input)===inputHash,inputSha256:inputHash},sourceSha256:{simulation:sha256(simPath),learning:sha256(path.join(base,'outputs/neural-learning.js')),progress:sha256(path.join(base,'outputs/progress-save.js')),vehicle:sha256(path.join(base,'outputs/vehicle-992.js')),rewards:sha256(path.join(base,'outputs/rewards.js')),decoderModel:sha256(path.join(root,'work/decoder7-model.cjs'))},limits:'Isolated research policy only; the packaged 5.6.0 app does not load adapter version 7. No route cues, teacher, forced generation completion, or changes to the input or original user save.'};
  const savePath=path.join(output,'decoder7-gen72-result.malecns-save');
  fs.writeFileSync(savePath,await P.encode(P.fromSimulation(sim),appSave.appVersion));result.outputSave={path:savePath,sha256:sha256(savePath),bytes:fs.statSync(savePath).size};
  result.inputIntegrity.inputUnchanged=sha256(input)===inputHash;
  if(!result.inputIntegrity.inputUnchanged)throw Error('The decoder 7 input save changed during the experiment.');
  fs.writeFileSync(path.join(output,'decoder7-continuation-result.json'),JSON.stringify(result,null,2));
  console.log('DECODER7_CONTINUATION_DONE '+JSON.stringify({gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,inputUnchanged:result.inputIntegrity.inputUnchanged,history:history.map(h=>({generation:h.generation,bestProgress:h.bestProgress,maxLaps:h.maxLaps})),outputSave:result.outputSave,wallSeconds:result.wallSeconds}));
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{if(originalDense&&DenseRef)DenseRef.step=originalDense;if(Cuda)Cuda.close();if(uninstall)uninstall();});
