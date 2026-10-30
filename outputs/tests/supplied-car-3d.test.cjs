'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const asset=path.join(__dirname,'../assets/porsche-992-gt3-r-lod.glb'),provenance=require('../assets/porsche-992-gt3-r-provenance.json');
const read=()=>{const bytes=fs.readFileSync(asset),n=bytes.readUInt32LE(12);return {bytes,j:JSON.parse(bytes.subarray(20,20+n)),start:28+n};};
test('Supplied Porsche LODs preserve origin/license and contain no remote dependencies',()=>{
  const {bytes,j}=read();assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),provenance.derivedSha256);assert.equal(j.asset.extras.author,provenance.author);assert.ok(j.asset.extras.license.includes('CC-BY-NC-SA-4.0'));
  assert.ok(j.images.every(i=>i.bufferView!==undefined&&!i.uri));assert.equal(j.buffers.length,1);assert.equal(j.buffers[0].uri,undefined);
  assert.equal(j.scenes[0].nodes.length,3);assert.ok(provenance.lods[1].triangles<25000);assert.ok(provenance.lods[2].triangles<8000);assert.ok(provenance.lods[2].triangles<provenance.lods[1].triangles);
  for(const a of j.accessors.filter(a=>a.type==='VEC3'&&a.min)){assert.ok(a.min[0]>=-4.619/2-.001&&a.max[0]<=4.619/2+.001);assert.ok(a.min[2]>=-2.05/2-.001&&a.max[2]<=2.05/2+.001);}
});
test('ZIP livery is embedded exactly once and mapped to the original car-paint UVs on all three LODs',()=>{
  const {bytes,j,start}=read(),paint=j.materials.findIndex(m=>m.name==='EXT_Carpaint_Inst'),map=j.materials[paint].pbrMetallicRoughness.baseColorTexture;
  assert.ok(map,'The missing car-paint map must not regress to flat white');assert.equal(map.texCoord,0);assert.deepEqual(j.materials[paint].pbrMetallicRoughness.baseColorFactor,[1,1,1,1]);
  assert.deepEqual(map.extensions.KHR_texture_transform,{offset:[0,2],scale:[1,-1]});
  assert.ok(j.extensionsRequired.includes('KHR_texture_transform'));
  const image=j.images[j.textures[map.index].source],v=j.bufferViews[image.bufferView],data=bytes.subarray(start+(v.byteOffset||0),start+(v.byteOffset||0)+v.byteLength);
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),provenance.livery.sha256);assert.equal(data.readUInt32BE(16),4096);assert.equal(data.readUInt32BE(20),4096);
  assert.equal(j.images.length,35);assert.equal(j.textures.length,35);
  assert.equal(j.meshes.filter(m=>m.primitives.some(p=>p.material===paint)).length,3);
  for(const mesh of j.meshes.filter(m=>m.primitives.some(p=>p.material===paint)))assert.ok(mesh.primitives.every(p=>p.attributes.TEXCOORD_0!==undefined));
});
test('Actual imported mesh instancing and wheel animation observe 100 independent cars without modifying them',async()=>{
  const T=await import('../vendor/three.module.js'),{SuppliedCarFleet}=await import('../supplied-car-3d.mjs'),{bytes,j,start}=read(),group=new T.Group(),scene=new T.Group();
  const arr=index=>{const a=j.accessors[index],v=j.bufferViews[a.bufferView],C=a.componentType===5126?Float32Array:Uint32Array,n={SCALAR:1,VEC2:2,VEC3:3}[a.type];return new C(bytes.buffer,bytes.byteOffset+start+(v.byteOffset||0)+(a.byteOffset||0),a.count*n);};
  const materials=j.materials.map(()=>new T.MeshStandardMaterial());
  for(const index of j.scenes[0].nodes){const parent=new T.Group();scene.add(parent);for(const id of j.nodes[index].children){const node=j.nodes[id],p=j.meshes[node.mesh].primitives[0],g=new T.BufferGeometry();for(const [name,key]of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0']])g.setAttribute(name,new T.BufferAttribute(arr(p.attributes[key]),name==='uv'?2:3));g.setIndex(new T.BufferAttribute(arr(p.indices),1));const mesh=new T.Mesh(g,materials[p.material]);mesh.userData=node.extras;parent.add(mesh);}}
  const fleet=new SuppliedCarFleet(group,{scene}),F=require('../simulation.js'),L=require('../legacy-models.js'),data=require('../data/connectome.json'),sim=new F.Simulation(L.buildV2(data),{population:100});
  for(let i=0;i<100;i++){sim.cars[i].x=100+i*8;sim.cars[i].y=100;sim.cars[i].heading=i*.01;sim.cars[i].vehicle.steeringAngle=.1;sim.cars[i].vehicle.distanceM=10+i;}
  const before=JSON.stringify(sim.cars),camera=new T.PerspectiveCamera(48,2.5,.05,2000);camera.position.set(100,7,112);
  fleet.update(sim.cars,{x:0,y:0},['#ff7658'],{selected:sim.cars[0],camera,height:450,mode:'follow'});
  assert.equal(JSON.stringify(sim.cars),before);assert.equal(fleet.carCount,100);assert.equal(fleet.renderedCars,100);assert.equal(fleet.counts[0],1);assert.ok(fleet.counts[1]<=12);assert.ok(fleet.parts.every(p=>p.mesh.count<=p.capacity));
  const body=fleet.lods[0].find(p=>!p.wheel),wheel=fleet.lods[0].find(p=>p.wheel==='LF'),a=new T.Matrix4(),b=new T.Matrix4();body.mesh.getMatrixAt(0,a);wheel.mesh.getMatrixAt(0,b);assert.notDeepEqual(a.elements,b.elements);
  fleet.update(sim.cars,{x:0,y:0},['#ff7658'],{selected:sim.cars[0],camera,height:450,mode:'first-person'});
  assert.equal(fleet.carCount,100);assert.equal(fleet.renderedCars,99);assert.equal(fleet.counts[0],0);assert.equal(JSON.stringify(sim.cars),before);
  fleet.dispose();assert.equal(group.children.length,0);
});
