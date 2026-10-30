'use strict';
// Observes every physical step; does not change physics, actions or scoring.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),
  M=require('./neural-context-motor.cjs'),I=require('./neural-research-source-identity.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  input=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-safe-cem-20261024-01/checkpoint.private.json'),bytes=fs.readFileSync(input),checkpoint=JSON.parse(bytes),
  priorFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-retention-20261024-01/report.json'),prior=JSON.parse(fs.readFileSync(priorFile,'utf8')),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-progress-audit-20261024-01');
if(fs.existsSync(out))throw Error('Preserve progress audit');
const sim=P.setup(),records=[];
function nearest(track,x,y){let closest={distance:Infinity};track.segments.forEach((seg,index)=>{
  const dx=seg.b.x-seg.a.x,dy=seg.b.y-seg.a.y,t=F.clamp(((x-seg.a.x)*dx+(y-seg.a.y)*dy)/(dx*dx+dy*dy),0,1),px=seg.a.x+t*dx,py=seg.a.y+t*dy,distance=Math.hypot(x-seg.a.x-t*dx,y-seg.a.y-t*dy);
  if(distance<closest.distance)closest={index,t,x:px,y:py,distance,along:seg.start+t*seg.length};
});const original=F.locate(track,x,y);assert.equal(closest.along,original.along);assert.equal(closest.distance,original.distance);return closest;}
for(const retention of [.98,.9875,.99]){
  const tail=[],invalid=[],spec={...checkpoint.best.spec,retention};let ticks=0;
  const runtime=M.wrap({...F,drive(track,car,commands,dt=F.DT){
    const before={x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle.speedMps,along:car.rewardState.along,previousX:car.rewardState.x,previousY:car.rewardState.y,
      invalidSteps:car.rewardState.invalidSteps,nearest:nearest(track,car.x,car.y)};
    // Native stop is not intercepted: post-stop body speed is distinguished
    // from prior speed, and geometric motion is always measured directly.
    F.drive(track,car,commands,dt);
    const after={x:car.x,y:car.y,heading:car.heading,speedMps:car.vehicle.speedMps,along:car.rewardState.along,nearest:nearest(track,car.x,car.y),
      invalidSteps:car.rewardState.invalidSteps,onRoad:F.onRoad(track,car.x,car.y),collision:F.collided(track,car),reason:car.reason},
      moved=Math.hypot(car.x-before.previousX,car.y-before.previousY),delta=after.nearest.along-before.along,ppm=track.pixelsPerMeter||1;
    let wrapped=delta;if(wrapped>track.total/2)wrapped-=track.total;if(wrapped< -track.total/2)wrapped+=track.total;
    const row={tick:ticks++,before,after,moved,chainageDelta:wrapped,allowedDelta:moved*2+.02*ppm,maxBodyStep:120*ppm*dt+1e-6*ppm,
      commands:commands.slice(),fitness:car.fitness,progress:car.bestProgress,invalid:after.invalidSteps>0};
    tail.push(row);if(tail.length>16)tail.shift();if(row.invalid)invalid.push(row);
  }},sim.graph,spec),run=fullRollout(runtime,sim.track,sim.graph,checkpoint.genome,{rewardRevision:'progress-3'}),result=outcome(F,run),expected=prior.cases.find(c=>c.spec.retention===retention).outcome;
  assert.deepEqual(result,expected);records.push({retention,result,invalid,tail});
}
const report={format:'private-neural-context-progress-audit-v1',passed:true,created:new Date().toISOString(),records,
  checkpointSha256:I.sha(bytes),priorReportSha256:I.sha(fs.readFileSync(priorFile)),sourceHashes:I.collect(['work/audit-neural-context-progress.cjs']),
  boundary:'Observation-only native episodes exactly reproduce prior outcomes. No scoring correction, extra progress, topology exception or action intervention.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log('PROGRESS_AUDIT '+JSON.stringify({passed:true,records:records.map(c=>({retention:c.retention,result:c.result,invalid:c.invalid.map(x=>({tick:x.tick,moved:x.moved,delta:x.chainageDelta,allowed:x.allowedDelta,
  previousSegment:x.before.nearest.index,newSegment:x.after.nearest.index,onRoad:x.after.onRoad,collision:x.after.collision,invalidSteps:x.after.invalidSteps}))})),
  report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
