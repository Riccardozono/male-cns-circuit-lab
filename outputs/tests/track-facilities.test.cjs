'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../simulation.js'),Legacy=require('../legacy-models.js'),Tracks=require('../track-renderer.js'),Catalog=require('../data/circuits.json'),graph=Legacy.buildV2(require('../data/connectome.json'));
async function fixture(id){
  const T=await import('../vendor/three.module.js'),M=await import('../track-facilities.mjs'),{buildSceneryPlan}=await import('../track-scenery.mjs'),{terrainMesh}=await import('../terrain-3d.mjs');
  const sim=new F.Simulation(graph,{population:4,circuits:Catalog,circuitId:id,seed:59113}),before=JSON.stringify({track:sim.track,cars:sim.cars,rng:sim.rng}),model=Tracks.buildModel(sim.track,sim.circuit),origin={x:sim.track.bounds.x+sim.track.bounds.width/2,y:sim.track.bounds.y+sim.track.bounds.height/2},ground=F.Vehicle.Terrain.forTrack(sim.track),terrain=terrainMesh(sim.track,new T.MeshLambertMaterial(),ground),drawn={...ground,visualHeight:(x,y)=>terrain.userData.heightAt(x,y)/ground.ppm},scenery=buildSceneryPlan(sim.track,model,origin);
  return {T,M,sim,before,model,origin,terrain,drawn,scenery,dispose(){terrain.geometry.dispose();terrain.material.dispose();}};
}
for(const id of ['lab','monza','monaco','le-mans'])test(id+': deterministic stands, pits and gantry avoid road/runoffs and reserve grounded footprints',async()=>{
  const f=await fixture(id),{M,sim,model,scenery,drawn,origin}=f,plan=M.buildFacilitiesPlan(sim.track,model,scenery,drawn),ppm=sim.track.pixelsPerMeter||1,blocked=M.facilityExclusionMask(sim.track,scenery);
  assert.deepEqual(plan,M.buildFacilitiesPlan(sim.track,model,scenery,drawn));assert.ok(plan.placements.filter(p=>p.kind==='stand').length>0);assert.equal(plan.placements.filter(p=>p.kind==='pit').length,1);assert.ok(plan.gantry);assert.equal(plan.estimated,true);
  for(const p of plan.placements){assert.ok(Number.isFinite(p.groundY)&&p.groundY>=p.minY);for(let u=-p.width/2;u<=p.width/2;u+=1)for(let v=-p.depth/2;v<=p.depth/2;v+=1){const q=M.facilityPoint(p,u*ppm,v*ppm);assert.equal(blocked(q.x,q.y),false,p.name);assert.ok(drawn.visualHeight(q.x,q.y)*ppm<=p.groundY+.01);}if(p.kind==='board'){assert.equal(p.registrationShiftMeters,0);const station=sim.track.widthStations.find(s=>s.label===p.station);const expected=((station.alongMeters-p.distance)*ppm%model.center.total+model.center.total)%model.center.total;assert.ok(Math.abs(p.along-expected)<1e-7);}}
  for(let i=0;i<plan.placements.length;i++)for(let j=i+1;j<plan.placements.length;j++){const a=plan.placements[i],b=plan.placements[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+ppm);}
  assert.equal(JSON.stringify({track:sim.track,cars:sim.cars,rng:sim.rng}),f.before);f.dispose();
});
test('Facilities give houses and vegetation exclusive space without altering input state',async()=>{
  const f=await fixture('monaco'),{buildingPlan}=await import('../buildings.mjs'),{vegetationPlan}=await import('../vegetation.mjs'),plan=f.M.buildFacilitiesPlan(f.sim.track,f.model,f.scenery,f.drawn),ppm=f.sim.track.pixelsPerMeter||1,houses=buildingPlan(f.sim.track,f.model,f.scenery,f.drawn,[.7,1,.65],plan.placements),plants=vegetationPlan(f.sim.track,f.model,f.scenery,f.drawn,[...plan.placements,...houses.placements]);
  assert.ok(houses.placements.length>20&&plants.plants.length>20);for(const h of houses.placements)for(const p of plan.placements)assert.ok(Math.hypot(h.x-p.x,h.y-p.y)>=h.radius+p.radius+3*ppm);for(const tree of plants.plants)for(const p of plan.placements)assert.ok(Math.hypot(tree.x-p.x,tree.y-p.y)>=tree.radius+p.radius+ppm);assert.equal(JSON.stringify({track:f.sim.track,cars:f.sim.cars,rng:f.sim.rng}),f.before);f.dispose();
});
test('Seat detail starts correctly, changes only with camera proximity, and uses three shared draw batches',async()=>{
  const f=await fixture('monza'),v=f.M.createTrackFacilities(f.sim.track,f.model,f.scenery,f.drawn,f.origin),camera={position:new f.T.Vector3(1e6,1e6,1e6)};
  v.update(camera);assert.equal(v.info().seatInstances,0);assert.equal(v.info().nearStands,0);assert.ok(v.info().seats>1000&&v.info().drawCalls<=3);
  const p=v.plan.placements.find(p=>p.kind==='stand');camera.position.set(p.x-f.origin.x,p.groundY+5,p.y-f.origin.y);v.update(camera);assert.ok(v.info().nearStands>0&&v.info().seatInstances>0);const detail=v.group.children.find(m=>m.name==='individual-seat-lod'),version=detail.instanceMatrix.version;v.update(camera);assert.equal(detail.instanceMatrix.version,version);
  camera.position.set(1e6,1e6,1e6);v.update(camera);assert.equal(v.info().seatInstances,0);v.setVisible(false);assert.equal(v.info().visible,false);v.setVisible(true);assert.ok(v.focuses.some(p=>p.kind==='pit'));
  let geometryFreed=0,materialFreed=0,buffersFreed=0;v.group.children[0].geometry.addEventListener('dispose',()=>geometryFreed++);v.group.children[0].material.addEventListener('dispose',()=>materialFreed++);v.group.children.forEach(m=>m.addEventListener('dispose',()=>buffersFreed++));v.dispose();v.dispose();assert.equal(geometryFreed,1);assert.equal(materialFreed,1);assert.equal(buffersFreed,3);assert.equal(v.group.children.length,0);f.dispose();
});
test('Source catalogue is frozen, precisely attributed and distinguishes zones from estimates',async()=>{
  const {FACILITIES_CATALOG:C,FACILITIES_REVISION}=await import('../data/facilities.mjs');assert.equal(FACILITIES_REVISION,'track-facilities-1');assert.ok(Object.isFrozen(C)&&Object.isFrozen(C.monza.stands[0]));assert.equal(C.lab.source,null);for(const id of ['monza','monaco','le-mans']){assert.equal(C[id].referenceYear,2026);assert.ok(C[id].source.startsWith('https://')&&C[id].estimated);}
});
test('Missing mapped stations are reported instead of silently inventing a location',async()=>{
  const f=await fixture('monza'),track={...f.sim.track,widthStations:[]},plan=f.M.buildFacilitiesPlan(track,f.model,f.scenery,f.drawn);assert.equal(plan.placements.filter(p=>p.kind==='stand').length,0);assert.ok(plan.skipped.some(p=>p.reason==='station unavailable'));f.dispose();
});
test('Shipping UI exposes estimated facilities in 3D, keeps exact-version saves, and imports no training code',()=>{
  const pkg=require('../../package.json'),source=fs.readFileSync(path.join(__dirname,'../track-facilities.mjs'),'utf8'),app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.equal(pkg.version,'5.7.0');for(const file of ['outputs/track-facilities.mjs','outputs/data/facilities.mjs','outputs/TRIBUNE-v550.md','outputs/VERIFICA-v550.md'])assert.ok(pkg.build.files.includes(file));assert.doesNotMatch(source,/import .*simulation|Math.random|engine.command|setInterval/);assert.match(app,/Tribune e box · 3D stimato/);assert.match(html,/non si aprono nella release 5\.7\.0 distribuita/);assert.match(html,/non aggiungono collisioni o ingressi all’IA/);
});
test('Home delegates to the synchronized app reset, retaining standalone renderer fallback',async()=>{
  const {Circuit3D}=await import('../circuit-3d.mjs'),handlers=new Map();let resets=0,changes=0,prevented=0;
  const view={canvas:{},listen:(name,handler)=>handlers.set(name,handler),reset:()=>resets++,onChange:()=>changes++};Circuit3D.prototype.bindControls.call(view);
  handlers.get('keydown')({key:'Home',preventDefault:()=>prevented++});assert.equal(resets,1);view.onReset=()=>resets+=10;handlers.get('keydown')({key:'Home',preventDefault:()=>prevented++});assert.equal(resets,11);assert.equal(changes,2);assert.equal(prevented,2);assert.equal(view.dirty,true);
  assert.match(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),/onReset:resetTrackView/);
});
