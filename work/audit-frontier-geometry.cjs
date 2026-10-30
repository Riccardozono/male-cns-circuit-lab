'use strict';
// Read-only replay and static map measurements, never learning observations.
const fs=require('node:fs'),path=require('node:path'),Live=require('./neural-context-live.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.impeccable/review/neural-sacl/frontier-geometry');
if(fs.existsSync(path.join(dir,'report.json')))throw Error('Preserve existing diagnosis');fs.mkdirSync(dir,{recursive:true});
const env=Live.create(path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json')),F=env.runtime,t=env.track;
const point=s=>{const seg=t.segments.find(v=>v.start+v.length>=s)||t.segments.at(-1),u=(s-seg.start)/seg.length;return {x:seg.a.x+u*(seg.b.x-seg.a.x),y:seg.a.y+u*(seg.b.y-seg.a.y)};};
function radius(s){const a=point(s-5),b=point(s),c=point(s+5),ab=Math.hypot(a.x-b.x,a.y-b.y),bc=Math.hypot(b.x-c.x,b.y-c.y),ac=Math.hypot(a.x-c.x,a.y-c.y),area=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;return area>1e-12?ab*bc*ac/(4*area):null;}
let state=env.reset(),last=[],sampled=[],next=1800;
while(!state.complete&&state.ticks<120000){
  state=env.step();const c=state.car,near=F.locate(t,c.x,c.y),seg=t.segments.find(v=>v.start+v.length>=near.along),tangent=Math.atan2(seg.b.y-seg.a.y,seg.b.x-seg.a.x);
  const row={progress:c.bestProgress,along:near.along,x:c.x,y:c.y,centreDistance:near.distance,
    heading:c.heading,headingError:Math.atan2(Math.sin(c.heading-tangent),Math.cos(c.heading-tangent)),
    speedKmh:c.vehicle.speedMps*3.6,outputs:c.outputs.slice(),steeringAngle:c.vehicle.steeringAngle,engineTorqueNm:c.vehicle.engineTorqueNm,
    clutch:c.vehicle.clutch,gear:c.vehicle.gear,grade:c.vehicle.roadGradePercent,gravityX:c.vehicle.gravityX,
    raysMetres:F.sensorDistances(t,c),onRoad:F.onRoad(t,c.x,c.y),bodyCollision:F.collided(t,c),alive:c.alive,reason:c.reason};
  if(c.bestProgress>1800){last.push(row);if(last.length>15)last.shift();}
  if(c.bestProgress>=next){sampled.push(row);next+=25;}
}
const geometry=[];for(let s=1800;s<=2120;s+=5)geometry.push({along:s,estimatedRadiusM:radius(s),widthM:F.trackWidthAt(t,s).widthMeters});
const nearbyVertices=t.segments.filter(v=>v.start>1980&&v.start<2050).map(v=>v.start);
const report={verifiedEpisode:{bestProgress:state.bestProgress,fitness:state.fitness,laps:state.laps,reason:state.reason},sampled,last,geometry,nearbyVertices,
  sourceHashes:{runtime:Head.sha(fs.readFileSync(path.join(__dirname,'neural-context-live.cjs'),'utf8')),map:Head.sha(fs.readFileSync(path.join(root,'outputs/data/circuits.json'),'utf8'))},
  boundary:'Closed-loop replay of the fixed learned model and measurements of the existing approximate metric map. Diagnostic body, centreline and geometry fields never enter the policy, replay buffer or optimizer. No prescribed action, fictitious driving trajectory, awarded progress, circuit edits or claim of surveyed corner radii.'};
fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));
console.log('FRONTIER_GEOMETRY '+JSON.stringify({episode:report.verifiedEpisode,last:report.last.at(-1),minimumStaticRadiusM:Math.min(...geometry.map(v=>v.estimatedRadiusM??Infinity)),vertices:nearbyVertices}));
