/* Display-only exterior LODs prepared from the user's Porsche GLB.
 * MattDoesBlender, CC BY-NC-SA 4.0. See assets/porsche-992-gt3-r-provenance.json.
 * Shared geometry/textures and instancing; no physics or neural state writes. */
import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
export const SUPPLIED_CAR_REVISION='992-user-glb-lod-1';
export class SuppliedCarFleet{
  static async load(group){
    const gltf=await new GLTFLoader().loadAsync(new URL('./assets/porsche-992-gt3-r-lod.glb',import.meta.url).href);
    return new SuppliedCarFleet(group,gltf);
  }
  constructor(group,gltf){
    this.group=group;this.parts=[];this.lods=[[],[],[]];this.scratch=new T.Object3D();this.base=new T.Matrix4();this.local=new T.Matrix4();this.carCount=0;this.renderedCars=0;
    const materialCopies=new Map();
    for(const lodGroup of gltf.scene.children)for(const node of lodGroup.children){
      if(!node.isMesh)continue;
      const {lod,wheel,pivot,brake}=node.userData,capacity=lod===0?1:lod===1?12:100,geometry=node.geometry;
      if(wheel&&pivot)geometry.translate(-pivot[0],-pivot[1],-pivot[2]);
      if(brake&&!materialCopies.has(node.material))materialCopies.set(node.material,node.material.clone());
      const material=brake?materialCopies.get(node.material):node.material;
      const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;
      // Instanced translucent windows are shared too; lights change only for
      // the selected detailed car, never altering any driving command.
      group.add(mesh);const part={mesh,lod,wheel,pivot,brake,capacity,triangles:node.userData.triangles};this.parts.push(part);this.lods[lod].push(part);
    }
    if(this.parts.length!==114||this.lods.some(parts=>parts.length!==38))throw Error('Modello Porsche 3D incompleto.');
    this.resources=gltf;this.counts=[0,0,0];
  }
  update(cars,origin,palette,{selected,camera,height,mode}={}){
    const count=Math.min(100,cars.length),chosen=selected||cars[0],ppm=chosen?.pixelsPerMeter||1;
    this.carCount=count;const lists=[[],[],[]],near=[];
    for(let i=0;i<count;i++){
      const car=cars[i],distance=camera.position.distanceTo(new T.Vector3(car.x-origin.x,.6*ppm,car.y-origin.y)),pixels=height*4.619*ppm/(Math.max(.1,distance)*2*Math.tan(camera.fov*Math.PI/360));
      if(car===chosen&&pixels>55){lists[0].push(car);continue;}
      // Cars are independent overlapping trials. At the same starting point,
      // show the selected body once to avoid hundreds of coincident surfaces.
      // Every agent still appears in the map markers and selection controls.
      if(car!==chosen&&Math.hypot(car.x-chosen.x,car.y-chosen.y)<1.2*ppm)continue;
      if(pixels>24)near.push({car,distance});else lists[2].push(car);
    }
    near.sort((a,b)=>a.distance-b.distance);for(let i=0;i<near.length;i++)lists[i<12?1:2].push(near[i].car);
    this.counts=lists.map(list=>list.length);this.renderedCars=this.counts.reduce((a,b)=>a+b,0);
    for(let lod=0;lod<3;lod++){
      const parts=this.lods[lod],list=lists[lod];for(const part of parts)part.mesh.count=list.length;
      for(let i=0;i<list.length;i++){
        const car=list[i],scale=car.pixelsPerMeter||1,object=this.scratch;
        object.position.set(car.x-origin.x,.04*scale,car.y-origin.y);object.rotation.set(0,-car.heading,0);object.scale.setScalar(scale);object.updateMatrix();this.base.copy(object.matrix);
        for(const part of parts){
          if(part.wheel){
            const front=part.wheel.endsWith('F'),steering=front?Number(car.vehicle?.steeringAngle??car.steer*.58)||0:0,radius=front?.34:.355;
            object.position.fromArray(part.pivot);object.rotation.set(0,-steering,-Number(car.vehicle?.distanceM||0)/radius,'YXZ');object.scale.setScalar(1);
          }else{
            const pitch=Math.max(-.09,Math.min(.09,Number(car.vehicle?.pitch)||0)),roll=Math.max(-.10,Math.min(.10,Number(car.vehicle?.roll)||0));
            object.position.set(0,0,0);object.rotation.set(roll,0,-pitch);object.scale.setScalar(1);
          }
          object.updateMatrix();this.local.multiplyMatrices(this.base,object.matrix);part.mesh.setMatrixAt(i,this.local);
          if(part.brake&&lod===0){part.mesh.material.emissive.set(car.alive&&Number(car.outputs?.[2])>.02?0xff160b:0x220300);part.mesh.material.emissiveIntensity=car.alive&&Number(car.outputs?.[2])>.02?2:.4;}
        }
      }
      for(const part of parts)part.mesh.instanceMatrix.needsUpdate=true;
    }
  }
  info(){return {revision:SUPPLIED_CAR_REVISION,carCount:this.carCount,renderedCars:this.renderedCars,lodCounts:this.counts,asset:'user-provided Porsche GLB',trianglesByLod:this.lods.map(parts=>parts.reduce((n,p)=>n+p.triangles,0))};}
  dispose(){
    const materials=new Set(),textures=new Set();
    for(const {mesh}of this.parts){mesh.geometry.dispose();materials.add(mesh.material);mesh.removeFromParent();mesh.dispose();}
    for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)textures.add(value);material.dispose();}
    for(const texture of textures){texture.source?.data?.close?.();texture.dispose();}
  }
}
