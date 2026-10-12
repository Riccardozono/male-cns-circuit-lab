'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../simulation.js'),Tracks=require('../track-renderer.js'),Legacy=require('../legacy-models.js'),Catalog=require('../data/circuits.json');
const manifest=require('../data/landscape/manifest.json'),graph=Legacy.buildV2(require('../data/connectome.json'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function data(id){const entry=manifest.circuits[id],bytes=fs.readFileSync(path.join(__dirname,'../data/landscape',entry.grid.file)),copy=Uint8Array.from(bytes).buffer;return {entry,manifest,heights:new Float32Array(copy),places:require('../data/landscape/'+entry.placesFile),bytes};}
function sim(id){return new F.Simulation(graph,{population:4,circuits:Catalog,circuitId:id,seed:7729});}
for(const id of ['monza','monaco','le-mans']){
  test(id+': offline NASA cells have source DOI, hashes, original HGT dimensions and explicit estimated registration',()=>{
    const d=data(id),g=d.entry.grid,s=d.entry.srtm;assert.equal(sha(d.bytes),g.sha256);assert.equal(d.bytes.length,g.rows*g.columns*4);assert.deepEqual(s.dimensions,[3601,3601]);assert.equal(s.hgtBytes,3601*3601*2);assert.match(s.downloadUrl,/^https:\/\/data\.lpdaac\.earthdatacloud\.nasa\.gov\/lp-prod-protected\/SRTMGL1\.003\//);assert.match(s.doi,/10\.5067\/MEaSUREs\/SRTM\/SRTMGL1\.003/);assert.ok(d.entry.registration.estimated&&d.entry.registration.rmseM<40&&d.entry.registration.maxResidualM<80);assert.ok(d.heights.every(Number.isFinite));assert.equal(d.places.license,'ODbL-1.0');assert.ok(d.places.buildings.length>=500);assert.equal(s.noData,-32768);assert.match(manifest.notice,/2000/);
  });
  test(id+': exact far-field BVH agrees with all wall segments, including the 1 km surroundings',async()=>{
    const {roadDistance}=await import('../world-terrain.mjs'),s=sim(id),distance=roadDistance(s.track);let random=78113;const rng=()=>{random=(Math.imul(1664525,random)+1013904223)|0;return (random>>>0)/4294967296;};
    for(let i=0;i<80;i++){const b=s.track.bounds,x=b.x-1100+rng()*(b.width+2200),y=b.y-1100+rng()*(b.height+2200);let brute=Infinity;
      for(const {a,b}of s.track.walls){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));brute=Math.min(brute,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}assert.ok(Math.abs(distance(x,y)-brute)<1e-8);
    }
  });
  test(id+': terrain spans the full requested band, keeps physical surface untouched and uses two bounded static batches',async()=>{
    const T=await import('../vendor/three.module.js'),{createWorldTerrain,gridHeight}=await import('../world-terrain.mjs'),s=sim(id),before=JSON.stringify({track:s.track,cars:s.cars,rng:s.rng}),ground=F.Vehicle.Terrain.forTrack(s.track),physical=s.track.center.map(p=>ground.sample(p.x,p.y)),world=createWorldTerrain(s.track,ground,data(id),new T.MeshLambertMaterial({color:'#355c37'}));
    const info=world.userData.info;assert.equal(info.coverageM,id==='le-mans'?2000:1000);assert.equal(info.verticalScale,1);assert.equal(info.physicalSurfaceUnchanged,true);assert.equal(info.drawCalls,2);assert.ok(info.triangles<165000);assert.equal(world.children[0].material.depthWrite,false);assert.equal(world.children[1].material.depthWrite,true);
    const p=world.children[0].geometry.attributes.position,origin={x:s.track.bounds.x+s.track.bounds.width/2,y:s.track.bounds.y+s.track.bounds.height/2};
    for(let i=0;i<p.count;i+=137){const x=p.getX(i)+origin.x,y=p.getZ(i)+origin.y;assert.ok(Math.abs(world.userData.heightAt(x,y)-p.getY(i))<.005);assert.ok(Number.isFinite(gridHeight(data(id),x,y)));}
    assert.deepEqual(s.track.center.map(p=>ground.sample(p.x,p.y)),physical);assert.equal(JSON.stringify({track:s.track,cars:s.cars,rng:s.rng}),before);world.userData.dispose();assert.equal(world.parent,null);
  });
  test(id+': new buildings stay outside road/runoffs and are grounded on the drawn DEM triangles',async()=>{
    const T=await import('../vendor/three.module.js'),{createWorldTerrain}=await import('../world-terrain.mjs'),{createDistrictBuildings}=await import('../district-buildings.mjs'),{buildSceneryPlan}=await import('../track-scenery.mjs'),{facilityExclusionMask}=await import('../track-facilities.mjs'),s=sim(id),d=data(id),ground=F.Vehicle.Terrain.forTrack(s.track),model=Tracks.buildModel(s.track,s.circuit),origin={x:s.track.bounds.x+s.track.bounds.width/2,y:s.track.bounds.y+s.track.bounds.height/2},world=createWorldTerrain(s.track,ground,d,new T.MeshLambertMaterial()),draw={...ground,visualHeight:(x,y)=>world.userData.heightAt(x,y),distanceAt:world.userData.distanceAt},scenery=buildSceneryPlan(s.track,model,origin),districts=createDistrictBuildings(s.track,scenery,draw,origin,d),blocked=facilityExclusionMask(s.track,scenery),before=JSON.stringify(s.cars);
    assert.ok(districts.info().buildings>50);assert.ok(districts.info().drawCalls<=4);for(const p of districts.plan.placements){assert.ok(p.groundY>=p.minY);for(const c of p.corners){assert.equal(blocked(c.x,c.y),false);assert.ok(p.groundY+.005>=world.userData.heightAt(c.x,c.y));}}
    const p=districts.plan.placements[0];districts.update({position:new T.Vector3(p.x-origin.x,p.groundY+5,p.y-origin.y)},'follow');assert.ok(districts.info().windows>0&&districts.info().windows<=14000);districts.update({position:new T.Vector3(1e6,1e6,1e6)},'overview');assert.equal(districts.info().windows,0);districts.setVisible(false);assert.equal(districts.info().visible,false);districts.dispose();assert.equal(districts.group.children.length,0);world.userData.dispose();assert.equal(JSON.stringify(s.cars),before);
  });
}
test('Local scenery never calls training, remote elevation services or a policy; current app/save version is retained',()=>{
  for(const file of ['world-terrain.mjs','district-buildings.mjs']){const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');assert.doesNotMatch(src,/import .*simulation|engine\.command|Math\.random\(/);}
  const pkg=require('../../package.json');assert.equal(pkg.version,'5.6.0');for(const file of ['outputs/world-terrain.mjs','outputs/district-buildings.mjs','outputs/data/landscape/**/*'])assert.ok(pkg.build.files.includes(file));
});
