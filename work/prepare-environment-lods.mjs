// Selected local assets -> shared native instancing geometry and bounded LODs.
// Original texture bytes/UVs retained. No downloaded code or remote URL runs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as T from '../outputs/vendor/three.module.js';
import {MeshoptSimplifier} from '../node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js';

const argv=process.argv.slice(2),option=k=>{const i=argv.indexOf(k);if(i<0||!argv[i+1])throw Error('Required argument: '+k);return argv[i+1];};
const input=path.resolve(option('--source')),output=path.resolve(option('--output')),id=option('--id');
const origins={tree:{uid:'73201f05280d48dcb10ed4ca362d69f8',name:'Tree low poly lowpoly',author:'00amza',slug:'tree-low-poly-lowpoly',kind:'tree'},monaco:{uid:'7003371cd8ba430c819ebd78eb0594cf',name:'Modular modernist eclectic building',author:'ChristosRami.studio',slug:'modular-modernist-eclectic-building',kind:'building'},'le-mans':{uid:'ebdc29841f4d4b1fbc3d63c841a0a48a',name:'European House #3',author:'Satik64',slug:'european-house-3',kind:'building'}};
origins['european-tree']={uid:'ea51b3ac209e4f70ab9c618e34000b84',name:'Tree Pack',author:'Fabio Rinaldo Roloff',slug:'tree-pack',kind:'tree',cards:true};
origins['oak-tree']={uid:'6ccd872db7f0429b8dad40c6f00ec75c',name:'Oak Tree (LowPoly)',author:'riskris Design',slug:'oak-tree-lowpoly',kind:'tree',singleVariant:true};
const origin=origins[id];if(!origin)throw Error('Only selected asset ids are permitted');
const license='CC BY 4.0',licenseUrl='https://creativecommons.org/licenses/by/4.0/',source='https://sketchfab.com/3d-models/'+origin.slug+'-'+origin.uid;
const bytes=fs.readFileSync(input);if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Expected glTF binary v2');
const jsonSize=bytes.readUInt32LE(12),src=JSON.parse(bytes.subarray(20,20+jsonSize).toString('utf8')),bin=bytes.subarray(28+jsonSize);
if(src.buffers.length!==1||src.buffers[0].uri)throw Error('Asset must be self-contained; no external data requested');
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4},methods={5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function accessor(i){const a=src.accessors[i],v=src.bufferViews[a.bufferView],n=components[a.type],size=sizes[a.componentType],stride=v.byteStride||size*n,base=(v.byteOffset||0)+(a.byteOffset||0);if(a.sparse||!n||!size)throw Error('Unsupported accessor');const result=new Float64Array(a.count*n);for(let j=0;j<a.count;j++)for(let k=0;k<n;k++){let value=bin[methods[a.componentType]](base+j*stride+k*size);if(a.normalized)value=Math.max(-1,value/({5120:127,5121:255,5122:32767,5123:65535}[a.componentType]||1));result[j*n+k]=value;}return result;}
const variants=new Map(),point=new T.Vector3(),normal=new T.Vector3();let lineSegmentsConverted=0;
function lineTubes(part){
  // glTF LINES have no authored thickness. Preserve their exact endpoints with
  // explicit four-sided display tubes, diameter 0.002 of normalized height.
  const positions=[],normals=[],uv=[],indices=[],up=new T.Vector3(0,1,0);
  for(let i=0;i<part.indices.length;i+=2){
    const a=new T.Vector3().fromArray(part.positions,part.indices[i]*3),b=new T.Vector3().fromArray(part.positions,part.indices[i+1]*3),length=a.distanceTo(b);if(length<1e-9)continue;
    const geo=new T.CylinderGeometry(.001,.001,length,4,1,true),rotation=new T.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize()),center=a.clone().add(b).multiplyScalar(.5),base=positions.length/3;
    geo.applyQuaternion(rotation);geo.translate(center.x,center.y,center.z);
    positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);uv.push(...geo.attributes.uv.array);for(const v of geo.index.array)indices.push(v+base);geo.dispose();lineSegmentsConverted++;
  }
  return {...part,positions,normals,uv,indices,mode:4};
}
function visit(index,parent=new T.Matrix4()){
  const node=src.nodes[index],local=node.matrix?new T.Matrix4().fromArray(node.matrix):new T.Matrix4().compose(new T.Vector3(...(node.translation||[0,0,0])),new T.Quaternion(...(node.rotation||[0,0,0,1])),new T.Vector3(...(node.scale||[1,1,1]))),world=parent.clone().multiply(local);
  if(node.mesh!==undefined){
    const key=origin.kind==='tree'&&!origin.singleVariant?(node.extras?.assetVariant||node.name):origin.name;if(!variants.has(key))variants.set(key,[]);
    for(const primitive of src.meshes[node.mesh].primitives){
      const mode=primitive.mode??4;if(mode!==4&&mode!==1)throw Error('Only triangles and line segments supported');
      const positions=accessor(primitive.attributes.POSITION),normals=primitive.attributes.NORMAL!==undefined?accessor(primitive.attributes.NORMAL):null,uv=primitive.attributes.TEXCOORD_0!==undefined?accessor(primitive.attributes.TEXCOORD_0):new Float64Array(positions.length/3*2),indices=primitive.indices!==undefined?accessor(primitive.indices):Float64Array.from({length:positions.length/3},(_,i)=>i),nm=new T.Matrix3().getNormalMatrix(world);
      const colors=primitive.attributes.COLOR_0!==undefined?accessor(primitive.attributes.COLOR_0):null,colorComponents=colors?components[src.accessors[primitive.attributes.COLOR_0].type]:0,tangents=primitive.attributes.TANGENT!==undefined?accessor(primitive.attributes.TANGENT):null,tm=new T.Matrix3().setFromMatrix4(world),sign=world.determinant()<0?-1:1;
      for(let i=0;i<positions.length;i+=3){point.fromArray(positions,i).applyMatrix4(world).toArray(positions,i);if(normals)normal.fromArray(normals,i).applyMatrix3(nm).normalize().toArray(normals,i);}
      if(tangents)for(let i=0;i<tangents.length;i+=4){normal.fromArray(tangents,i).applyMatrix3(tm).normalize().toArray(tangents,i);tangents[i+3]*=sign;}
      if(mode===4&&sign<0)for(let i=0;i<indices.length;i+=3){const swap=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=swap;}
      variants.get(key).push({positions,normals,uv,indices,colors,colorComponents,tangents,mode,material:primitive.material??0});
    }
  }
  for(const c of node.children||[])visit(c,world);
}
for(const n of src.scenes[src.scene||0].nodes)visit(n);
const groups=[];
for(const [variant,parts] of variants){
  const bounds=new T.Box3();for(const p of parts)for(let i=0;i<p.positions.length;i+=3)bounds.expandByPoint(point.fromArray(p.positions,i));
  const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());if(size.y<=0)throw Error('No upright vertical extent');
  const byMaterial=new Map();
  for(let p of parts){
    for(let i=0;i<p.positions.length;i+=3){p.positions[i]=(p.positions[i]-center.x)/size.y;p.positions[i+1]=(p.positions[i+1]-bounds.min.y)/size.y;p.positions[i+2]=(p.positions[i+2]-center.z)/size.y;}
    if(p.mode===1)p=lineTubes(p);
    if(!byMaterial.has(p.material))byMaterial.set(p.material,{variant,material:p.material,positions:[],normals:[],uv:[],indices:[],colors:[],tangents:[],colorComponents:p.colorComponents,sourceBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},unitSize:[size.x/size.y,1,size.z/size.y]});
    const g=byMaterial.get(p.material),offset=g.positions.length/3;for(const v of p.positions)g.positions.push(v);for(const v of p.uv)g.uv.push(v);if(p.normals)for(const v of p.normals)g.normals.push(v);for(const v of p.indices)g.indices.push(v+offset);
    if(p.colors)for(const v of p.colors)g.colors.push(v);if(p.tangents)for(const v of p.tangents)g.tangents.push(v);
  }
  // Line display thickness can extend past the source bounds. Re-root and
  // uniformly normalize the entire variant once more, including those tubes.
  const finalBounds=new T.Box3();for(const g of byMaterial.values())for(let i=0;i<g.positions.length;i+=3)finalBounds.expandByPoint(point.fromArray(g.positions,i));
  const finalSize=finalBounds.getSize(new T.Vector3()),finalCenter=finalBounds.getCenter(new T.Vector3());
  for(const g of byMaterial.values()){
    for(let i=0;i<g.positions.length;i+=3){g.positions[i]=(g.positions[i]-finalCenter.x)/finalSize.y;g.positions[i+1]=(g.positions[i+1]-finalBounds.min.y)/finalSize.y;g.positions[i+2]=(g.positions[i+2]-finalCenter.z)/finalSize.y;}g.unitSize=[finalSize.x/finalSize.y,1,finalSize.z/finalSize.y];
    g.positions=Float32Array.from(g.positions);g.uv=Float32Array.from(g.uv);g.indices=Uint32Array.from(g.indices);
    g.colors=g.colors.length===g.positions.length/3*g.colorComponents&&g.colorComponents?Float32Array.from(g.colors):null;g.tangents=g.tangents.length===g.positions.length/3*4?Float32Array.from(g.tangents):null;
    if(g.normals.length===g.positions.length)g.normals=Float32Array.from(g.normals);else{const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(g.positions,3));geo.setIndex(new T.BufferAttribute(g.indices,1));geo.computeVertexNormals();g.normals=geo.attributes.normal.array;geo.dispose();}
    groups.push(g);
  }
}
await MeshoptSimplifier.ready;
const changes='World transforms baked; upright unit-height meshes rooted at ground; merged by variant/material; original triangle LOD0 topology/UVs and embedded texture bytes retained; distant geometry simplified with UV/normal constraints. '+(origin.kind==='tree'?'Original supplied tree texture connected to base colour/alpha and alpha-tested.':'Original material and texture bindings retained.')+(lineSegmentsConverted?' '+lineSegmentsConverted+' source line segments converted to four-sided open display tubes at the same endpoints, diameter 0.002 of source building height before final normalization; thickness is an authored display approximation.':'');
const dst={asset:{version:'2.0',generator:'Circuit Lab environment asset preparation',extras:{title:origin.name,author:origin.author,source,license,licenseUrl,changes}},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:structuredClone(src.materials||[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1}}]),textures:structuredClone(src.textures||[]),samplers:structuredClone(src.samplers||[]),images:structuredClone(src.images||[]),bufferViews:[],accessors:[],buffers:[{byteLength:0}]};
for(const key of ['extensionsUsed','extensionsRequired'])if(src[key])dst[key]=structuredClone(src[key]);
let legacyShaderConverted=false;
for(const material of dst.materials){const legacy=material.extensions?.KHR_materials_pbrSpecularGlossiness;if(!legacy)continue;legacyShaderConverted=true;
  material.pbrMetallicRoughness={baseColorFactor:legacy.diffuseFactor||[1,1,1,1],metallicFactor:0,roughnessFactor:Math.max(.12,1-(legacy.glossinessFactor??1)),...(legacy.diffuseTexture?{baseColorTexture:legacy.diffuseTexture}:{})};
  delete material.extensions.KHR_materials_pbrSpecularGlossiness;if(!Object.keys(material.extensions).length)delete material.extensions;
}
if(legacyShaderConverted){for(const key of ['extensionsUsed','extensionsRequired'])if(dst[key]){dst[key]=dst[key].filter(e=>e!=='KHR_materials_pbrSpecularGlossiness');if(!dst[key].length)delete dst[key];}dst.asset.extras.changes+=' Legacy specular/glossiness converted to supported dielectric metallic/roughness; diffuse, normals, AO and vertex colour preserved. Gloss response is approximate, not a pixel-identical legacy shader.';}
if(origin.kind==='tree')for(const material of dst.materials){material.alphaMode='MASK';material.alphaCutoff=.4;material.doubleSided=true;material.pbrMetallicRoughness??={};material.pbrMetallicRoughness.metallicFactor=0;material.pbrMetallicRoughness.roughnessFactor=1;}
const chunks=[];let offset=0;
function view(a){const b=Buffer.isBuffer(a)?a:Buffer.from(a.buffer,a.byteOffset,a.byteLength),pad=Buffer.alloc(Math.ceil(b.length/4)*4);b.copy(pad);const i=dst.bufferViews.length;dst.bufferViews.push({buffer:0,byteOffset:offset,byteLength:b.length});chunks.push(pad);offset+=pad.length;return i;}
function attribute(a,type,componentType,range=false){const i=dst.accessors.length,n=components[type],entry={bufferView:view(a),componentType,count:a.length/n,type};if(range){entry.min=Array(n).fill(Infinity);entry.max=Array(n).fill(-Infinity);for(let j=0;j<a.length;j++){entry.min[j%n]=Math.min(entry.min[j%n],a[j]);entry.max[j%n]=Math.max(entry.max[j%n],a[j]);}}dst.accessors.push(entry);return i;}
const textureHashes=[];for(const image of dst.images){if(image.bufferView===undefined)throw Error('Expected embedded texture');const v=src.bufferViews[image.bufferView],b=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);textureHashes.push({name:image.name||'embedded texture',sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length});image.bufferView=view(b);delete image.uri;}
if(origin.cards)dst.asset.extras.changes='Original crossed alpha cards (8 triangles per tree), UVs, vertex colours and all seven embedded PNG byte streams retained. World transforms baked, trees grounded and unit-height normalized. Alpha masking replaces transparent blending for stable instancing. The two LOD slots intentionally share the original cards; no geometry simplification.';
if(id==='oak-tree')dst.asset.extras.changes='Original volumetric crown and trunk assembled as one tree variant and two material parts. World transforms baked, grounded and unit-height normalized. Original geometry/vertex colours retained in LOD0; distant topology simplified. No source texture exists; materials are preserved with a non-metallic display response.';
const counts=[];
for(let lod=0;lod<2;lod++){
  const rootNode=dst.nodes.length,children=[];dst.nodes.push({name:'LOD'+lod,children,extras:{lod}});dst.scenes[0].nodes.push(rootNode);let triangles=0;
  for(const part of groups){
    let indices=part.indices.slice(),error=0;
    if(lod&&!origin.cards){const attrs=new Float32Array(part.positions.length/3*5);for(let i=0;i<part.positions.length/3;i++){attrs.set(part.normals.subarray(i*3,i*3+3),i*5);attrs.set(part.uv.subarray(i*2,i*2+2),i*5+3);}const target=Math.min(indices.length,Math.max(18,Math.floor(indices.length*(origin.kind==='tree'?.26:.40)/3)*3));if(target<indices.length)[indices,error]=MeshoptSimplifier.simplifyWithAttributes(indices,part.positions,3,attrs,5,[.3,.3,.3,.1,.1],null,target,.08,['Permissive']);}
    const [remap,count]=MeshoptSimplifier.compactMesh(indices),positions=new Float32Array(count*3),normals=new Float32Array(count*3),uv=new Float32Array(count*2),colors=part.colors?new Float32Array(count*part.colorComponents):null,tangents=part.tangents?new Float32Array(count*4):null;
    for(let i=0;i<remap.length;i++){const r=remap[i];if(r===0xffffffff)continue;positions.set(part.positions.subarray(i*3,i*3+3),r*3);normals.set(part.normals.subarray(i*3,i*3+3),r*3);uv.set(part.uv.subarray(i*2,i*2+2),r*2);}
    for(let i=0;i<remap.length;i++){const r=remap[i];if(r===0xffffffff)continue;if(colors)colors.set(part.colors.subarray(i*part.colorComponents,(i+1)*part.colorComponents),r*part.colorComponents);if(tangents)tangents.set(part.tangents.subarray(i*4,(i+1)*4),r*4);}
    const attributes={POSITION:attribute(positions,'VEC3',5126,true),NORMAL:attribute(normals,'VEC3',5126),TEXCOORD_0:attribute(uv,'VEC2',5126)};if(colors)attributes.COLOR_0=attribute(colors,'VEC'+part.colorComponents,5126);if(tangents)attributes.TANGENT=attribute(tangents,'VEC4',5126);
    const mesh=dst.meshes.length;dst.meshes.push({name:part.variant+'-material'+part.material+'-lod'+lod,primitives:[{attributes,indices:attribute(indices,'SCALAR',5125),material:part.material}]});
    const node=dst.nodes.length;dst.nodes.push({name:dst.meshes[mesh].name,mesh,extras:{lod,variant:part.variant,unitSize:part.unitSize,triangles:indices.length/3,error}});children.push(node);triangles+=indices.length/3;
  }
  counts.push({lod,parts:groups.length,triangles});
}
dst.buffers[0].byteLength=offset;const rawJson=Buffer.from(JSON.stringify(dst)),json=Buffer.alloc(Math.ceil(rawJson.length/4)*4,0x20);rawJson.copy(json);const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+offset,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(offset,0);binHeader.writeUInt32LE(0x004e4942,4);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.concat([header,json,binHeader,...chunks]));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const report={id,kind:origin.kind,title:origin.name,author:origin.author,uid:origin.uid,source,license,licenseUrl,sourceSha256:sha(input),derivedSha256:sha(output),bytes:fs.statSync(output).size,lods:counts,variants:[...variants.keys()],textures:textureHashes,changes:dst.asset.extras.changes,legacyShaderConverted,lineSegmentsConverted,placement:'Illustrative circuit dressing, not actual building locations or a tree survey.'};
fs.writeFileSync(option('--report'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
