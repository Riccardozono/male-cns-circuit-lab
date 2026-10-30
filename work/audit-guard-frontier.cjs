'use strict';
const fs=require('node:fs'),path=require('node:path'),G=require('./guard-memory-runtime.cjs'),H=require('./guard-memory-checkpoint.cjs');
const source=path.join(G.root,'.impeccable/review/neural-local-rbf/coverage-guard4-next/checkpoint.json'),{saved,sim}=H.load(source),rows=[];let tick=0;
const runtime={...G.F,drive(track,car,commands,dt){
  if(tick%6===0){const loc=G.F.locate(track,car.x,car.y),features=G.M.vector(Array.from(car.brain.policyFeatures),saved.centres);
    rows.push({seconds:tick*dt,progressM:car.bestProgress/(track.pixelsPerMeter||1),x:car.x,y:car.y,heading:car.heading,speedKmh:car.speed/(track.pixelsPerMeter||1)*3.6,commands:commands.slice(),memory:car.brain.decoderMemory.slice(),segment:loc.segmentIndex,along:loc.along,offset:loc.signedDistance??loc.distance,vehicle:{u:car.vehicle.u,v:car.vehicle.v,r:car.vehicle.r,steerAngle:car.vehicle.steerAngle,engineRpm:car.vehicle.engineRpm,gear:car.vehicle.gear},features:features.map((value,kernel)=>({value,kernel})).sort((a,b)=>b.value-a.value).slice(0,8)});}
  tick++;return G.F.drive(track,car,commands,dt);
}};
const episode=G.M.replay(sim.track,sim.graph,saved.baseGenome,saved.centres,saved.championWeights,{decay:saved.decay,runtime,trace:true}),last=rows.slice(-80),activity=saved.centres.map((c,k)=>({kernel:k,radius:c.radius,steering:saved.championWeights[k*2],longitudinal:saved.championWeights[k*2+1],peak:Math.max(...last.map(row=>row.features.find(f=>f.kernel===k)?.value||0))})).sort((a,b)=>b.peak-a.peak);
const report={sourceSha256:G.C.hashFile(source),result:episode.result,pixelsPerMeter:sim.track.pixelsPerMeter,lateActiveKernels:activity.slice(0,12),lateFrames:last,boundary:'Read-only actual from-line replay. Route progress appears only in diagnostic records and reward, never in decoder inputs.'};
const output=path.join(G.root,'.impeccable/review/neural-local-rbf/frontier-audit');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({result:report.result,pixelsPerMeter:report.pixelsPerMeter,lateActiveKernels:report.lateActiveKernels,lateFrames:last.filter((_,j)=>j%10===0||j===last.length-1)},null,2));
