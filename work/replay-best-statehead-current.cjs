'use strict';
// Fresh full replay of the distinct protected one-lap family, not native202.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),M=require('./neural-statehead-cuda-model.cjs');
const root=path.resolve(__dirname,'..'),tag=process.argv[2],sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(!tag||!/^[a-zA-Z0-9-]+$/.test(tag))throw Error('Scoped replay tag required');
const out=path.join(root,'.impeccable/review/learning-ml',tag);fs.mkdirSync(out);
try{
 const choice=M.defaultChoice(),loaded=M.load(choice.file),env=M.createFromLoaded(loaded),trace=crypto.createHash('sha256'),rows=[];
 const counters=[{controls:0,saturatedSteering:0,saturatedLongitudinal:0},{controls:0,saturatedSteering:0,saturatedLongitudinal:0}];
 let state=env.state(),controls=0;
 while(!state.complete){
  const before=state,lane=Math.min(1,before.laps),raw=before.observation.slice();state=env.step();controls++;
  const c=state.car,commands=c.outputs.slice(),stats=counters[lane];stats.controls++;
  stats.saturatedSteering+=Math.abs(commands[0])>.999;stats.saturatedLongitudinal+=Math.abs(commands[1]-commands[2])>.999;
  trace.update(JSON.stringify([controls,commands,c.x,c.y,c.heading,c.bestProgress])+'\n');
  if(c.bestProgress>6300)rows.push({control:controls,progress:c.bestProgress,laps:c.laps,speedMps:c.vehicle.speedMps,commands,observation:raw,
    policyFeatures:Array.from(c.brain.policyFeatures),stateHead:env.stateHeadSnapshot(),reason:c.reason||null});
  if(controls%2048===0)console.log('BEST_STATEHEAD_REPLAY '+JSON.stringify({controls,laps:state.laps,progress:state.bestProgress}));
 }
 const observed={bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,totalSimulationSeconds:state.totalSimulationSeconds,complete:state.complete,lapTimes:state.lapTimes};
 if(JSON.stringify(observed)!==JSON.stringify(choice.expected))throw Error('Fresh full result differs from protected baseline');
 const cuda=M.stats();if(!(cuda.gpuCalls>0)||cuda.cpuFallbacks!==0)throw Error('Actual CUDA execution with no fallback required');
 const comparisons=['vehicle-992.js','rewards.js','simulation.js'].map(name=>{const a=path.join(root,'outputs',name),b=path.join(root,'.impeccable/experimental-penalty5/outputs',name);return {name,appSha256:sha(a),privateSha256:sha(b),same:sha(a)===sha(b)};});
 fs.writeFileSync(path.join(out,'observations.private.json'),JSON.stringify(rows),{flag:'wx'});
 const report={format:'protected-statehead-fresh-replay-v1',passed:true,learningSucceeded:state.laps>=2,modelFile:choice.file,modelSha256:choice.modelSha256,
  expected:choice.expected,observed,controls,cuda,byPass:counters,traceSha256:trace.digest('hex'),sourceComparisons:comparisons,
  observationRows:rows.length,observationsSha256:sha(path.join(out,'observations.private.json')),sourceSha256:sha(__filename),
  boundary:'Distinct protected state-head family with private penalty5 runtime, not the current native202 zero-only795m experiment or user gen64 save. Full fresh body replay; observations are diagnostics, not route/teacher actions. Equal final results do not prove every internal state identical.'};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});fs.copyFileSync(__filename,path.join(out,'replayer-at-run.cjs'));
 console.log('BEST_STATEHEAD_FINISHED '+JSON.stringify(report));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,learningSucceeded:false},null,2),{flag:'wx'});throw error;}
finally{M.closeCuda();}
