/* Original procedural, dimensioned GT3-style 992 display model; not Porsche CAD.
 * Geometry and animation are observation only. No state is written to a car.
 * Shared meshes are instanced for the entire (up to 100-car) population. */
import * as T from './vendor/three.module.js';
import {placeCar} from './terrain-3d.mjs';

export const CAR_VISUAL_REVISION='992-procedural-3d-1';
export const DIMENSIONS=Object.freeze({length:4.619,width:2.050,wheelbase:2.507});

export function loft(sections,bottom=.22){
  const vertices=[],indices=[];
  for(const [x,w,h] of sections){
    for(const [z,y] of [[-w*.83,bottom],[-w,bottom+.1],[-w,h*.82],[-w*.64,h],[w*.64,h],[w,h*.82],[w,bottom+.1],[w*.83,bottom]])vertices.push(x,y,z);
  }
  for(let s=0;s<sections.length-1;s++)for(let i=0;i<8;i++){
    const a=s*8+i,b=s*8+(i+1)%8,c=b+8,d=a+8;indices.push(a,b,d,b,c,d);
  }
  for(let i=1;i<7;i++){indices.push(0,i+1,i);const end=(sections.length-1)*8;indices.push(end,end+i,end+i+1);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export class CarFleet{
  constructor(group,capacity=100){
    this.group=group;this.capacity=capacity;this.parts=[];this.wheels=[];this.scratch=new T.Object3D();this.base=new T.Matrix4();this.local=new T.Matrix4();this.color=new T.Color();
    const paint=new T.MeshPhongMaterial({color:0xffffff,shininess:65}),dark=new T.MeshPhongMaterial({color:0x11191d,shininess:25}),glass=new T.MeshPhongMaterial({color:0x263e4c,shininess:120}),rubber=new T.MeshLambertMaterial({color:0x121416}),metal=new T.MeshPhongMaterial({color:0x93a0a4,shininess:90}),white=new T.MeshPhongMaterial({color:0xeee9da,shininess:80}),lamps=new T.MeshBasicMaterial({color:0xf6f3d8}),red=new T.MeshBasicMaterial({color:0xffffff});
    const body=loft([[-2.3095,.70,.49],[-2.15,.89,.69],[-1.64,1.01,.79],[-.98,1.025,.78],[.15,.98,.65],[1.25,1.01,.75],[1.82,.94,.78],[2.16,.84,.54],[2.3095,.55,.45]]);
    this.part(body,paint,{tint:true});
    this.part(loft([[-1.49,.67,.81],[-.84,.70,1.14],[-.4,.66,1.27],[.33,.65,1.24],[.91,.73,.84]],.65),glass);
    this.part(loft([[-.82,.63,1.18],[-.38,.625,1.3],[.30,.62,1.27],[.47,.64,1.2]],1.11),paint,{tint:true});
    this.box([4.40,.12,1.94],dark,[0,.20,0]); // sill / splitter
    this.box([.38,.11,1.91],dark,[2.10,.15,0]);
    this.box([.49,.18,1.83],dark,[-2.02,.27,0]); // rear diffuser
    this.box([.35,.20,1.1],dark,[2.13,.36,0]); // front intake
    this.box([1.05,.022,.23],white,[1.50,.72,0]); // bonnet stripe
    this.box([.82,.025,.22],white,[-.05,1.30,0]);
    this.box([.44,.075,2.035],dark,[-1.99,1.28,0]); // rear wing
    for(const z of [-.63,.63])this.box([.065,.53,.065],dark,[-1.88,1.01,z]);
    for(const z of [-1.009,1.009])this.box([.49,.22,.032],paint,[-1.99,1.30,z],true);
    for(const z of [-.77,.77]){
      const light=new T.SphereGeometry(1,12,8);light.scale(.25,.065,.16);light.rotateZ(-.23);light.translate(1.96,.71,z);this.part(light,lamps);
      this.box([.032,.07,.35],red,[-2.185,.60,z],false,'brake');
      const mirror=new T.SphereGeometry(1,10,6);mirror.scale(.17,.10,.075);mirror.translate(.36,1.02,z*1.23);this.part(mirror,paint,{tint:true});
    }
    // One instanced draw for all tyres and one for all rims, 400 slots maximum.
    const tyre=new T.CylinderGeometry(.335,.335,.30,16);tyre.rotateX(Math.PI/2);
    const rim=new T.CylinderGeometry(.223,.223,.312,12);rim.rotateX(Math.PI/2);
    for(const [geometry,material] of [[tyre,rubber],[rim,metal]]){
      const mesh=new T.InstancedMesh(geometry,material,capacity*4);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);this.wheels.push(mesh);
    }
  }
  part(geometry,material,options={}){
    const mesh=new T.InstancedMesh(geometry,material,this.capacity);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;
    if(options.tint||options.state)for(let i=0;i<this.capacity;i++)mesh.setColorAt(i,new T.Color());
    this.parts.push({mesh,...options});this.group.add(mesh);return mesh;
  }
  box(size,material,position,tint=false,state=null){const g=new T.BoxGeometry(...size);g.translate(...position);return this.part(g,material,{tint,state});}
  update(cars,origin,palette,{ground}={}){
    const object=this.scratch,count=Math.min(cars.length,this.capacity);
    for(const part of this.parts)part.mesh.count=count;for(const mesh of this.wheels)mesh.count=count*4;
    for(let i=0;i<count;i++){
      const car=cars[i],ppm=car.pixelsPerMeter||1;
      placeCar(object,car,origin,ground);this.base.copy(object.matrix);
      const pitch=Math.max(-.09,Math.min(.09,car.vehicle?.pitch||0)),roll=Math.max(-.10,Math.min(.10,car.vehicle?.roll||0));
      object.position.set(0,0,0);object.rotation.set(roll,0,-pitch);object.scale.setScalar(1);object.updateMatrix();this.local.multiplyMatrices(this.base,object.matrix);
      for(const part of this.parts){
        part.mesh.setMatrixAt(i,this.local);
        if(part.tint){this.color.set(palette[car.id%palette.length]);if(!car.alive)this.color.multiplyScalar(.33);part.mesh.setColorAt(i,this.color);}
        if(part.state==='brake'){this.color.set(car.alive&&Number(car.outputs?.[2])>.02?0xff3d42:0x662127);part.mesh.setColorAt(i,this.color);}
      }
      const frontX=1.5042,rearX=frontX-DIMENSIONS.wheelbase;
      for(let w=0;w<4;w++){
        const front=w<2,z=(w%2?1:-1)*(front?.84:.83),steering=front?Number(car.vehicle?.steeringAngle??car.steer*.58)||0:0;
        object.position.set(front?frontX:rearX,.335,z);object.rotation.set(0,-steering,-(car.vehicle?.distanceM||0)/.335,'YXZ');object.scale.setScalar(1);object.updateMatrix();this.local.multiplyMatrices(this.base,object.matrix);
        for(const mesh of this.wheels)mesh.setMatrixAt(i*4+w,this.local);
      }
    }
    for(const {mesh}of this.parts){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}for(const mesh of this.wheels)mesh.instanceMatrix.needsUpdate=true;
  }
  dispose(){const materials=new Set();for(const mesh of [...this.parts.map(p=>p.mesh),...this.wheels]){mesh.geometry.dispose();materials.add(mesh.material);mesh.removeFromParent();mesh.dispose();}for(const m of materials)m.dispose();}
}
