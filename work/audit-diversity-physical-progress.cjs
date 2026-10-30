'use strict';
// Observe every actual physics tick of the exported learned policy. The
// wrapper delegates unchanged controls/physics/rewards; diagnostics do not
// enter the actor, optimizer, input history or replay buffer.
const fs=require('node:fs'),path=require('node:path'),Model=require('./neural-frontier-model.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.impeccable/review/neural-sacl/diversity-physical-audit'),file=path.join(root,'.impeccable/review/neural-sacl/diversity-native-model/model.malecns-neural-diversity.json');
if(fs.existsSync(path.join(directory,'report.json')))throw Error('Preserve existing physical diagnosis');fs.mkdirSync(directory,{recursive:true});
const env=Model.create(file),drive=env.runtime.drive.bind(env.runtime),largest=[];let distance=0,positiveProgress=0,reverseProgress=0,ticks=0,exceptions=0,maxException=0;
env.runtime.drive=(track,car,commands,dt)=>{
  const x=car.x,y=car.y,progress=car.progress,segment=car.rewardState.segmentIndex;
  drive(track,car,commands,dt);ticks++;const travelled=Math.hypot(car.x-x,car.y-y),delta=car.progress-progress;
  distance+=travelled;positiveProgress+=Math.max(0,delta);reverseProgress+=Math.max(0,-delta);
  if(delta>travelled*2+.02){
    exceptions++;maxException=Math.max(maxException,delta);
    largest.push({tick:ticks,actualDisplacementM:travelled,creditedProgressM:delta,fromSegment:segment,toSegment:car.rewardState.segmentIndex,progress:car.progress});
    largest.sort((a,b)=>b.creditedProgressM-a.creditedProgressM);largest.splice(10);
  }
};
let state=env.reset();while(!state.complete&&state.ticks<120000)state=env.step();
for(const k of ['bestProgress','fitness','laps','reason','totalSimulationSeconds'])if(state[k]!==env.verificationExpected[k])throw Error('Diagnostic wrapper changed episode: '+k);
const report={passed:true,episode:{bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason,seconds:state.totalSimulationSeconds},actualWorldDisplacementM:distance,
  vehicleDistanceM:state.car.vehicle.distanceM,totalPositiveProjectionProgressM:positiveProgress,totalReverseProjectionProgressM:reverseProgress,
  adjacentProjectionExceptions:exceptions,largestExceptionM:maxException,largestExceptions:largest,actualTicks:ticks,modelSha256:env.modelSha256,sourceSha256:Head.sha(fs.readFileSync(__filename,'utf8')),
  boundary:'Actual per-tick physical displacement and evaluator projection are separate metrics. Adjacent polyline projections can be discontinuous; exceptions are reported, not hidden or called measured travel. No geometry/clock inputs enter the controller, no action/pose assignment, no reward edits or convergence/lap claim.'};
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log('DIVERSITY_PHYSICAL_AUDIT '+JSON.stringify(report));
