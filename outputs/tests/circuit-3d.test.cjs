'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),catalog=require('../data/circuits.json'),data=require('../data/connectome.json'),Legacy=require('../legacy-models.js');
const area=ring=>Math.abs(ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a.x*b.y-b.x*a.y;},0)/2);
test('Kilometre-wide terrain is a backdrop and cannot occlude the physical road or aprons',async()=>{
  const T=await import('../vendor/three.module.js'),{groundMesh}=await import('../circuit-3d.mjs');
  for(const circuit of catalog.circuits){const track=new F.Simulation(Legacy.buildV2(data),{population:1,circuits:catalog,circuitId:circuit.id}).track,mesh=groundMesh(track.bounds,new T.MeshLambertMaterial(),track.pixelsPerMeter||1);
    assert.equal(mesh.material.depthWrite,false);assert.ok(mesh.renderOrder<0);assert.ok(mesh.position.y<0);assert.equal(mesh.geometry.index.count,6);mesh.geometry.dispose();mesh.material.dispose();}
});
for(const circuit of [{id:'lab'},...catalog.circuits])test(circuit.id+': triangulated 3D road is the actual physical corridor',async()=>{
  const {roadGeometry}=await import('../circuit-3d.mjs'),sim=new F.Simulation(Legacy.buildV2(data),{population:4,circuits:catalog,circuitId:circuit.id}),track=sim.track,before=JSON.stringify([track,sim.cars[0].genome]),origin={x:track.bounds.x+track.bounds.width/2,y:track.bounds.y+track.bounds.height/2};
  const geometry=roadGeometry(track,origin),p=geometry.attributes.position,index=geometry.index.array;let trianglesArea=0;
  for(let i=0;i<index.length;i+=3){const a=index[i],b=index[i+1],c=index[i+2];trianglesArea+=Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a)))/2;}
  const expected=area(track.outer)-area(track.inner);assert.ok(Math.abs(trianglesArea-expected)/expected<1e-5,`${trianglesArea} != ${expected}`);
  for(const ring of [track.outer,track.inner])for(let i=0;i<ring.length;i+=Math.max(1,Math.floor(ring.length/30))){const v=ring[i];let nearest=Infinity;for(let j=0;j<p.count;j++)nearest=Math.min(nearest,Math.hypot(p.getX(j)+origin.x-v.x,p.getZ(j)+origin.y-v.y));assert.ok(nearest<.001);}
  assert.equal(JSON.stringify([track,sim.cars[0].genome]),before);geometry.dispose();
});
test('Overview camera fits all track bounds in landscape and narrow windows',async()=>{
  const T=await import('../vendor/three.module.js'),{overviewFit}=await import('../circuit-3d.mjs');
  for(const circuit of catalog.circuits)for(const aspect of [2.6,.78]){
    const track=new F.Simulation(Legacy.buildV2(data),{population:1,circuits:catalog,circuitId:circuit.id}).track,b=track.bounds,yaw=2.3,pitch=.90,d=overviewFit(b,aspect,yaw,pitch),camera=new T.PerspectiveCamera(48,aspect,.05,d*4);
    camera.position.set(Math.sin(yaw)*Math.cos(pitch)*d,Math.sin(pitch)*d,Math.cos(yaw)*Math.cos(pitch)*d);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    for(const x of [-b.width/2,b.width/2])for(const z of [-b.height/2,b.height/2]){const point=new T.Vector3(x,0,z).project(camera);assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,`${circuit.id}, aspect=${aspect}: ${point.toArray()}`);}
  }
});
test('Real road projected extents fill the overview without widening or clipping the physical corridor',async()=>{
  const T=await import('../vendor/three.module.js'),{overviewFit,overviewTarget}=await import('../circuit-3d.mjs');
  for(const circuit of catalog.circuits)for(const aspect of [2.6,1.1,.78]){
    const track=new F.Simulation(Legacy.buildV2(data),{population:1,circuits:catalog,circuitId:circuit.id}).track,b=track.bounds,yaw=2.3,pitch=.90,target=overviewTarget(track,yaw),d=overviewFit(b,aspect,yaw,pitch,48,track.outer,target),camera=new T.PerspectiveCamera(48,aspect,.05,d*4);
    camera.position.set(target.x+Math.sin(yaw)*Math.cos(pitch)*d,Math.sin(pitch)*d,target.z+Math.cos(yaw)*Math.cos(pitch)*d);camera.lookAt(target.x,0,target.z);camera.updateMatrixWorld();
    let minX=1,maxX=-1,minY=1,maxY=-1;
    for(const p of track.outer){const q=new T.Vector3(p.x-b.x-b.width/2,0,p.y-b.y-b.height/2).project(camera);assert.ok(Math.abs(q.x)<1&&Math.abs(q.y)<1);minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);}
    assert.ok(Math.max(maxX-minX,maxY-minY)>1.35,`${circuit.id} road does not fill overview at ${aspect}`);
  }
});
test('Instanced 3D cars keep physical dimensions, 100 independent states and observation-only transforms',async()=>{
  const T=await import('../vendor/three.module.js'),{CarFleet,DIMENSIONS}=await import('../car-3d.mjs');const group=new T.Group(),fleet=new CarFleet(group),sim=new F.Simulation(Legacy.buildV2(data),{population:100}),before=JSON.stringify(sim.cars);
  fleet.update(sim.cars,{x:0,y:0},['#ff7658','#68d3c5']);assert.equal(JSON.stringify(sim.cars),before);assert.ok(fleet.parts.length<40);assert.ok(fleet.parts.every(p=>p.mesh.count===100));assert.ok(fleet.wheels.every(m=>m.count===400));
  for(const part of fleet.parts){part.mesh.geometry.computeBoundingBox();const b=part.mesh.geometry.boundingBox;assert.ok(b.max.x<=DIMENSIONS.length/2+.001&&b.min.x>=-DIMENSIONS.length/2-.001);assert.ok(b.max.z<=DIMENSIONS.width/2+.001&&b.min.z>=-DIMENSIONS.width/2-.001);}
  fleet.dispose();assert.equal(group.children.length,0);
});
