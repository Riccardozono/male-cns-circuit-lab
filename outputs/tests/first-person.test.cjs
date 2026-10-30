'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../simulation.js'),L=require('../legacy-models.js'),data=require('../data/connectome.json'),catalog=require('../data/circuits.json');
test('Driver camera faces the selected car heading, not a track trajectory',async()=>{
  const {driverCameraFrame}=await import('../circuit-3d.mjs');
  for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,1.34]){
    const car={id:91,x:10,y:20,heading,pixelsPerMeter:1,vehicle:{pitch:0,roll:0}},before=JSON.stringify(car),pose=driverCameraFrame(car,{x:2,y:3});
    assert.ok(Math.abs(pose.forward.x-Math.cos(heading))<1e-10);assert.ok(Math.abs(pose.forward.z-Math.sin(heading))<1e-10);assert.ok(Math.abs(pose.forward.y)<1e-10);
    assert.ok(pose.position.y>1&&pose.position.y<1.3);assert.equal(JSON.stringify(car),before);
  }
});
test('Driver camera follows translations and metric scale exactly',async()=>{
  const {driverCameraFrame}=await import('../circuit-3d.mjs');
  const car={id:7,x:100,y:200,heading:.23,pixelsPerMeter:2,vehicle:{pitch:0,roll:0}},origin={x:50,y:90};
  const a=driverCameraFrame(car,origin),b=driverCameraFrame({...car,x:115,y:193},origin);
  assert.ok(Math.abs(b.position.x-a.position.x-15)<1e-10);assert.ok(Math.abs(b.position.z-a.position.z+7)<1e-10);
  assert.ok(a.position.y>2&&a.position.y<2.5);assert.ok(Math.abs(a.target.distanceTo(a.position)-60)<1e-9);
});
test('Driver camera observes terrain grade and body pitch/roll without state mutation',async()=>{
  const {driverCameraFrame}=await import('../circuit-3d.mjs'),{Terrain}=await import('../terrain-3d.mjs');
  for(const circuitId of ['monza','monaco','le-mans']){
    const sim=new F.Simulation(L.buildV2(data),{population:4,circuits:catalog,circuitId}),car=sim.cars[2];car.vehicle.pitch=.06;car.vehicle.roll=-.07;
    const before=JSON.stringify({car,track:sim.track,history:sim.history}),pose=driverCameraFrame(car,{x:0,y:0},Terrain.forTrack(sim.track));
    assert.ok([...pose.position.toArray(),...pose.forward.toArray(),...pose.up.toArray()].every(Number.isFinite));assert.ok(Math.abs(pose.up.length()-1)<1e-10);
    assert.equal(JSON.stringify({car,track:sim.track,history:sim.history}),before);
  }
});
test('Head look modifies only camera direction, and cached pose storage is reused',async()=>{
  const {driverCameraFrame,createDriverPose}=await import('../circuit-3d.mjs'),car={id:1,x:0,y:0,heading:0,pixelsPerMeter:1,vehicle:{pitch:0,roll:0}},cache=createDriverPose();
  const first=driverCameraFrame(car,{x:0,y:0},null,0,0,cache),position=first.position.clone(),forward=first.forward.clone();
  const next=driverCameraFrame(car,{x:0,y:0},null,.3,.1,cache);
  assert.equal(next,cache);assert.ok(next.position.distanceTo(position)<1e-10);assert.ok(next.forward.distanceTo(forward)>.2);
});
test('Only exterior bodies enclosing the driver eye are hidden, without mutating ghost agents',async()=>{
  const {obscuresDriverEye}=await import('../car-3d.mjs');
  const chosen={id:91,x:0,y:0,heading:0,pixelsPerMeter:1},cars=[chosen,{...chosen,id:4},{...chosen,id:5,x:6},{...chosen,id:6,y:3}],before=JSON.stringify(cars);
  assert.deepEqual(cars.map(car=>obscuresDriverEye(car,chosen)),[true,true,false,false]);assert.equal(JSON.stringify(cars),before);
});
test('Fallback fleet hides the observed exterior, but retains the actual population count',async()=>{
  const T=await import('../vendor/three.module.js'),{CarFleet}=await import('../car-3d.mjs'),group=new T.Group(),fleet=new CarFleet(group),sim=new F.Simulation(L.buildV2(data),{population:4});
  for(let i=0;i<4;i++)sim.cars[i].x=i*8;const before=JSON.stringify(sim.cars);
  fleet.update(sim.cars,{x:0,y:0},['#ff7658'],{selected:sim.cars[1],mode:'first-person'});
  assert.equal(fleet.carCount,4);assert.equal(fleet.renderedCars,3);assert.ok(fleet.parts.every(p=>p.mesh.count===3));assert.equal(JSON.stringify(sim.cars),before);
  fleet.update(sim.cars,{x:0,y:0},['#ff7658'],{selected:sim.cars[1],mode:'follow'});assert.ok(fleet.parts.every(p=>p.mesh.count===4));fleet.dispose();
});
test('First-person reset, zoom and look keep the mode and never move the physical car',async()=>{
  const T=await import('../vendor/three.module.js'),{Circuit3D}=await import('../circuit-3d.mjs');
  const view=Object.create(Circuit3D.prototype);Object.assign(view,{camera:new T.PerspectiveCamera(48,1,.03,2000),focus:new T.Vector3(),firstPersonFov:70,onChange(){}});
  view.setMode('first-person');view.look(9999,-9999);view.zoom(100);assert.equal(view.mode,'first-person');assert.equal(view.camera.fov,40);assert.ok(view.lookYaw<=1.4&&view.lookPitch<=.5);
  view.reset();assert.equal(view.mode,'first-person');assert.equal(view.camera.fov,70);assert.equal(view.lookYaw,0);assert.equal(view.lookPitch,0);
  view.setMode('follow');assert.equal(view.camera.fov,48);view.setMode('overview');assert.equal(view.camera.fov,48);
});
