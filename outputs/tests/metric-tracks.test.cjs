'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),V=require('../vehicle-992.js'),T=require('../track-renderer.js'),catalog=require('../data/circuits.json');
const baseline=require('./fixtures/metric-source-v463.json');
const make=def=>V.configureTrack(F.makeTrack(def.points,def.halfWidth,true,def.boundaries,def),def.id);
for(const def of catalog.circuits){
  test(def.id+': metric lap length, dimensions and Porsche footprint agree',()=>{
    const t=make(def),c=F.makeCar(t);assert.equal(t.pixelsPerMeter,1);assert.ok(Math.abs(t.total-def.dimensions.lengthMeters)<.00001);
    assert.equal(c.pixelsPerMeter,1);assert.equal(c.scale*24,V.SPEC.lengthM);assert.equal(def.revision,2);
    assert.equal(t.dimensions.coordinateUnit,'metre');assert.equal(t.widthMeters.length,t.center.length);
    assert.equal(def.dimensions.widthEstimated,true);assert.ok(/stim/i.test(def.dimensions.basis));
    assert.match(def.dimensions.lengthSource,/^https:\/\//);assert.match(def.dimensions.profileSha256,/^[a-f0-9]{64}$/);
  });
  test(def.id+': every source point retained by one uniform transform, no corner smoothing',()=>{
    const old=baseline.circuits.find(c=>c.id===def.id),factor=def.uniformScale/old.uniformScale;
    assert.equal(def.points.length,old.points.length);assert.equal(def.sourceSha256,old.sourceSha256);
    def.points.forEach((p,i)=>p.forEach((n,k)=>assert.ok(Math.abs(n-((old.points[i][k]-140)*factor+140))<=.000001)));
  });
  test(def.id+': estimated width profile covers 100% of the lap and interpolates periodically',()=>{
    const t=make(def),a=t.widthStations;assert.equal(a[0].alongMeters,0);assert.ok(a.length>=19);
    a.forEach((s,i)=>{assert.equal(s.estimated,true);assert.ok(s.endMeters>s.alongMeters);assert.ok(Math.abs(s.endMeters-(a[i+1]?.alongMeters??t.total))<.00001);assert.equal(F.trackWidthAt(t,s.alongMeters).label,s.label,'exact station selects its own label, not the previous floating-point interval');});
    let last=F.trackWidthAt(t,0).widthMeters;
    for(let d=1;d<t.total;d+=1){const w=F.trackWidthAt(t,d);assert.ok(w.widthMeters>=def.dimensions.widthRangeMeters[0]-.00001&&w.widthMeters<=def.dimensions.widthRangeMeters[1]+.00001);assert.ok(Math.abs(w.widthMeters-last)<.3,'continuous width transitions');last=w.widthMeters;}
    assert.ok(Math.abs(F.trackWidthAt(t,-.00001).widthMeters-F.trackWidthAt(t,.00001).widthMeters)<.00001);
    assert.equal(F.trackWidthAt(t,0).widthMeters,F.trackWidthAt(t,t.total).widthMeters);
    const m=T.buildModel(t,def);for(let d=0;d<t.total;d+=13)assert.ok(Math.abs(T.halfWidthAt(m,d)*2-F.trackWidthAt(t,d).widthMeters)<1e-8);
  });
  test(def.id+': wall rays measure the variable road, not a fixed-width or centreline cue',()=>{
    const t=make(def),hits=[];
    for(let i=0;i<t.center.length;i+=17){const c=F.makeCar(t),p=t.center[i],q=t.center[(i+1)%t.center.length];Object.assign(c,p,{heading:Math.atan2(q.y-p.y,q.x-p.x)});
      assert.equal(F.onRoad(t,c.x,c.y),true);assert.equal(F.collided(t,c),false);
      const l=F.raycast(t,c.x,c.y,c.heading-Math.PI/2),r=F.raycast(t,c.x,c.y,c.heading+Math.PI/2);
      assert.ok(l>1&&r>1&&l<15&&r<15);hits.push(l+r);
      assert.deepEqual(F.sensorDistances(t,c),F.ANGLES.map(a=>F.raycast(t,c.x,c.y,c.heading+a)));
      // Changing observation-only width labels/stations cannot affect sensors.
      const before=[...F.sense(t,c),...F.roadSense(t,c)];const labels=t.widthStations;t.widthStations=[];
      assert.deepEqual([...F.sense(t,c),...F.roadSense(t,c)],before);t.widthStations=labels;
    }
    assert.ok(Math.max(...hits)-Math.min(...hits)>1,'ray-sensed road width actually varies');
    assert.equal(F.onRoad(t,t.bounds.x,t.bounds.y),false);
    assert.equal(F.onRoad(t,t.inner[0].x,t.inner[0].y-100000),false);
  });
}
test('Variable corridor detects an outside car even without a wall crossing',()=>{
  const def=catalog.circuits[0],t=make(def),c=F.makeCar(t);c.x=t.bounds.x;c.y=t.bounds.y;
  assert.equal(F.collided(t,c),false);F.drive(t,c,[0,0,0]);assert.equal(c.reason,'fuori pista');assert.equal(c.alive,false);
});
test('Wide section never uses the legacy distance-to-centre termination',()=>{
  const points=[[0,0],[100,0],[100,100],[0,100]],boundaries=[[[-10,-10],[110,-10],[110,110],[-10,110]],[[10,10],[90,10],[90,90],[10,90]]];
  const t=V.configureTrack(F.makeTrack(points,1,true,boundaries,{widthMeters:[20,20,20,20]})),c=F.makeCar(t);c.x=50;c.y=-7;
  assert.ok(F.locate(t,c.x,c.y).distance>t.halfWidth+5);assert.equal(F.onRoad(t,c.x,c.y),true);F.drive(t,c,[0,0,0]);assert.equal(c.alive,true);
});
test('Monza global width range is sourced; local values remain explicit model estimates',()=>{
  const d=catalog.circuits[0].dimensions;assert.deepEqual(d.documentedWidthRangeMeters,[10,12]);assert.equal(d.widthRangeSource,'https://www.monzanet.it/en/circuit/');
  for(const c of catalog.circuits.slice(1))assert.equal(c.dimensions.documentedWidthRangeMeters,null);
});
test('Malformed variable-width data is rejected before starting a simulation',()=>{
  const d=catalog.circuits[0];assert.throws(()=>F.makeTrack(d.points,d.halfWidth,true,d.boundaries,{widthMeters:[10]}),/non valido/);
});
