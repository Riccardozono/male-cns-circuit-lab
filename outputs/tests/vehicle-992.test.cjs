'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),V=require('../vehicle-992.js'),F=require('../simulation.js'),D=require('../data/connectome.json'),Legacy=require('../legacy-models.js');
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const car=()=>({x:0,y:0,heading:0,speed:0,_physicsSpeed:0,distance:0,lifetime:0,pixelsPerMeter:1,vehicle:V.createState()});
const run=(c,commands,seconds)=>{for(let i=0;i<Math.round(seconds*60);i++)V.step(c,commands,1/60);return c;};
test('992 GT3 R official configuration, not the road GT3 or Cup',()=>{
  assert.equal(V.SPEC.displacementCc,4194);assert.equal(V.SPEC.maxRpm,9250);assert.equal(V.SPEC.maxPowerW,416000);
  assert.equal(V.SPEC.wheelbaseM,2.507);assert.equal(V.SPEC.lengthM,4.619);assert.equal(V.SPEC.baseMassKg,1265);assert.equal(V.SPEC.gears,6);assert.equal(V.SPEC.drive,'RWD');
  assert.equal(V.SPEC.tankLitres,117);assert.match(V.SPEC.notice,/stime/);
});
test('Estimated torque curve never exceeds nominal power',()=>{
  for(let rpm=1200;rpm<9250;rpm+=10)assert.ok(V.torqueAt(rpm)*rpm*Math.PI/30<=416000+1e-6);
  assert.ok(V.torqueAt(6500)>V.torqueAt(1200));
});
test('No pedals gives exact zero motion, including engine idle',()=>{
  const c=run(car(),[0,0,0],10);assert.deepEqual([c.x,c.y,c.heading,c.speed],[0,0,0,0]);assert.equal(c.vehicle.rpm,1200);
});
test('Full throttle shifts through all six gears and stays below nominal rev limit',()=>{
  const c=run(car(),[0,1,0],30);assert.equal(c.vehicle.gear,6);assert.equal(c.vehicle.shifts,5);assert.ok(c.vehicle.speedMps>70&&c.vehicle.speedMps<100);assert.ok(c.vehicle.rpm<=9250);
  assert.equal(c.y,0);assert.equal(c.heading,0);assert.ok(c.vehicle.enginePowerKw<=416);
});
test('Power is applied only at the rear wheels',()=>{
  const c=run(car(),[0,1,0],2);assert.ok(c.vehicle.wheels[2].fx>500);assert.ok(c.vehicle.wheels[3].fx>500);
  assert.ok(Math.abs(c.vehicle.wheels[0].fx)<Math.abs(c.vehicle.wheels[2].fx));
});
test('Shift has a real torque cut, finite duration and ratio-dependent RPM',()=>{
  const c=run(car(),[0,1,0],2);c.vehicle.gearboxMode='manual';const rpm=c.vehicle.rpm;
  assert.equal(V.requestGear(c.vehicle,2),true);V.step(c,[0,1,0],1/60);assert.equal(c.vehicle.gear,1);assert.equal(c.vehicle.enginePowerKw,0);
  run(c,[0,1,0],.15);assert.equal(c.vehicle.gear,2);assert.ok(c.vehicle.rpm<rpm);assert.equal(c.vehicle.shiftRemaining,0);
});
test('Downshift protection rejects a mechanical overrev',()=>{
  const c=car();V.synchroniseSpeed(c.vehicle,80);c.vehicle.gear=6;c.vehicle.gearboxMode='manual';assert.equal(V.requestGear(c.vehicle,1),false);assert.equal(c.vehicle.shiftRejected,1);
});
test('Neutral cannot drive; reverse is physical and forbidden while moving forward',()=>{
  const n=car();n.vehicle.gear=0;n.vehicle.gearboxMode='manual';run(n,[0,1,0],2);assert.equal(n.vehicle.speedMps,0);
  const r=car();r.vehicle.gear=-1;r.vehicle.gearboxMode='manual';run(r,[0,.5,0],2);assert.ok(r.x<0&&r.vehicle.u<0);
  const moving=car();V.synchroniseSpeed(moving.vehicle,20);assert.equal(V.requestGear(moving.vehicle,-1),false);
});
test('100 km/h braking stops without forcing reverse',()=>{
  const c=car();V.synchroniseSpeed(c.vehicle,100/3.6);c.speed=100/3.6;c._physicsSpeed=c.speed;
  run(c,[0,0,1],6);assert.equal(c.vehicle.speedMps,0);assert.ok(c.distance>20&&c.distance<60);assert.equal(c.vehicle.u,0);
});
test('Coasting loses speed through drag, rolling resistance and engine braking',()=>{
  const c=run(car(),[0,1,0],6),before=c.vehicle.speedMps;run(c,[0,0,0],2);assert.ok(c.vehicle.speedMps<before);
});
test('Combined slip shares the available tyre force, not independent full grip',()=>{
  const straight=V.combinedForce(.1,0,4000,6000),turning=V.combinedForce(.1,.15,4000,6000);
  assert.ok(turning.fx<straight.fx);assert.ok(Math.hypot(turning.fx,turning.fy)<=6000);assert.ok(turning.fy<0);
});
test('Load transfer conserves total normal force and loads rear on acceleration',()=>{
  const s=car().vehicle;s.ax=5;s.ay=8;s.downforceN=3000;const loads=V.normalLoads(s);
  near(loads.reduce((a,b)=>a+b,0),s.massKg*V.G+3000);assert.ok(loads.every(f=>f>0));assert.ok(loads[0]>loads[1]);
  const rear=loads[2]+loads[3];s.ax=0;assert.ok(rear>V.normalLoads(s)[2]+V.normalLoads(s)[3]);
});
test('Opposite steering yields mirrored trajectories without any track data',()=>{
  const a=car(),b=car();run(a,[.15,.65,0],4);run(b,[-.15,.65,0],4);near(a.x,b.x,.02);near(a.y,-b.y,.02);near(a.heading,-b.heading,.002);
  assert.ok(Math.abs(a.vehicle.r)>0&&a.totalG>0);
});
test('Release steering retains yaw inertia rather than snapping onto a path',()=>{
  const c=run(car(),[.1,.7,0],3),yaw=c.vehicle.r;V.step(c,[0,.7,0],1/60);assert.ok(Math.abs(c.vehicle.r)>0);assert.ok(Math.abs(c.vehicle.r-yaw)<1);
});
test('Fuel use changes mass; tyre and brake thermal states respond to work',()=>{
  const c=run(car(),[0,1,0],10),s=c.vehicle;assert.ok(s.fuelL<30&&s.massKg<1265+75+30*.745);assert.ok(s.wheels.some(w=>w.wear>0));
  run(c,[0,0,1],3);assert.ok(s.wheels.some(w=>w.brakeC>25));assert.ok(s.wheels.every(w=>Number.isFinite(w.temperatureC)&&w.pressureBar>1));
});
test('Aerodynamic forces grow quadratically with speed',()=>{
  const a=car(),b=car();V.synchroniseSpeed(a.vehicle,20);V.synchroniseSpeed(b.vehicle,40);a.speed=a._physicsSpeed=20;b.speed=b._physicsSpeed=40;
  V.step(a,[0,0,0],1/240);V.step(b,[0,0,0],1/240);near(b.vehicle.downforceN/a.vehicle.downforceN,4,1e-6);near(b.vehicle.dragN/a.vehicle.dragN,4,1e-6);
});
test('Metric conversion changes only coordinates, not physical acceleration',()=>{
  const a=car(),b=car();b.pixelsPerMeter=2.5;run(a,[0,.7,0],4);run(b,[0,.7,0],4);near(b.x,a.x*2.5);near(a.vehicle.speedMps,b.vehicle.speedMps);near(a.longitudinalG,b.longitudinalG);
});
test('Published track lengths calibrate all maps without altering road polygons',()=>{
  for(const def of require('../data/circuits.json').circuits){const t=F.makeTrack(def.points,def.halfWidth,true,def.boundaries),before=JSON.stringify([t.center,t.outer,t.inner]);V.configureTrack(t,def.id);assert.equal(JSON.stringify([t.center,t.outer,t.inner]),before);near(t.total/t.pixelsPerMeter,V.CIRCUIT_METRICS[def.id].lengthM);}
});
test('Powertrain sensors are real measurements appended to the old road order',()=>{
  const sim=new F.Simulation(Legacy.buildV2(D),{population:1}),c=sim.cars[0];c.vehicle.rpm=4625;c.vehicle.gear=3;
  const inputs=F.physicsSense(c,sim.track);assert.equal(inputs.length,17);near(inputs[11],.5);near(inputs[12],.5);assert.equal(sim.graph.learning.length,202);
});
test('Manually edited episodes are excluded from learning and champion selection',()=>{
  const sim=new F.Simulation(Legacy.buildV2(D),{population:4});sim.cars[0].diagnosticVehicle=true;sim.cars[0].laps=2;sim.cars[0].bestProgress=99999;
  const unedited=F.cloneGenome(sim.cars[1].genome);for(let i=0;i<60;i++)for(const c of sim.cars)F.drive(sim.track,c,[0,c.id===1?.7:0,0]);sim.evolve();assert.equal(sim.history[0].laps,0);assert.deepEqual(sim.champion,unedited);assert.equal(sim.optimizer.episodes,3);assert.ok(sim.cars.every(c=>!c.diagnosticVehicle));
});
test('All edited episodes restart without an optimizer update',()=>{
  const sim=new F.Simulation(Legacy.buildV2(D),{population:4});for(const c of sim.cars)c.diagnosticVehicle=true;sim.evolve();assert.equal(sim.generation,2);assert.equal(sim.history.length,0);assert.equal(sim.optimizer.updates,0);
});
test('Invalid time step fails closed',()=>{
  for(const value of [0,-1,NaN,.2])assert.throws(()=>V.step(car(),[0,1,0],value),/Passo fisico/);
});
test('TC actually reduces shaft torque from measured rear slip',()=>{
  for(const enabled of [true,false]){
    const c=car();c.vehicle.tcEnabled=enabled;let active=0,min=1;
    for(let i=0;i<300;i++){V.step(c,[0,1,0],1/60);active+=Number(c.vehicle.tcActive);min=Math.min(min,c.vehicle.tcFactor);}
    if(enabled){assert.ok(active>0);assert.ok(min<.98);}else{assert.equal(active,0);assert.equal(min,1);}
  }
});
test('ABS releases individual brakes and prevents sustained wheel lock',()=>{
  const results=[];
  for(const enabled of [true,false]){
    const c=car();V.synchroniseSpeed(c.vehicle,100/3.6);c.speed=c._physicsSpeed=100/3.6;c.vehicle.absEnabled=enabled;let active=0,minimumSlip=0;
    for(let i=0;i<120;i++){V.step(c,[.2,0,1],1/60);active+=Number(c.vehicle.absActive);if(c.vehicle.speedMps>5)minimumSlip=Math.min(minimumSlip,...c.vehicle.wheels.map(w=>w.slip));}
    results.push({active,minimumSlip});
  }
  assert.ok(results[0].active>0&&results[0].minimumSlip>-.2);assert.equal(results[1].active,0);assert.ok(results[1].minimumSlip<-.9);
});
test('Repeated aggressive steering and braking stay finite with or without aids',()=>{
  for(let seed=1;seed<=32;seed++){
    const c=car();c.vehicle.absEnabled=seed%2===0;c.vehicle.tcEnabled=seed%3===0;let state=seed,commands=[0,1,0];
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    for(let tick=0;tick<1800;tick++){
      if(tick%30===0){const pedal=random();commands=[random()*2-1,pedal>.3?pedal:0,pedal<=.3?1-pedal:0];}
      V.step(c,commands,1/60);
      assert.ok([c.x,c.y,c.heading,c.vehicle.speedMps,c.vehicle.rpm,c.totalG].every(Number.isFinite));
      for(const w of c.vehicle.wheels)assert.ok(Math.hypot(w.fx,w.fy)<=w.grip+1e-6);
    }
  }
});
test('Terminated cars have zero body/wheel speeds, with last force sample retained',()=>{
  const c=run(car(),[.1,.7,0],3),force=c.totalG;V.stop(c);
  assert.equal(c.vehicle.speedMps,0);assert.equal(c.speed,0);assert.equal(c.velocityX,0);assert.equal(c.vehicle.r,0);assert.ok(c.vehicle.wheels.every(w=>w.omega===0));assert.equal(c.totalG,force);
  const sim=new F.Simulation(D,{population:1}),agent=sim.cars[0];for(let i=0;i<1200&&agent.alive;i++)F.drive(sim.track,agent,[0,1,0]);
  assert.equal(agent.alive,false);assert.equal(agent.vehicle.speedMps,0);assert.equal(agent.speed,0);
});
test('Map scale bar measures metres with the same per-track metric conversion',()=>{
  const T=require('../track-renderer.js');for(const ppm of [.445,1,1.106,2.502]){const bar=T.metricScale(4,ppm);near(bar.pixels,bar.metres*ppm*4);assert.ok(bar.pixels<=86&&bar.pixels>=30);}
});
