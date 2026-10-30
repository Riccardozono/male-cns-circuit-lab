'use strict';
// Re-evaluate a validated private neural family in the declared current body.
const fs=require('node:fs'),path=require('node:path'),E=require('./current-statehead-environment.cjs');
const root=path.resolve(__dirname,'..'),tag=process.argv[2];
if(!tag||!/^[A-Za-z0-9-]+$/.test(tag))throw Error('A new scoped report tag is required.');
const footprint=process.argv.find(s=>s.startsWith('--footprint='))?.split('=')[1]||'on';
const paceMode=process.argv.find(s=>s.startsWith('--pace='))?.split('=')[1]||'strict';
const output=path.join(root,'.impeccable/review/learning-ml',tag);
if(fs.existsSync(output))throw Error('Preserve existing replay evidence.');
let directoryCreated=false;
try{
  const env=E.create({footprint,paceMode}),identity={...env.identity,harnessSha256:E.sha(fs.readFileSync(__filename))};
  if(process.argv.includes('--preflight'))console.log('CURRENT_PHYSICS_PREFLIGHT '+JSON.stringify(identity));
  else{
    fs.mkdirSync(output);directoryCreated=true;
    const trace=require('node:crypto').createHash('sha256'),samples=[];let controls=0,last=performance.now(),state=env.state();
    while(!state.complete&&controls<50000){
      state=env.step();controls++;const c=state.car;
      trace.update(JSON.stringify([controls,c.x,c.y,c.heading,c.outputs,c.bestProgress,c.laps])+'\n');
      if(controls%100===0||state.complete)samples.push({controls,progress:c.bestProgress,laps:c.laps,speedMps:c.vehicle.speedMps,outputs:c.outputs.slice(),reason:state.reason});
      if(performance.now()-last>20000){last=performance.now();console.log('CURRENT_PHYSICS_PROGRESS '+JSON.stringify({controls,progress:c.bestProgress,laps:c.laps}));}
    }
    const result={bestProgress:state.bestProgress,laps:state.laps,fitness:state.fitness,reason:state.reason,seconds:state.totalSimulationSeconds,lapTimes:state.lapTimes,complete:state.complete,censored:!state.complete,controls,paceContinuations:state.car.researchPaceContinuations||0};
    env.verifySources();const gpu=E.stats();if(!(gpu.gpuCalls>0)||gpu.cpuFallbacks!==0)throw Error('Exact CUDA execution required.');
    const report={format:'male-cns-statehead-current-physics-replay-v1',identity,result,gpu,actionTraceSha256:trace.digest('hex'),samples,meetsTwoLapPhysicalGoal:state.complete&&state.laps>=2&&env.currentF.isSafeLearningOutcome(state.car),limits:'Private learned neural decoder, current physical environment. Not a normal app model, save migration, population-learning result or release-readiness proof.'};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
    console.log('CURRENT_PHYSICS_DONE '+JSON.stringify({identity,result,gpuCalls:gpu.gpuCalls,cpuFallbacks:gpu.cpuFallbacks,meetsTwoLapPhysicalGoal:report.meetsTwoLapPhysicalGoal,report:path.join(output,'report.json')}));
  }
}catch(error){if(directoryCreated)fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack},null,2),{flag:'wx'});throw error;}
finally{E.close();}
