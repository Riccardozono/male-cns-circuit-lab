'use strict';

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),D6=require('./decoder6-model.cjs'),D7=require('./decoder7-model.cjs'),{P,L}=D6;
const input=path.join(root,'.impeccable/review/decoder7/four-updates-rtx-20261028/decoder7-gen68-result.malecns-save');
const output=path.join(root,'.impeccable/review/decoder7/trace-first-chicane-rtx-20261028');
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const started=performance.now();let Cuda=null,DenseRef=null,originalDense=null,uninstall=null;

async function main(){
  fs.mkdirSync(output,{recursive:true});
  const inputHash=sha256(input),appSave=await P.decode(fs.readFileSync(input,'utf8'),'5.6.0'),state=appSave.payload.workers[0].state;
  if(state.generation!==68||state.population!==40||state.genomes.some(g=>g!==null&&g.adapterVersion!==7))throw Error('Unexpected decoder 7 diagnostic save.');
  const base=D6.runtime,simPath=path.join(base,'outputs/simulation.js'),densePath=path.join(root,'outputs/dense-neural.js');
  let simSource=fs.readFileSync(simPath,'utf8');
  const rewardsImport="  const Rewards=typeof module!=='undefined'&&module.exports?require('./rewards.js'):root.MaleCNSRewards;";
  const cpuLoop="for(let iter=0;iter<iterations;iter++){brain.sum.set(injection);if(edgesEnabled)for(let e=0;e<graph.from.length;e++){const source=graph.from[e];brain.sum[graph.to[e]]+=.9*graph.weights[e]*brain.activity[source]*(gains?gains[graph.learning.groups[source]]:1);}for(let i=0;i<graph.n;i++)brain.next[i]=.45*brain.activity[i]+.55*Math.tanh(brain.sum[i]);[brain.activity,brain.next]=[brain.next,brain.activity];}";
  if(simSource.split(rewardsImport).length!==2||simSource.split(cpuLoop).length!==2)throw Error('Decoder 6 GPU source anchors are not unique.');
  simSource=simSource.replace(rewardsImport,rewardsImport+'\n  const Dense=require('+JSON.stringify(densePath)+');');
  simSource=simSource.replace(cpuLoop,'if(Dense&&brain.sum instanceof Float64Array&&brain.activity instanceof Float64Array&&brain.next instanceof Float64Array)Dense.step(graph,brain,iterations,edgesEnabled,gains);else '+cpuLoop);
  const simModule=new Module(simPath,module);simModule.filename=simPath;simModule.paths=Module._nodeModulePaths(path.dirname(simPath));simModule._compile(simSource,simPath);
  DenseRef=require(densePath);const F=simModule.exports;uninstall=D7.install(L);
  const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),catalog=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'));
  const sim=new F.Simulation(D7.model(source),{population:state.population,circuitId:state.circuitId,circuits:catalog});
  P.validatePayload(appSave.payload,{graph:sim.graph,circuits:sim.circuits});P.restore(sim,state);sim.running=true;
  Cuda=require('./cuda-exact-v3-runtime.cjs');originalDense=DenseRef.step;DenseRef.step=(...args)=>Cuda.pass(...args);
  const watched=new Set([1,30,12]),traces=Object.fromEntries([...watched].map(id=>[id,[]])),terminals={};let finalCars=[];
  sim.onTrialTick=s=>{
    for(const car of s.cars){
      if(!watched.has(car.id))continue;
      if(car.alive&&car.bestProgress>=650&&car.bestProgress<=810&&(!traces[car.id].length||s.ticks%12===0)){
        traces[car.id].push({time:s.elapsed,progress:car.bestProgress,x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle?.speedMps,rawOutputs:car.slowOutputs?.slice()||null,effectiveOutputs:car.outputs?.slice()||null,sensors:F.sense(s.track,car),physicsSensors:F.physicsSense(car,s.track),sensorDistances:F.sensorDistances(s.track,car),longitudinalG:car.longitudinalG,lateralG:car.lateralG,slipAngle:car.slipAngle,yawRate:car.yawRate,onRoad:F.onRoad(s.track,car.x,car.y),collision:F.collided(s.track,car)});
      }
      if(!car.alive&&!terminals[car.id]&&car.bestProgress>=650)terminals[car.id]={time:s.elapsed,progress:car.bestProgress,reason:car.reason,x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle?.speedMps,rawOutputs:car.slowOutputs?.slice()||null,effectiveOutputs:car.outputs?.slice()||null,onRoad:F.onRoad(s.track,car.x,car.y),collision:F.collided(s.track,car)};
    }
    if(s.cars.every(c=>!c.alive))finalCars=s.cars.map(c=>({id:c.id,progress:c.bestProgress,reason:c.reason,laps:c.laps,fitness:c.fitness}));
  };
  const generation=sim.generation;let ticks=0;
  while(sim.generation===generation&&ticks++<60000)sim.tick();
  if(sim.generation===generation)throw Error('Natural diagnostic generation unfinished; refusing forced evolve.');
  const summaries=Object.fromEntries([...watched].map(id=>{const a=traces[id],near=a.filter(x=>x.progress>=760);return [id,{samples:a.length,peakProgress:Math.max(0,...a.map(x=>x.progress)),lastSample:a.at(-1)||null,terminal:terminals[id]||null,maxRawThrottle:Math.max(0,...a.map(x=>x.rawOutputs?.[1]||0)),maxRawBrake:Math.max(0,...a.map(x=>x.rawOutputs?.[2]||0)),maxEffectiveThrottle:Math.max(0,...a.map(x=>x.effectiveOutputs?.[1]||0)),maxEffectiveBrake:Math.max(0,...a.map(x=>x.effectiveOutputs?.[2]||0)),approach:a}];}));
  const gpu=Cuda.stats(),result={variant:'decoder7-monza-first-chicane-actuator-trace',appVersion:appSave.appVersion,generation,track:{id:sim.circuitId,totalMeters:sim.track.total,landmark:sim.circuit.landmarks.find(x=>x.label==='Prima Variante')||null},watched:[...watched],summaries,finalCars:finalCars.filter(c=>watched.has(c.id)),gpu,wallSeconds:(performance.now()-started)/1000,inputIntegrity:{inputUnchanged:sha256(input)===inputHash,inputSha256:inputHash},limits:'Diagnostic replay of one natural generation from an isolated research save; no routes, coaching, altered physics/rewards, or user-save writes.'};
  if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060'||!result.inputIntegrity.inputUnchanged)throw Error('Diagnostic integrity/GPU requirement failed.');
  const reportPath=path.join(output,'first-chicane-trace.json');fs.writeFileSync(reportPath,JSON.stringify(result,null,2));
  console.log('DECODER7_TRACE_DONE '+JSON.stringify({reportPath,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,watched:result.watched,summaries:Object.fromEntries([...watched].map(id=>{const x=summaries[id];return [id,{samples:x.samples,peakProgress:x.peakProgress,last:x.lastSample&&{progress:x.lastSample.progress,reason:finalCars.find(c=>c.id===id)?.reason,raw:x.lastSample.rawOutputs,effective:x.lastSample.effectiveOutputs}}]})),inputUnchanged:result.inputIntegrity.inputUnchanged,wallSeconds:result.wallSeconds}));
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{if(originalDense&&DenseRef)DenseRef.step=originalDense;if(Cuda)Cuda.close();if(uninstall)uninstall();});
