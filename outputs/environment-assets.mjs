/* Display-only local, credited Sketchfab assets. No simulation/controller imports. */
import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
export const ENVIRONMENT_ASSET_REVISION='environment-assets-1';
const files={tree:'trees-supplied-v1.glb','european-tree':'trees-european-v1.glb','oak-tree':'tree-oak-v1.glb',monaco:'monaco-building-v1.glb','le-mans':'le-mans-house-v1.glb'};
export class EnvironmentAssets{
  constructor(){this.assets=new Map();this.pending=new Map();this.disposed=false;}
  async load(id){
    if(!Object.hasOwn(files,id))throw Error('Unknown local environment asset');
    if(this.disposed)throw Error('Asset manager disposed');
    if(this.assets.has(id))return this.assets.get(id);
    if(this.pending.has(id))return this.pending.get(id);
    const pending=new GLTFLoader().loadAsync(new URL('./assets/'+files[id],import.meta.url).href).then(gltf=>{
      const asset=assetFromScene(gltf.scene,id);
      asset.provenance=gltf.asset?.extras||{};asset.source=asset.provenance.source;
      if(this.disposed){disposeAsset(asset);throw Error('Asset manager disposed');}
      this.assets.set(id,asset);return asset;
    }).finally(()=>this.pending.delete(id));this.pending.set(id,pending);return pending;
  }
  dispose(){this.disposed=true;for(const asset of this.assets.values())disposeAsset(asset);this.assets.clear();}
}
export function assetFromScene(scene,id){
  const parts=[],variants=new Map();scene.updateMatrixWorld(true);
  scene.traverse(node=>{
    if(!node.isMesh)return;
    const {lod=0,variant=id,unitSize,triangles}=node.userData;
    if(!unitSize||!Number.isFinite(unitSize[0])||unitSize[1]!==1)throw Error('Invalid normalized environment asset');
    const geometry=node.geometry;geometry.computeBoundingBox();
    if(geometry.boundingBox.min.y<-.0001||geometry.boundingBox.max.y>1.0001)throw Error('Environment asset is not grounded/unit-height');
    const part={geometry,material:node.material,lod,variant,unitSize,triangles:triangles??(geometry.index?.count||geometry.attributes.position.count)/3};parts.push(part);variants.set(variant,unitSize);
  });
  if(!parts.length||!parts.some(p=>p.lod===0)||!parts.some(p=>p.lod===1))throw Error('Environment LODs incomplete');
  return {id,parts,variants,source:scene.userData?.source,revision:ENVIRONMENT_ASSET_REVISION};
}
function disposeAsset(asset){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  for(const p of asset.parts){geometries.add(p.geometry);materials.add(p.material);}
  for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
  for(const t of textures){t.source?.data?.close?.();t.dispose();}
}
export class EnvironmentInstances{
  constructor(asset,placements,{origin,ppm=1,height=180,onDirty=()=>{},maxDistance=Infinity}={}){
    this.group=new T.Group();this.group.name=asset.id+'-instances';this.asset=asset;this.placements=placements;this.origin=origin;this.ppm=ppm;this.threshold=height*ppm;this.onDirty=onDirty;this.parts=[];this.lastCamera=new T.Vector3(Infinity,Infinity,Infinity);this.lastMode='';this.disposed=false;
    this.maxDistance=maxDistance*ppm;
    const names=[...asset.variants.keys()];this.prepared=placements.map((p,i)=>{
      const variant=p.variant||names[i%names.length],size=asset.variants.get(variant),radius=Math.hypot(size[0],size[2])*.5;
      const scale=p.radius?Math.min(p.height,p.radius/Math.max(.001,radius)):p.height;
      const obj=new T.Object3D();obj.position.set(p.x-origin.x,p.groundY,p.y-origin.y);obj.rotation.y=p.yaw||0;obj.scale.setScalar(scale);obj.updateMatrix();return {placement:p,variant,scale,matrix:obj.matrix.clone(),position:obj.position.clone(),lod:1};
    });
    for(const part of asset.parts){
      const capacity=this.prepared.filter(p=>p.variant===part.variant).length;if(!capacity)continue;
      const mesh=new T.InstancedMesh(part.geometry,part.material,capacity);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.count=0;this.group.add(mesh);this.parts.push({mesh,part});
    }
    this.update({position:new T.Vector3(0,1e6,0)},'overview',true);
  }
  update(camera,mode,force=false){
    if(this.disposed||!this.group.visible)return;
    if(!force&&mode===this.lastMode&&camera.position.distanceToSquared(this.lastCamera)<(8*this.ppm)**2)return;
    this.lastCamera.copy(camera.position);this.lastMode=mode;
    const threshold=mode==='overview'?this.threshold*.65:this.threshold;
    for(const p of this.prepared){const d=p.position.distanceTo(camera.position);p.lod=mode==='overview'||d<this.maxDistance?(d<threshold?0:1):-1;}
    this.lodCounts=[this.prepared.filter(p=>p.lod===0).length,this.prepared.filter(p=>p.lod===1).length];
    for(const {mesh,part}of this.parts){let count=0;for(const p of this.prepared)if(p.variant===part.variant&&p.lod===part.lod)mesh.setMatrixAt(count++,p.matrix);mesh.count=count;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
    this.onDirty();
  }
  info(){return {revision:ENVIRONMENT_ASSET_REVISION,asset:this.asset.id,instances:this.prepared.length,variants:this.asset.variants.size,drawCalls:this.parts.length,lodCounts:this.lodCounts,textures:new Set(this.asset.parts.flatMap(p=>Object.values(p.material).filter(t=>t?.isTexture))).size,triangles:this.parts.reduce((n,p)=>n+p.mesh.count*p.part.triangles,0),visible:this.group.visible};}
  setVisible(value){const was=this.group.visible;this.group.visible=Boolean(value);if(!was&&value)this.lastMode='';}
  dispose(){this.disposed=true;for(const {mesh}of this.parts){mesh.removeFromParent();mesh.dispose();}this.parts=[];this.group.removeFromParent();}
}
