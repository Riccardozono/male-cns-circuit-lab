'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const manifest=require('../assets/environment-provenance-v1.json'),F=require('../simulation.js'),Legacy=require('../legacy-models.js'),Tracks=require('../track-renderer.js'),Catalog=require('../data/circuits.json');
const graph=Legacy.buildV2(require('../data/connectome.json'));
function glb(file){const bytes=fs.readFileSync(path.join(__dirname,'../assets',file)),size=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);return {bytes,j:JSON.parse(bytes.subarray(20,20+size)),bin:bytes.subarray(28+size)};}
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
// Geometry-only fixture; native Electron QA separately decodes actual images
// with the production GLTFLoader, rather than treating this as texture proof.
async function fixture(id){
  const T=await import('../vendor/three.module.js'),{assetFromScene}=await import('../environment-assets.mjs'),entry=manifest.assets.find(a=>a.id===id),{j,bin}=glb(entry.file),scene=new T.Group();
  const attr=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView],n={VEC2:2,VEC3:3,VEC4:4,SCALAR:1}[a.type],copy=bin.subarray(v.byteOffset,v.byteOffset+v.byteLength),ArrayType=a.componentType===5125?Uint32Array:Float32Array;return new T.BufferAttribute(new ArrayType(Uint8Array.from(copy).buffer),n);};
  for(const node of j.nodes){if(node.mesh===undefined)continue;const p=j.meshes[node.mesh].primitives[0],g=new T.BufferGeometry();g.setAttribute('position',attr(p.attributes.POSITION));g.setAttribute('normal',attr(p.attributes.NORMAL));g.setAttribute('uv',attr(p.attributes.TEXCOORD_0));g.setIndex(attr(p.indices));const material=new T.MeshStandardMaterial(),mesh=new T.Mesh(g,material);mesh.userData=node.extras;scene.add(mesh);}
  return assetFromScene(scene,id);
}
for(const entry of manifest.assets)test(entry.id+': credited, self-contained asset, exact texture bytes and complete LODs',()=>{
  const {bytes,j,bin}=glb(entry.file);assert.equal(hash(bytes),entry.derivedSha256);assert.equal(bytes.length,entry.bytes);assert.equal(j.asset.extras.author,entry.author);assert.equal(j.asset.extras.source,entry.source);assert.equal(j.asset.extras.license,'CC BY 4.0');assert.match(entry.licenseUrl,/creativecommons.org\/licenses\/by\/4.0/);
  assert.ok(j.buffers.every(b=>!b.uri));assert.equal(j.images.length,entry.textures.length);j.images.forEach((image,i)=>{assert.equal(image.uri,undefined);const v=j.bufferViews[image.bufferView];assert.equal(hash(bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)),entry.textures[i].sha256);});
  const counts=[0,0];for(const n of j.nodes){if(n.mesh===undefined)continue;const p=j.meshes[n.mesh].primitives[0];counts[n.extras.lod]+=j.accessors[p.indices].count/3;assert.ok(p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined);assert.ok(j.materials[p.material]);assert.ok(!j.materials[p.material].extensions?.KHR_materials_pbrSpecularGlossiness);}
  assert.deepEqual(counts,entry.lods.map(l=>l.triangles));assert.ok(counts[1]<counts[0]);
});
test('Supplied trees retain both source shapes and exact supplied atlas binding',()=>{
  const entry=manifest.assets[0],{j}=glb(entry.file);assert.deepEqual(entry.variants,['Tree 1','Tree 2']);assert.equal(entry.textures[0].sha256,'94a5c999fdf57f24f3841cf45197a71ec1367ae15f36fb73e4a5f7354a24c838');assert.equal(entry.lods[0].triangles,1629);assert.ok(j.materials.every(m=>m.pbrMetallicRoughness.baseColorTexture&&m.alphaMode==='MASK'&&m.doubleSided));
});
test('Building adaptations preserve vertex colour/tangents and explicitly declare approximations',()=>{
  const monaco=manifest.assets.find(a=>a.id==='monaco'),house=manifest.assets.find(a=>a.id==='le-mans'),{j}=glb(house.file);assert.equal(monaco.lineSegmentsConverted,12);assert.match(monaco.changes,/thickness is an authored display approximation/);assert.equal(house.legacyShaderConverted,true);assert.match(house.changes,/Gloss response is approximate/);assert.ok(j.meshes.every(m=>m.primitives[0].attributes.COLOR_0!==undefined));assert.ok(j.meshes.some(m=>m.primitives[0].attributes.TANGENT!==undefined));assert.ok(j.materials.some(m=>m.normalTexture&&m.occlusionTexture));
});
for(const id of ['lab','monza','monaco','le-mans'])test(id+': buildings/trees avoid the road, runoffs and each other without simulation changes',async()=>{
  const {buildSceneryPlan,createRoadMask}=await import('../track-scenery.mjs'),{buildingPlan}=await import('../buildings.mjs'),{vegetationPlan}=await import('../vegetation.mjs'),s=new F.Simulation(graph,{population:4,circuits:Catalog,circuitId:id,seed:7177}),before=JSON.stringify({track:s.track,cars:s.cars,random:s.rng}),model=Tracks.buildModel(s.track,s.circuit),ground=F.Vehicle.Terrain.forTrack(s.track),origin={x:0,y:0},scenery=buildSceneryPlan(s.track,model,origin),asset=['monaco','le-mans'].includes(id)?await fixture(id):null,size=asset?[...asset.variants.values()][0]:[1,1,1],plan=buildingPlan(s.track,model,scenery,ground,size),mask=createRoadMask(s.track),ppm=s.track.pixelsPerMeter||1;
  assert.deepEqual(plan,buildingPlan(s.track,model,scenery,ground,size));assert.ok(plan.placements.length<=plan.budget);assert.equal(plan.placements.length>0,['monaco','le-mans'].includes(id));
  for(const p of plan.placements){assert.ok(Number.isFinite(p.groundY)&&p.groundY>=p.minY);const hx=size[0]*p.height*.5,hz=size[2]*p.height*.5,cos=Math.cos(p.yaw),sin=Math.sin(p.yaw);for(let u=-hx;u<=hx;u+=ppm)for(let v=-hz;v<=hz;v+=ppm)assert.equal(mask(p.x+cos*u+sin*v,p.y-sin*u+cos*v),false);for(const z of scenery.zones)assert.ok(Math.hypot(p.x-z.point.x,p.y-z.point.y)>(Math.max(z.before,z.after)+z.width*.5+s.track.halfWidth/ppm)*ppm+p.radius);}
  for(let i=0;i<plan.placements.length;i++)for(let k=i+1;k<plan.placements.length;k++){const a=plan.placements[i],b=plan.placements[k];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+3*ppm);}
  const plants=vegetationPlan(s.track,model,scenery,ground,plan.placements);for(const tree of plants.plants)for(const house of plan.placements)assert.ok(Math.hypot(tree.x-house.x,tree.y-house.y)>=tree.radius+house.radius+ppm);
  assert.equal(JSON.stringify({track:s.track,cars:s.cars,random:s.rng}),before);
});
test('Shared instancing switches LOD/visibility, stays grounded, and does not destroy cached resources',async()=>{
  const T=await import('../vendor/three.module.js'),{EnvironmentInstances}=await import('../environment-assets.mjs'),asset=await fixture('tree'),p=[{x:0,y:0,groundY:4,height:9,radius:4},{x:300,y:0,groundY:7,height:10,radius:5}],before=JSON.stringify(p),instances=new EnvironmentInstances(asset,p,{origin:{x:0,y:0}});let freed=0;asset.parts[0].geometry.addEventListener('dispose',()=>freed++);
  instances.update({position:new T.Vector3(0,10,0)},'follow',true);assert.deepEqual(instances.info().lodCounts,[1,1]);assert.equal(instances.info().variants,2);assert.ok(instances.info().drawCalls<=4);for(const v of instances.prepared){assert.equal(v.matrix.elements[13],v.placement.groundY);assert.ok(v.scale<=v.placement.height);}
  instances.setVisible(false);assert.equal(instances.group.visible,false);instances.setVisible(true);instances.update({position:new T.Vector3(1000,1000,1000)},'overview');assert.deepEqual(instances.info().lodCounts,[0,2]);assert.equal(JSON.stringify(p),before);instances.dispose();assert.equal(freed,0);assert.equal(instances.group.children.length,0);
});
test('Building foundation and instance resources dispose independently of cached geometry',async()=>{
  const {createBuildings}=await import('../buildings.mjs'),{buildSceneryPlan}=await import('../track-scenery.mjs'),s=new F.Simulation(graph,{population:4,circuits:Catalog,circuitId:'monaco'}),model=Tracks.buildModel(s.track,s.circuit),ground=F.Vehicle.Terrain.forTrack(s.track),asset=await fixture('monaco'),scenery=buildSceneryPlan(s.track,model,{x:0,y:0}),b=createBuildings(s.track,model,scenery,ground,{x:0,y:0},asset);assert.ok(b.info().buildings>20);assert.ok(b.info().drawCalls<=35);b.dispose();assert.equal(b.group.children.length,0);
});
test('Loader rejects invalid ids and disposed requests without issuing a remote request',async()=>{
  const {EnvironmentAssets}=await import('../environment-assets.mjs'),m=new EnvironmentAssets();await assert.rejects(m.load('https://example.invalid'),/Unknown local/);m.dispose();await assert.rejects(m.load('tree'),/disposed/);
});
test('All environment assets, credits and runtime modules are packaged with exact-version saves',()=>{
  const pkg=require('../../package.json');assert.equal(pkg.version,'5.7.0');for(const f of ['outputs/environment-assets.mjs','outputs/buildings.mjs','outputs/assets/environment-provenance-v1.json','outputs/assets/ENVIRONMENT-CREDITS.md',...manifest.assets.map(a=>'outputs/assets/'+a.file)])assert.ok(pkg.build.files.includes(f));const source=fs.readFileSync(path.join(__dirname,'../environment-assets.mjs'),'utf8');assert.doesNotMatch(source,/import .*simulation|Math.random|engine.command/);assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),/vegetazione procedurale/);
});
