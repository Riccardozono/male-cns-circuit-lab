'use strict';
// Warm-start data come only from actual actions executed by this project's
// previously learned neural policy. No map, position, time or target speed is
// a readout input. The current footprint-aware neural observer never drives.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=require('./current-statehead-environment.cjs'),Readout=require('./neural-self-readout.cjs');
const Cuda=require('./cuda-exact-v3-runtime.cjs'),Dense=require('../outputs/dense-neural.js');
const root=path.resolve(__dirname,'..'),tag=process.argv[2],footprint=process.argv[3]||'off',paceMode=process.argv[4]||'first-lap-moving',allowSafeTerminalPrefix=process.argv[5]==='--allow-safe-terminal-prefix';
if(!tag||!/^[A-Za-z0-9-]+$/.test(tag))throw Error('A new scoped collection tag is required.');
if(!['on','off'].includes(footprint)||!['strict','first-lap-moving'].includes(paceMode))throw Error('Declared behavior footprint and pace mode are required.');
const output=path.join(root,'.impeccable/review/learning-ml',tag);
if(fs.existsSync(output))throw Error('Preserve existing experience.');
const previousDense=Dense.step;let xFile=null,yFile=null,created=false;
try{
  const env=E.create({footprint,paceMode});
  Dense.step=(...args)=>Cuda.pass(...args);
  const observed=Readout.observer(env.currentF,env.currentGraph,env.track,env.observerSpec);
  const behaviorFootprint=env.currentCar().footprintSensorsEnabled===true,observerFootprint=true;
  if(allowSafeTerminalPrefix&&(!behaviorFootprint||!observerFootprint))throw Error('Safe-prefix data must use the same active footprint sensors for behavior and observation.');
  fs.mkdirSync(output);created=true;
  xFile=fs.openSync(path.join(output,'observations.f64'),'wx');yFile=fs.openSync(path.join(output,'actions.f64'),'wx');
  const xHash=crypto.createHash('sha256'),yHash=crypto.createHash('sha256');
  let state=env.state(),previous=[0,0],rows=0,last=performance.now(),observerPasses=0,behaviorPasses=0;
  while(!state.complete&&state.laps<1&&rows<20000){
    const beforeObserver=Cuda.stats().gpuCalls;
    const input=Float64Array.from(observed.observe(env.currentCar(),previous));
    observerPasses+=Cuda.stats().gpuCalls-beforeObserver;
    const beforeBehavior=Cuda.stats().gpuCalls;
    state=env.step();behaviorPasses+=Cuda.stats().gpuCalls-beforeBehavior;const actual=state.car.outputs;
    const action=Float64Array.of(actual[0],actual[1]-actual[2]);
    const xb=Buffer.from(input.buffer),yb=Buffer.from(action.buffer);
    fs.writeSync(xFile,xb);fs.writeSync(yFile,yb);xHash.update(xb);yHash.update(yb);previous=Array.from(action);rows++;
    if(performance.now()-last>20000){last=performance.now();console.log('NEURAL_SELF_COLLECTION '+JSON.stringify({rows,progress:state.bestProgress,laps:state.laps}));}
  }
  fs.closeSync(xFile);xFile=null;fs.closeSync(yFile);yFile=null;env.verifySources();
  const safe=env.currentF.isSafeLearningOutcome(state.car),completedLap=state.laps>=1,
    safeTerminalPrefix=allowSafeTerminalPrefix&&!completedLap&&state.complete&&safe;
  if(!safe||!completedLap&&!safeTerminalPrefix)throw Error('A safe lap or explicitly allowed safe terminal prefix is required for this warm-start dataset.');
  const observerGpu=Cuda.stats(),behaviorGpu=E.stats();
  if(!(observerGpu.gpuCalls>0)||observerGpu.cpuFallbacks!==0||!(behaviorGpu.gpuCalls>0)||behaviorGpu.cpuFallbacks!==0)throw Error('Both actual brains must run on exact CUDA.');
  const report={format:'male-cns-neural-self-experience-v2',dtype:'<f8',rows,inputSize:514,outputSize:2,
    experienceType:safeTerminalPrefix?'safe-terminal-prefix':'completed-lap',behaviorFootprint:behaviorFootprint?'on':'off',observerFootprint:observerFootprint?'on':'off',sensorModeMatch:behaviorFootprint===observerFootprint,
    observationDefinition:'Four current descending-neuron frames from the active footprint-aware observer, then previous executed steering and signed longitudinal command. No position, route, time or desired speed.',
    behavior:'Previously learned private neural policy; commands were executed in the current physical environment. Own replay experience, not invented labels or a driving-rule controller.',
    identity:env.identity,sourceSha256:env.identity.sourceSha256,observerSpec:env.observerSpec,
    observationsSha256:xHash.digest('hex'),actionsSha256:yHash.digest('hex'),observerGpu,behaviorGpu,
    gpuCounterScope:'Both interfaces share cuda-exact-v3-runtime; totals are not additive.',observerPasses,behaviorPasses,
    sourceResult:{laps:state.laps,progress:state.bestProgress,firstLapSeconds:state.lapTimes[0]??null,episodeComplete:state.complete,safe,reason:state.reason,safeTerminalPrefix,collectionStoppedAtFirstActualLap:completedLap},
    limits:'One executed policy prefix in the declared sensor mode. A safe terminal prefix can be used as a warm start, but is not a completed lap or proof that the new readout drives, learns two laps or generalizes.'};
  fs.writeFileSync(path.join(output,'dataset.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('NEURAL_SELF_COLLECTION_DONE '+JSON.stringify({rows,sourceResult:report.sourceResult,observerGpuCalls:observerGpu.gpuCalls,behaviorGpuCalls:behaviorGpu.gpuCalls,output}));
}catch(error){if(created)fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack},null,2),{flag:'wx'});throw error;}
finally{if(xFile!==null)fs.closeSync(xFile);if(yFile!==null)fs.closeSync(yFile);Dense.step=previousDense;Cuda.close();E.close();}
