// Compile-time conversion only. The .exe reads its embedded mesh data offline.
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import * as T from '../outputs/vendor/three.module.js';
import {roadGeometry, edgePaintGeometry, groundMesh} from '../outputs/circuit-3d.mjs';
import {Terrain,drape,terrainMesh} from '../outputs/terrain-3d.mjs';
import {createTrackScenery} from '../outputs/track-scenery.mjs';
import {createWorldTerrain} from '../outputs/world-terrain.mjs';
import {createTrackFacilities} from '../outputs/track-facilities.mjs';
import {createDistrictBuildings} from '../outputs/district-buildings.mjs';
import {vegetationPlan} from '../outputs/vegetation.mjs';
import {buildingPlan} from '../outputs/buildings.mjs';
const require=createRequire(import.meta.url);
const simulation=require('../outputs/simulation.js'),legacy=require('../outputs/legacy-models.js'),tracks=require('../outputs/track-renderer.js');
const graph=legacy.buildV2(require('../outputs/data/connectome.json')),circuits=require('../outputs/data/circuits.json');
const manifest=require('../outputs/data/landscape/manifest.json');
const dataPath=new URL('../outputs/data/landscape/',import.meta.url);

function landscape(id) {
  const entry=manifest.circuits[id];
  if(!entry)return null;
  const bytes=fs.readFileSync(new URL(entry.grid.file,dataPath));
  const heights=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  return {manifest,entry,heights,places:require('../outputs/data/landscape/'+entry.placesFile)};
}

function encodeMesh(mesh, kind) {
  const geometry=mesh.geometry,positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
  const tints=geometry.getAttribute('color'),wet=geometry.getAttribute('waterMask'),indices=geometry.index;
  const copies=mesh.isInstancedMesh?mesh.count:1;
  if(!copies || !positions.count)return null;
  const head=Buffer.alloc(12);
  head.writeUInt32LE(positions.count*copies,0);
  head.writeUInt32LE((indices?.count||0)*copies,4);
  const style=wet?1:mesh.name==='scenery-asphalt'?2:mesh.name==='scenery-gravel'?3:kind===1||kind===3?4:0;
  head.writeUInt32LE(kind|(mesh.isLineSegments?256:0)|(style<<16),8);
  const vertices=new Float32Array(positions.count*copies*10),index=new Uint32Array((indices?.count||0)*copies);
  const matrix=new T.Matrix4(),normalMatrix=new T.Matrix3(),v=new T.Vector3(),axis=new T.Vector3(),color=new T.Color(),instanceColor=new T.Color();
  for(let n=0;n<copies;n++){
    matrix.copy(mesh.matrixWorld);
    if(mesh.isInstancedMesh){const local=new T.Matrix4();mesh.getMatrixAt(n,local);matrix.multiply(local);}
    normalMatrix.getNormalMatrix(matrix);
    if(mesh.isInstancedMesh&&mesh.instanceColor)mesh.getColorAt(n,instanceColor);else instanceColor.set(0xffffff);
    for(let i=0;i<positions.count;i++){
      v.fromBufferAttribute(positions,i).applyMatrix4(matrix);
      if(normals)axis.fromBufferAttribute(normals,i).applyNormalMatrix(normalMatrix);else axis.set(0,1,0);
      color.copy(mesh.material.color??new T.Color('#646d72')).multiply(instanceColor);
      if(tints)color.multiply(new T.Color().fromBufferAttribute(tints,i));
      vertices.set([v.x,v.y,v.z,axis.x,axis.y,axis.z,color.r,color.g,color.b,wet?wet.getX(i):0],(n*positions.count+i)*10);
    }
    if(indices)for(let i=0;i<indices.count;i++)index[n*indices.count+i]=n*positions.count+indices.getX(i);
  }
  return [head,Buffer.from(vertices.buffer),Buffer.from(index.buffer)];
}

const filenames = {
  tree:'trees-supplied-v1.glb', european:'trees-european-v1.glb', oak:'tree-oak-v1.glb',
  monaco:'monaco-building-v1.glb', 'le-mans':'le-mans-house-v1.glb',
};
const variants = Object.fromEntries(Object.entries(filenames).map(([id, file]) => {
  const bytes = fs.readFileSync(new URL('../outputs/assets/' + file, import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const grouped = new Map();
  for (const node of gltf.nodes) {
    if (node.mesh === undefined || node.extras?.lod === undefined) continue;
    const {variant, unitSize, lod} = node.extras;
    if (!grouped.has(variant)) grouped.set(variant, {size: unitSize, meshes:[[],[]]});
    grouped.get(variant).meshes[lod].push(node.mesh);
  }
  return [id, [...grouped.values()]];
}));

function decorations(track, id, model, scenery, floor, terrain, origin, facilities, districts, data) {
  const ppm = track.pixelsPerMeter || 1;
  const exclusions = [...facilities.plan.placements, ...districts?.plan.placements || []];
  const city = variants[id] ? buildingPlan(track, model, scenery.plan, floor, variants[id][0].size, exclusions) : null;
  const plan = vegetationPlan(track, model, scenery.plan, floor, [...exclusions,...city?.placements || []], data);
  const props = [];
  const place = (asset, index, p) => {
    const group = variants[asset][index % variants[asset].length];
    const scale = p.radius ? Math.min(p.height,p.radius/(Math.hypot(group.size[0],group.size[2])*.5)) : p.height;
    props.push({asset, meshes:group.meshes, position:[p.x-origin.x,p.groundY,p.y-origin.y], yaw:p.yaw, scale});
  };
  for (const p of city?.placements || []) place(id,0,p);
  let original = 0, oak = 0, forest = 0, wood = 0;
  const trees = plan.plants.filter(p => !p.bush);
  const step = Math.max(1, Math.ceil(trees.length / 5700));
  for (const [i,p] of trees.entries()) {
    if (i % step !== 0) continue;
    if (!p.woodland) place('tree',original++,p);
    else if ((wood++ % 3) === 0) place('oak',oak++,p);
    else place('european',forest++,p);
  }
  const landmarks = facilities.focuses.map(p=>({label:p.label,
    point:[p.x,p.groundY+p.height*.35,p.y], scene_only:true,
    distance:Math.max(65,p.width*1.45,p.depth*3)*ppm, yaw:p.yaw+Math.PI,pitch:.42}));
  const district = districts?.plan.placements[0];
  if (district) landmarks.unshift({label:'Edifici OSM · dettagli schematici',
    point:[district.x,district.groundY+district.height*.35,district.y],scene_only:true,
    distance:Math.max(85,district.radius*3),yaw:1.8,pitch:.5});
  const patch = trees.filter(p=>p.woodland).reduce((best,p)=> {
    const start = track.center[0], d=Math.hypot(p.x-start.x,p.y-start.y);
    return !best||d<best.d?{p,d}:best;
  },null)?.p;
  if (patch) landmarks.unshift({label:'Bosco · alberi Sketchfab',point:[patch.x,patch.groundY+patch.height*.4,patch.y],
    scene_only:true,distance:75*ppm,yaw:2.3,pitch:.46});
  if (data && terrain.userData.footprint.length) {
    const pts=terrain.userData.footprint;
    const cx=pts.reduce((n,p)=>n+p.x,0)/pts.length,cy=pts.reduce((n,p)=>n+p.y,0)/pts.length;
    let xx=0,yy=0,xy=0,radius=0;
    for(const p of pts){const dx=p.x-cx,dy=p.y-cy;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;radius=Math.max(radius,Math.hypot(dx,dy));}
    landmarks.unshift({label:`Paesaggio · fascia ${(data.entry.coverageM || 1000)/1000} km (NASA SRTM)`,
      point:[cx,0,cy],scene_only:true,distance:radius*2.15,yaw:-.5*Math.atan2(2*xy,xx-yy),pitch:.9});
  }
  return {props, landmarks};
}

function bake(id) {
  const sim=new simulation.Simulation(graph,{circuits,circuitId:id,population:1}),track=sim.track;
  const model=tracks.buildModel(track,sim.circuit),size=track.bounds,origin={x:size.x+size.width/2,y:size.y+size.height/2};
  const ground=Terrain.forTrack(track),data=landscape(id),scenery=createTrackScenery(track,model,origin);
  const terrain=data?createWorldTerrain(track,ground,data,scenery.groundMaterial()):terrainMesh(track,scenery.groundMaterial(),ground);
  const backdropMaterial=scenery.groundMaterial();
  if(data?.entry.srtm.producerGranuleId.startsWith('N43'))backdropMaterial.color.set('#596958');
  const backdrop=groundMesh(size,backdropMaterial,ground.ppm);
  backdrop.position.y=new T.Box3().setFromObject(terrain).min.y-.25;
  const meshGroups=[[terrain,1],[backdrop,3]];
  const floor={...ground,visualHeight:(x,y)=>terrain.userData.heightAt(x,y)/ground.ppm,distanceAt:terrain.userData.distanceAt};
  const facilities=createTrackFacilities(track,model,scenery.plan,floor,origin);
  const districts=data?createDistrictBuildings(track,scenery.plan,floor,data?origin:undefined,data,facilities.plan.placements):null;
  for(const mesh of scenery.group.children)drape(mesh.geometry,origin,ground);
  const road=new T.Mesh(roadGeometry(track,origin),new T.MeshLambertMaterial({color:model.theme.road}));
  road.name='scenery-asphalt';
  const paint=new T.Mesh(drape(edgePaintGeometry(track,origin),origin,ground),new T.MeshBasicMaterial({color:0xdedbd1}));
  meshGroups.push([scenery.group,2],[facilities.group,2],[road,0],[paint,0]);
  if(districts)meshGroups.push([districts.group,2]);
  const packed=[];
  for(const [group,kind] of meshGroups){
    group.updateMatrixWorld(true);
    group.traverse(object=>{
      if(object.isMesh||object.isLineSegments){const encoded=encodeMesh(object,kind);if(encoded)packed.push(encoded);}
    });
  }
  const layout = decorations(track,id,model,scenery,floor,terrain,origin,facilities,districts,data);
  fs.writeFileSync(path.join(process.argv[2],id+'.layout.json.gz'),gzipSync(JSON.stringify(layout),{level:3}));
  const header=Buffer.alloc(12);header.write('MLE4');header.writeUInt32LE(packed.length,4);header.writeFloatLE(ground.ppm,8);
  const result=gzipSync(Buffer.concat([header,...packed.flat()]),{level:3});
  fs.writeFileSync(path.join(process.argv[2],id+'.mle.gz'),result);
  console.log(id,packed.length+' mesh',layout.props.length+' oggetti',result.length+' byte');
}

for(const id of ['lab','monza','monaco','le-mans'])bake(id);
