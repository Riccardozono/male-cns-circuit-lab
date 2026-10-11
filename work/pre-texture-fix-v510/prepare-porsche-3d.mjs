// Offline asset preparation: original user GLB -> three shared exterior LODs.
// No executable content or external URL from the supplied archive is loaded.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import * as T from '../outputs/vendor/three.module.js';
import {MeshoptSimplifier} from '../node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.join(root,'outputs/assets/porsche-992-gt3-r-supplied.glb'),output=path.join(root,'outputs/assets/porsche-992-gt3-r-lod.glb');
const bytes=fs.readFileSync(input);if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('glTF 2 GLB required');
const jsonLength=bytes.readUInt32LE(12),src=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binary=bytes.subarray(28+jsonLength);
if(src.images.some(i=>i.uri)||src.extensionsRequired?.length||src.skins?.length)throw Error('Expected self-contained, uncompressed, static model');
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},methods={5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function accessor(index){const a=src.accessors[index],view=src.bufferViews[a.bufferView],n=components[a.type],size=sizes[a.componentType],stride=view.byteStride||n*size,base=(view.byteOffset||0)+(a.byteOffset||0),out=new Float64Array(a.count*n);for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)out[i*n+k]=binary[methods[a.componentType]](base+i*stride+k*size);return out;}
const raw=[],sourceBounds=new T.Box3(),point=new T.Vector3(),normal=new T.Vector3();
function visit(index,parent=new T.Matrix4(),wheel=null){
  const node=src.nodes[index],local=node.matrix?new T.Matrix4().fromArray(node.matrix):new T.Matrix4().compose(new T.Vector3(...(node.translation||[0,0,0])),new T.Quaternion(...(node.rotation||[0,0,0,1])),new T.Vector3(...(node.scale||[1,1,1]))),world=parent.clone().multiply(local);
  wheel=/^WHEEL_(LF|RF|LR|RR)$/.exec(node.name||'')?.[1]||wheel;
  if(node.mesh!==undefined){
    const name=src.meshes[node.mesh].name||node.name||'';
    // Alternate blur/static rims are duplicates. Hidden cockpit instruments
    // are omitted from an exterior driving view, not from the original file.
    const hidden=/RIM_BLUR|RIM_STATIC|INT_|PHISICS|DISPLAY|LEDRPM|steer_hr|lumirank|Schroth|BELT|LED_RACELOGIC/.test(name);
    if(!hidden)for(const primitive of src.meshes[node.mesh].primitives){
      const positions=accessor(primitive.attributes.POSITION),normals=accessor(primitive.attributes.NORMAL),uv=primitive.attributes.TEXCOORD_0!==undefined?accessor(primitive.attributes.TEXCOORD_0):new Float64Array(positions.length/3*2),indices=accessor(primitive.indices),nm=new T.Matrix3().getNormalMatrix(world);
      for(let i=0;i<positions.length;i+=3){point.fromArray(positions,i).applyMatrix4(world);point.toArray(positions,i);sourceBounds.expandByPoint(point);normal.fromArray(normals,i).applyMatrix3(nm).normalize().toArray(normals,i);}
      raw.push({name,wheel,material:primitive.material,positions,normals,uv,indices});
    }
  }
  for(const child of node.children||[])visit(child,world,wheel);
}
for(const index of src.scenes[src.scene||0].nodes)visit(index);
const size=sourceBounds.getSize(new T.Vector3()),center=sourceBounds.getCenter(new T.Vector3());
// Fit the visual exterior to the existing simulator's collision dimensions.
// Source +Z is forward. Display +X is forward and +Y is up.
const sx=4.619/size.z,sz=2.050/size.x,sy=sx;
const groups=new Map(),wheelBounds=new Map();
for(const part of raw){
  for(let i=0;i<part.positions.length;i+=3){const x=part.positions[i],y=part.positions[i+1],z=part.positions[i+2];part.positions[i]=(z-center.z)*sx;part.positions[i+1]=(y-sourceBounds.min.y)*sy;part.positions[i+2]=-(x-center.x)*sz;const nx=part.normals[i],ny=part.normals[i+1],nz=part.normals[i+2];normal.set(nz/sx,ny/sy,-nx/sz).normalize().toArray(part.normals,i);}
  if(part.wheel&&/TIRE/.test(part.name)){const bounds=new T.Box3();for(let i=0;i<part.positions.length;i+=3)bounds.expandByPoint(point.fromArray(part.positions,i));wheelBounds.set(part.wheel,bounds);}
  const key=part.material+'-'+(part.wheel||'body');if(!groups.has(key))groups.set(key,{material:part.material,wheel:part.wheel,positions:[],normals:[],uv:[],indices:[]});
  const group=groups.get(key),offset=group.positions.length/3;
  for(const value of part.positions)group.positions.push(value);for(const value of part.normals)group.normals.push(value);for(const value of part.uv)group.uv.push(value);for(const index of part.indices)group.indices.push(index+offset);
}
const pivots=Object.fromEntries([...wheelBounds].map(([key,bounds])=>[key,bounds.getCenter(new T.Vector3()).toArray()]));
const parts=[...groups.values()].map(g=>({...g,positions:Float32Array.from(g.positions),normals:Float32Array.from(g.normals),uv:Float32Array.from(g.uv),indices:Uint32Array.from(g.indices)}));
await MeshoptSimplifier.ready;
const dst={asset:{version:'2.0',generator:'Circuit Lab 5.1.0 exterior LOD preparation',extras:{...src.asset.extras,changes:'Exterior-only LODs, merged materials, normalized to simulator dimensions, hidden cockpit and alternate blur/static rims omitted. Derived asset licensed CC BY-NC-SA 4.0.'}},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:structuredClone(src.materials),textures:structuredClone(src.textures),samplers:structuredClone(src.samplers),images:structuredClone(src.images),bufferViews:[],accessors:[],buffers:[{byteLength:0}]};
const chunks=[];let offset=0;
function bufferView(array){const buffer=Buffer.isBuffer(array)?array:Buffer.from(array.buffer,array.byteOffset,array.byteLength),padded=Buffer.alloc(Math.ceil(buffer.length/4)*4);buffer.copy(padded);const index=dst.bufferViews.length;dst.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length});chunks.push(padded);offset+=padded.length;return index;}
function attribute(array,type,componentType,minmax=false){const index=dst.accessors.length,n=components[type],a={bufferView:bufferView(array),componentType,count:array.length/n,type};if(minmax){a.min=Array(n).fill(Infinity);a.max=Array(n).fill(-Infinity);for(let i=0;i<array.length;i++)a.min[i%n]=Math.min(a.min[i%n],array[i]),a.max[i%n]=Math.max(a.max[i%n],array[i]);}dst.accessors.push(a);return index;}
for(const image of dst.images){const view=src.bufferViews[image.bufferView];image.bufferView=bufferView(binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));}
const counts=[];
for(let lod=0;lod<3;lod++){
  const groupIndex=dst.nodes.length,children=[];dst.nodes.push({name:'LOD'+lod,children,extras:{lod}});dst.scenes[0].nodes.push(groupIndex);let total=0;
  for(const part of parts){
    let indices=part.indices.slice(),error=0;
    if(lod){
      const target=Math.max(18,Math.floor(indices.length*(lod===1?.085:.018)/3)*3),attrs=new Float32Array(part.positions.length/3*5);
      for(let i=0;i<part.positions.length/3;i++){attrs.set(part.normals.subarray(i*3,i*3+3),i*5);attrs.set(part.uv.subarray(i*2,i*2+2),i*5+3);}
      [indices,error]=MeshoptSimplifier.simplifyWithAttributes(indices,part.positions,3,attrs,5,[.15,.15,.15,.05,.05],null,target,lod===1?.03:.10,['Permissive']);
    }
    const [remap,unique]=MeshoptSimplifier.compactMesh(indices),positions=new Float32Array(unique*3),normals=new Float32Array(unique*3),uv=new Float32Array(unique*2);
    for(let i=0;i<remap.length;i++){const r=remap[i];if(r===0xffffffff)continue;positions.set(part.positions.subarray(i*3,i*3+3),r*3);normals.set(part.normals.subarray(i*3,i*3+3),r*3);uv.set(part.uv.subarray(i*2,i*2+2),r*2);}
    const mesh=dst.meshes.length;dst.meshes.push({name:'lod'+lod+'-'+part.material+'-'+(part.wheel||'body'),primitives:[{attributes:{POSITION:attribute(positions,'VEC3',5126,true),NORMAL:attribute(normals,'VEC3',5126),TEXCOORD_0:attribute(uv,'VEC2',5126)},indices:attribute(indices,'SCALAR',5125),material:part.material}]});
    const node=dst.nodes.length;dst.nodes.push({name:dst.meshes[mesh].name,mesh,extras:{lod,wheel:part.wheel,pivot:part.wheel?pivots[part.wheel]:null,brake:/Emissive_Light_Rear/.test(src.materials[part.material].name),triangles:indices.length/3,error}});children.push(node);total+=indices.length/3;
  }
  counts.push({lod,parts:parts.length,triangles:total});
}
dst.buffers[0].byteLength=offset;
const jsonBytes=Buffer.from(JSON.stringify(dst)),json=Buffer.alloc(Math.ceil(jsonBytes.length/4)*4,0x20);jsonBytes.copy(json);
const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+offset,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(offset,0);binHeader.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(output,Buffer.concat([header,json,binHeader,...chunks]));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const provenance={schema:1,appVersion:'5.1.0',input:'2024-porsche-992-gt3-r.zip / source/porsche_992_gt3_r.glb',originalSha256:sha(input),derivedSha256:sha(output),author:src.asset.extras.author,source:src.asset.extras.source,license:src.asset.extras.license,licenseUrl:'https://creativecommons.org/licenses/by-nc-sa/4.0/',originalTriangles:src.meshes.reduce((s,m)=>s+m.primitives.reduce((v,p)=>v+src.accessors[p.indices].count/3,0),0),exteriorTriangles:parts.reduce((s,p)=>s+p.indices.length/3,0),lods:counts,sourceWorldBounds:{min:sourceBounds.min.toArray(),max:sourceBounds.max.toArray()},normalization:{frontAxis:'+Z to +X',lengthM:4.619,widthM:2.05,heightM:size.y*sy,scale:[sx,sy,sz],wheelPivots:pivots},changes:dst.asset.extras.changes,boundary:'User-supplied third-party visual model. Metadata credits and license retained. Not official Porsche CAD or validated homologation geometry. Physical solver and collision dimensions unchanged.'};
fs.writeFileSync(path.join(root,'outputs/assets/porsche-992-gt3-r-provenance.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify({output,bytes:fs.statSync(output).size,...provenance},null,2));
