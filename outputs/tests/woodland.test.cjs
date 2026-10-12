'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sources=require('../assets/woodland-provenance-v1.json'),manifest=require('../data/landscape/manifest.json');
const F=require('../simulation.js'),Tracks=require('../track-renderer.js'),Catalog=require('../data/circuits.json'),Legacy=require('../legacy-models.js');
const graph=Legacy.buildV2(require('../data/connectome.json')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function glb(entry){const b=fs.readFileSync(path.join(__dirname,'../assets',entry.file)),length=b.readUInt32LE(12);return {b,j:JSON.parse(b.subarray(20,20+length)),bin:b.subarray(28+length)};}
function data(id){const entry=manifest.circuits[id],bytes=fs.readFileSync(path.join(__dirname,'../data/landscape',entry.grid.file));return {entry,manifest,heights:new Float32Array(Uint8Array.from(bytes).buffer),places:require('../data/landscape/'+entry.placesFile)};}
for(const entry of sources.assets)test(entry.id+': downloaded source is credited, local and preserves original PNG bytes/UVs',()=>{
  const {b,j,bin}=glb(entry);assert.equal(hash(b),entry.derivedSha256);assert.equal(b.length,entry.bytes);assert.equal(j.asset.extras.author,entry.author);assert.equal(j.asset.extras.source,entry.source);assert.equal(j.asset.extras.license,'CC BY 4.0');assert.ok(j.buffers.every(b=>!b.uri));
  j.images.forEach((im,i)=>{assert.equal(im.uri,undefined);const v=j.bufferViews[im.bufferView];assert.equal(hash(bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)),entry.textures[i].sha256);});
  const lods=[0,0];for(const n of j.nodes){if(n.mesh===undefined)continue;const p=j.meshes[n.mesh].primitives[0];lods[n.extras.lod]+=j.accessors[p.indices].count/3;assert.ok(p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined);assert.equal(n.extras.unitSize[1],1);const a=j.accessors[p.attributes.POSITION];assert.ok(a.min[1]>=-1e-6&&a.max[1]<=1.000001);}
  assert.deepEqual(lods,entry.lods.map(l=>l.triangles));if(entry.id==='european-tree'){assert.equal(entry.variants.length,7);assert.equal(entry.textures.length,7);assert.deepEqual(lods,[56,56]);assert.ok(j.materials.every(m=>m.alphaMode==='MASK'&&m.doubleSided));}else{assert.equal(entry.variants.length,1);assert.deepEqual(lods,[112,68]);}
});
test('OSM land-cover lookup respects holes and water priority without changing its input',async()=>{
  const {createLandCoverIndex}=await import('../world-terrain.mjs'),d={places:{landCover:[{osmWay:1,kind:'forest',polygon:[[0,0],[300,0],[300,300],[0,300]],holes:[[[200,200],[250,200],[250,250],[200,250]]]},{osmWay:2,kind:'water',polygon:[[50,50],[100,50],[100,100],[50,100]]}]}},before=JSON.stringify(d),index=createLandCoverIndex(d);
  assert.equal(index.at(30,30).kind,'forest');assert.equal(index.at(75,75).kind,'water');assert.equal(index.at(220,220),null);assert.equal(index.at(500,500),null);assert.equal(JSON.stringify(d),before);
});
for(const id of ['monza','le-mans'])test(id+': dense forest is deterministic, fully grounded and outside the road, water and buildings',async()=>{
  const T=await import('../vendor/three.module.js'),{createWorldTerrain,createLandCoverIndex,landscapeRadius}=await import('../world-terrain.mjs'),{vegetationPlan}=await import('../vegetation.mjs'),{buildSceneryPlan,createRoadMask}=await import('../track-scenery.mjs'),s=new F.Simulation(graph,{population:4,circuits:Catalog,circuitId:id,seed:1717}),d=data(id),model=Tracks.buildModel(s.track,s.circuit),ground=F.Vehicle.Terrain.forTrack(s.track),origin={x:s.track.bounds.x+s.track.bounds.width/2,y:s.track.bounds.y+s.track.bounds.height/2},world=createWorldTerrain(s.track,ground,d,new T.MeshLambertMaterial()),draw={...ground,visualHeight:(x,y)=>world.userData.heightAt(x,y),distanceAt:world.userData.distanceAt},scenery=buildSceneryPlan(s.track,model,origin),before=JSON.stringify({cars:s.cars,rng:s.rng,track:s.track}),plan=vegetationPlan(s.track,model,scenery,draw,[],d),cover=createLandCoverIndex(d),mask=createRoadMask(s.track);
  assert.ok(plan.farTrees>5000&&plan.plants.length<=plan.budget);assert.deepEqual(plan,vegetationPlan(s.track,model,scenery,draw,[],d));
  let extended=0;for(let i=0;i<plan.plants.length;i+=23){const p=plan.plants[i];assert.ok(Math.abs(p.groundY-world.userData.heightAt(p.x,p.y))<1e-7);for(let j=0;j<12;j++)assert.equal(mask(p.x+Math.cos(j*Math.PI/6)*p.radius,p.y+Math.sin(j*Math.PI/6)*p.radius),false);if(p.woodland){const area=cover.at(p.x,p.y);assert.ok(area&&['wood','forest','park'].includes(area.kind));const distance=draw.distanceAt(p.x,p.y);assert.ok(distance<landscapeRadius(d)&&distance>=44);if(distance>1100)extended++;}}
  if(id==='le-mans'){assert.equal(landscapeRadius(d),2000);assert.ok(extended>10);assert.ok(d.places.buildings.some(b=>b.distanceM>1200));}else assert.equal(landscapeRadius(d),1000);
  assert.equal(JSON.stringify({cars:s.cars,rng:s.rng,track:s.track}),before);world.userData.dispose();
});
test('Added woodland files are packaged while app/save version and original assets remain untouched',()=>{
  const pkg=require('../../package.json');assert.equal(pkg.version,'5.5.0');for(const file of [...sources.assets.map(a=>'outputs/assets/'+a.file),'outputs/assets/WOODLAND-CREDITS.md','outputs/assets/woodland-provenance-v1.json'])assert.ok(pkg.build.files.includes(file));
});
