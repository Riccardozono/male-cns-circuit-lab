'use strict';

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),D6=require('./decoder6-model.cjs'),D7=require('./decoder7-model.cjs'),{P,L}=D6;
const input=path.join(root,'.impeccable/review/decoder7/four-updates-rtx-20261028/decoder7-gen68-result.malecns-save');
const output=path.join(root,'.impeccable/review/decoder7/steering-gain-ab-rtx-20261028');
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const started=performance.now();let Cuda=null,DenseRef=null,originalDense=null,uninstall=null;

async function main(){
  fs.mkdirSync(output,{recursive:true});
  const inputHash=sha256(input),appSave=await P.decode(fs.readFileSync(input,'utf8'),'5.6.0'),state=appSave.payload.workers[0].state,agentId=12;
  if(state.generation!==68||state.population!==40||state.genomes[agentId]?.adapterVersion!==7)throw Error('Unexpected decoder 7 steering test input.');
  const base=D6.runtime,simPath=path.join(base,'outputs/simulation.js'),densePath=path.join(root,'outputs/dense-neural.js');
  let simSource=fs.readFileSync(simPath,'utf8');
  const rewardsImport="  const Rewards=typeof module!=='undefined'&&module.exports?require('./rewards.js'):root.MaleCNSRewards;";
  const cpuLoop="for(let iter=0;iter<iterations;iter++){brain.sum.set(injection);if(edgesEnabled)for(let e=0;e<graph.from.length;e++){const source=graph.from[e];brain.sum[graph.to[e]]+=.9*graph.weights[e]*brain.activity[source]*(gains?gains[graph.learning.groups[source]]:1);}for(let i=0;i<graph.n;i++)brain.next[i]=.45*brain.activity[i]+.55*Math.tanh(brain.sum[i]);[brain.activity,brain.next]=[brain.next,brain.activity];}";
  if(simSource.split(rewardsImport).length!==2||simSource.split(cpuLoop).length!==2)throw Error('Decoder 6 GPU source anchors are not unique.');
  simSource=simSource.replace(rewardsImport,rewardsImport+'\n  const Dense=require('+JSON.stringify(densePath)+');');
  simSource=simSource.replace(cpuLoop,'if(Dense&&brain.sum instanceof Float64Array&&brain.activity instanceof Float64Array&&brain.next instanceof Float64Array)Dense.step(graph,brain,iterations,edgesEnabled,gains);else '+cpuLoop);
  const simModule=new Module(simPath,module);simModule.filename=simPath;simModule.paths=Module._nodeModulePaths(path.dirname(simPath));simModule._compile(simSource,simPath);
  DenseRef=require(densePath);const F=simModule.exports;uninstall=D7.install(L);
  const source=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/connectome.json'),'utf8')),catalog=JSON.parse(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8')),baseCommands=L.commands;
  Cuda=require('./cuda-exact-v3-runtime.cjs');originalDense=DenseRef.step;DenseRef.step=(...args)=>Cuda.pass(...args);
  const results=[];
  for(const gain of [1,2,4]){
    L.commands=(...args)=>{const action=baseCommands(...args);return [clamp(action[0]*gain,-1,1),action[1],action[2]];};
    const sim=new F.Simulation(D7.model(source),{population:1,circuitId:state.circuitId,seed:state.seed,circuits:catalog});
    sim.spawn([D6.F.cloneGenome(state.genomes[agentId])]);sim.generation=state.generation;sim.running=true;
    const samples=[];let terminal=null,lastSampleTick=-12,maxProgress=0,maxSpeed=0,maxRawBrake=0,maxRawSteer=0;
    sim.onTrialTick=s=>{const car=s.cars[0];maxProgress=Math.max(maxProgress,car.bestProgress);maxSpeed=Math.max(maxSpeed,car.vehicle?.speedMps||0);maxRawBrake=Math.max(maxRawBrake,car.slowOutputs?.[2]||0);maxRawSteer=Math.max(maxRawSteer,Math.abs(car.slowOutputs?.[0]||0));
      if(car.alive&&car.bestProgress>=620&&car.bestProgress<=1000&&s.ticks-lastSampleTick>=12){lastSampleTick=s.ticks;samples.push({time:s.elapsed,progress:car.bestProgress,x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle?.speedMps,raw:car.slowOutputs?.slice()||null,effective:car.outputs?.slice()||null,forward:F.sensorDistances(s.track,car)[3],onRoad:F.onRoad(s.track,car.x,car.y)});}
      if(!car.alive&&!terminal)terminal={progress:car.bestProgress,laps:car.laps,reason:car.reason,x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle?.speedMps,raw:car.slowOutputs?.slice()||null,effective:car.outputs?.slice()||null,collision:F.collided(s.track,car),onRoad:F.onRoad(s.track,car.x,car.y)};
    };
    const generation=sim.generation;let ticks=0;while(sim.generation===generation&&ticks++<60000)sim.tick();
    if(sim.generation===generation||!terminal)throw Error('Natural single-agent episode did not finish.');
    results.push({steeringGain:gain,generation,progress:maxProgress,lap:terminal.laps||0,reason:terminal.reason,maxSpeedKmh:maxSpeed*3.6,maxRawBrake,maxRawSteer,terminal,samples});
    console.log('STEERING_GAIN_RESULT '+JSON.stringify({steeringGain:gain,progress:maxProgress,reason:terminal.reason,maxSpeedKmh:maxSpeed*3.6,maxRawBrake,maxRawSteer,terminal}));
  }
  const gpu=Cuda.stats(),result={variant:'isolated-steering-output-gain-sweep',appVersion:appSave.appVersion,model:'V3 decoder7 experimental',inputGeneration:state.generation,agentId,circuitId:state.circuitId,seed:state.seed,results,gpu,wallSeconds:(performance.now()-started)/1000,inputIntegrity:{inputUnchanged:sha256(input)===inputHash,inputSha256:inputHash},limits:'Same saved V3 genome and physics; only the neural steering output multiplier changes. One natural episode per gain, no route cue, reward edit, mutation, save migration or original-save write.'};
  const baseline=results[0];if(Math.abs(baseline.progress-797.9593576889805)>2)throw Error('1x baseline failed to reproduce the saved generation-68 agent closely.');
  if(gpu.gpuCalls<=0||gpu.cpuFallbacks!==0||gpu.device?.name!=='NVIDIA GeForce RTX 4060'||!result.inputIntegrity.inputUnchanged)throw Error('GPU/input integrity requirement failed.');
  const reportPath=path.join(output,'steering-gain-comparison.json');fs.writeFileSync(reportPath,JSON.stringify(result,null,2));
  console.log('STEERING_GAIN_DONE '+JSON.stringify({reportPath,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,inputUnchanged:result.inputIntegrity.inputUnchanged,results:results.map(x=>({gain:x.steeringGain,progress:x.progress,reason:x.reason,lap:x.lap,terminal:x.terminal})),wallSeconds:result.wallSeconds}));
  L.commands=baseCommands;
}

main().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{if(originalDense&&DenseRef)DenseRef.step=originalDense;if(Cuda)Cuda.close();if(uninstall)uninstall();});
