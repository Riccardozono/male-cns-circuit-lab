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
  head.writeUInt32LE(mesh.isLineSegments?kind|256:kind,8);
  const vertices=new Float32Array(positions.count*copies*9),index=new Uint32Array((indices?.count||0)*copies);
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
      if(wet)color.lerp(new T.Color('#327b93'),Math.max(0,Math.min(1,wet.getX(i))));
      vertices.set([v.x,v.y,v.z,axis.x,axis.y,axis.z,color.r,color.g,color.b],(n*positions.count+i)*9);
    }
    if(indices)for(let i=0;i<indices.count;i++)index[n*indices.count+i]=n*positions.count+indices.getX(i);
  }
  return [head,Buffer.from(vertices.buffer),Buffer.from(index.buffer)];
}

function bake(id) {
  const sim=new simulation.Simulation(graph,{circuits,circuitId:id,population:1}),track=sim.track;
  const model=tracks.buildModel(track,sim.circuit),size=track.bounds,origin={x:size.x+size.width/2,y:size.y+size.height/2};
  const ground=Terrain.forTrack(track),data=landscape(id),scenery=createTrackScenery(track,model,origin);
  const terrain=data?createWorldTerrain(track,ground,data,scenery.groundMaterial()):terrainMesh(track,scenery.groundMaterial(),ground);
  const meshGroups=[[terrain,1]];
  const floor={...ground,visualHeight:(x,y)=>terrain.userData.heightAt(x,y)/ground.ppm,distanceAt:terrain.userData.distanceAt};
  const facilities=createTrackFacilities(track,model,scenery.plan,floor,origin);
  const districts=data?createDistrictBuildings(track,scenery.plan,floor,data?origin:undefined,data,facilities.plan.placements):null;
  for(const mesh of scenery.group.children)drape(mesh.geometry,origin,ground);
  const road=new T.Mesh(roadGeometry(track,origin),new T.MeshLambertMaterial({color:model.theme.road}));
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
  const exclusions=[...facilities.plan.placements,...districts?.plan.placements||[]];
  const treePlan=vegetationPlan(track,model,scenery.plan,floor,exclusions,data);
  const step=Math.max(1,Math.ceil(treePlan.plants.length/3600));
  const plants=treePlan.plants.filter((p,i)=>!p.bush&&i%step===0);
  const treeData=new Float32Array(plants.length*5);
  for(let i=0;i<plants.length;i++){
    const {x,y,groundY,height,yaw}=plants[i];
    treeData.set([x-origin.x,groundY,y-origin.y,height,yaw],i*5);
  }
  const header=Buffer.alloc(12);header.write('MLE3');header.writeUInt32LE(packed.length,4);header.writeUInt32LE(plants.length,8);
  const result=gzipSync(Buffer.concat([header,...packed.flat(),Buffer.from(treeData.buffer)]),{level:3});
  fs.writeFileSync(path.join(process.argv[2],id+'.mle.gz'),result);
  console.log(id,packed.length+' mesh',plants.length+' alberi',result.length+' byte');
}

for(const id of ['lab','monza','monaco','le-mans'])bake(id);
