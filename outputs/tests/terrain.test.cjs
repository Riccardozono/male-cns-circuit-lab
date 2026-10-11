'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../simulation.js'),V=F.Vehicle,Data=require('../data/terrain.js'),Catalog=require('../data/circuits.json'),Tracks=require('../track-renderer.js'),Legacy=require('../legacy-models.js');
const graph=Legacy.buildV2(require('../data/connectome.json'));
const sim=id=>new F.Simulation(graph,{population:4,circuits:Catalog,circuitId:id,seed:7717});
const car=(speed=0)=>{const c={x:0,y:0,heading:0,speed,distance:0,lifetime:0,pixelsPerMeter:1,vehicle:V.createState()};if(speed)V.synchroniseSpeed(c.vehicle,speed);return c;};
const plane=(gx=0,gy=0,curvature=0)=>({flat:false,sample:(x,y)=>({height:gx*x+gy*y+curvature*x*x*.5,gx:gx+curvature*x,gy,hxx:curvature,hxy:0,hyy:0})});
const run=(c,commands,ground,steps=180)=>{for(let i=0;i<steps;i++)V.step(c,commands,1/60,ground);return c;};
test('Authored profiles are frozen, visibly estimated and have registered anchors',()=>{
  assert.ok(Object.isFrozen(Data.profiles));for(const c of Catalog.circuits){const entry=Data.profiles[c.id];assert.equal(entry.estimated,true);assert.match(entry.reference,/^https:/);for(const [name] of entry.anchors)assert.ok(c.widthStations.some(p=>p.label===name));}
});
for(const id of ['lab','monza','monaco','le-mans'])test(id+': shared surface is finite and closes height and slope at the start/finish',()=>{
  const s=sim(id),ground=V.Terrain.forTrack(s.track),profile=ground.profile,a=profile.at(0),b=profile.at(ground.total);
  assert.deepEqual(a,b);for(let d=0;d<ground.total;d+=5){const p=profile.at(d);assert.ok(Object.values(p).every(Number.isFinite));assert.ok(p.height>=profile.min-1e-7&&p.height<=profile.max+1e-7);assert.ok(Math.abs(p.slope)<.2);}
  for(const p of s.track.center){const q=ground.sample(p.x,p.y);assert.ok(Object.values(q).every(Number.isFinite));assert.ok(q.height>=-1e-6&&q.height<=profile.max-profile.min+1e-6);}
  const before=JSON.stringify(s.track);ground.info();assert.equal(JSON.stringify(s.track),before);assert.equal(ground.info().estimated,true);
});
test('A 10 percent slope applies the analytic gravity projection, not a motor command',()=>{
  const c=car(),ground=plane(.1);V.step(c,[0,0,0],1/240,ground);assert.ok(Math.abs(c.longitudinalAcceleration+V.G*.1/Math.sqrt(1.01))<1e-10);assert.ok(c.vehicle.u<0);assert.equal(c.vehicle.engineTorqueNm,0);
});
test('An unbraked car rolls downhill; a stationary flat car is not moved',()=>{
  const down=run(car(),[0,0,0],plane(-.1)),flat=run(car(),[0,0,0],null);assert.ok(down.x>1&&down.vehicle.u>1);assert.equal(flat.x,0);assert.equal(flat.speed,0);
});
test('Slope changes throttle acceleration and real braking, without changing commands',()=>{
  const up=run(car(20),[0,.65,0],plane(.1),120),down=run(car(20),[0,.65,0],plane(-.1),120);assert.ok(down.speed>up.speed+1);
  const bu=run(car(25),[0,0,.5],plane(.1),60),bd=run(car(25),[0,0,.5],plane(-.1),60);assert.ok(bd.speed>bu.speed);
});
test('Brakes hold a car on a modest slope; yaw and lateral motion are not snapped to a route',()=>{
  const c=run(car(),[0,0,1],plane(.1));assert.ok(Math.abs(c.x)<.02);const side=car();V.step(side,[0,0,0],1/240,plane(0,.1));assert.ok(side.y<0);assert.ok(Math.abs(side.lateralAcceleration+V.G*.1/Math.sqrt(1.01))<1e-10);assert.equal(side.heading,0);
});
test('Vertical curvature unloads a crest and loads a compression; tyre loads remain finite',()=>{
  const crest=car(30),valley=car(30);V.step(crest,[0,0,0],1/240,plane(0,0,-.003));V.step(valley,[0,0,0],1/240,plane(0,0,.003));assert.ok(crest.vehicle.normalG<.85);assert.ok(valley.vehicle.normalG>1.15);
  for(const c of [crest,valley]){assert.ok(c.vehicle.wheels.every(w=>Number.isFinite(w.fz)&&w.fz>=0));const total=V.normalLoads(c.vehicle).reduce((a,b)=>a+b,0);assert.ok(Math.abs(total-(c.vehicle.massKg*c.vehicle.supportAcceleration+c.vehicle.downforceN))<1e-6);}
});
test('Frozen 5.2.0 flat-vehicle motion is preserved independently of the new world sampler',()=>{
  // Measured from vehicle-992.js at tag v5.2.0, commit be0396f; 120 x 1/60 s.
  const cases=[
    [[0,0,0],0,[0,0,0,0,1200,1,29.998600000000124,0,0]],
    [[0,1,0],0,[14.721672455817469,0,0,15.5972948462378,5064.884709563476,1,29.97161517904652,1.0062213920567007,0]],
    [[.4,.7,0],0,[7.436158642035458,3.586534115193455,.7481497274318017,8.582861751306657,2618.0575769289126,1,29.98755562302985,.4486735383127557,.6305734290908788]],
    [[-.4,.7,0],0,[7.436158642035458,-3.5865341151934556,-.7481497274318017,8.582861751306657,2618.0575769289126,1,29.98755562302985,.4486735383127557,-.6305734290908788]],
    [[0,0,1],25,[25.891080346998983,0,0,1.2639628379197188,1200,1,29.998600000000124,-1.1585608579500772,0]],
    [[.2,.4,.6],25,[35.89921186652328,19.850955061065658,1.2044486756215018,18.774907509331467,5597.426089857916,1,29.96796207941011,-.250391019339688,1.2617888952006968]]
  ];for(const [commands,speed,expected] of cases){const c=run(car(speed),commands,null,120),actual=[c.x,c.y,c.heading,c.speed,c.vehicle.rpm,c.vehicle.gear,c.vehicle.fuelL,c.longitudinalG,c.lateralG];for(let i=0;i<expected.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<1e-9,commands+' field '+i);}
});
test('100 cars share the terrain sampler but retain independent finite physical states',()=>{
  const s=sim('monaco');s.population=100;s.reset();const ground=V.Terrain.forTrack(s.track),before=JSON.stringify(s.track);for(let i=0;i<10;i++)s.tick();assert.equal(V.Terrain.forTrack(s.track),ground);assert.equal(JSON.stringify(s.track),before);assert.equal(new Set(s.cars.map(c=>c.vehicle)).size,100);assert.ok(s.cars.every(c=>[c.x,c.y,c.speed,c.vehicle.elevationM,c.vehicle.normalG,...c.outputs].every(Number.isFinite)));
});
test('Scene car bases follow the same surface and never write a physical car',async()=>{
  const T=await import('../vendor/three.module.js'),{placeCar}=await import('../terrain-3d.mjs'),c=car(),before=JSON.stringify(c),object=new T.Object3D();c.x=100;const snapshot=JSON.stringify(c);placeCar(object,c,{x:0,y:0},plane(.1),.04);assert.ok(Math.abs(object.position.y-10.04)<1e-10);const forward=new T.Vector3(1,0,0).applyQuaternion(object.quaternion);assert.ok(Math.abs(forward.y-.1/Math.sqrt(1.01))<1e-10);assert.equal(JSON.stringify(c),snapshot);
});
for(const id of ['lab','monza','monaco','le-mans'])test(id+': vegetation is deterministic, outside road/runoffs, bounded and disposed',async()=>{
  const {buildSceneryPlan,createRoadMask}=await import('../track-scenery.mjs'),{vegetationPlan,createVegetation}=await import('../vegetation.mjs'),{terrainMesh}=await import('../terrain-3d.mjs'),T=await import('../vendor/three.module.js'),s=sim(id),model=Tracks.buildModel(s.track,s.circuit),ground=V.Terrain.forTrack(s.track),origin={x:s.track.bounds.x+s.track.bounds.width/2,y:s.track.bounds.y+s.track.bounds.height/2},scenery=buildSceneryPlan(s.track,model,origin),mask=createRoadMask(s.track),before=JSON.stringify(s.cars);
  const plan=vegetationPlan(s.track,model,scenery,ground);assert.deepEqual(plan,vegetationPlan(s.track,model,scenery,ground));assert.ok(plan.plants.length>20&&plan.plants.length<=plan.budget);
  for(const p of plan.plants)for(let j=0;j<12;j++)assert.equal(mask(p.x+Math.cos(j*Math.PI/6)*p.radius,p.y+Math.sin(j*Math.PI/6)*p.radius),false);
  const terrain=terrainMesh(s.track,new T.MeshLambertMaterial(),ground),drawGround={...ground,visualHeight:(x,y)=>terrain.userData.heightAt(x,y)/ground.ppm},plants=createVegetation(s.track,model,scenery,drawGround,origin);assert.ok(plants.info().drawCalls<=3&&plants.info().triangles<200000);for(const p of plants.plan.plants)assert.ok(Math.abs(p.groundY-terrain.userData.heightAt(p.x,p.y))<1e-8);
  plants.setVisible(false);assert.equal(plants.group.visible,false);plants.dispose();assert.equal(plants.group.children.length,0);terrain.geometry.dispose();terrain.material.dispose();assert.equal(JSON.stringify(s.cars),before);
});
test('Terrain and vegetation shipping dependencies exist, and physics has no neural route decoder',()=>{
  const pkg=require('../../package.json');for(const file of ['outputs/terrain.js','outputs/terrain-3d.mjs','outputs/vegetation.mjs','outputs/data/terrain.js'])assert.ok(pkg.build.files.includes(file));const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');assert.ok(html.indexOf('src="terrain.js"')<html.indexOf('src="vehicle-992.js"'));assert.equal(F.PHYSICS_SENSOR_COUNT,17);
});
