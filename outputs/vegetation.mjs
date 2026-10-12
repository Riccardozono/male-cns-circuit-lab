/* Native static instancing: illustrative vegetation, not a tree survey. */
import * as T from './vendor/three.module.js';
import {createRoadMask} from './track-scenery.mjs';
import {EnvironmentInstances} from './environment-assets.mjs';
export function vegetationPlan(track,model,scenery,ground,exclusions=[],world=null){
  const settings={lab:[420,42,16],monza:[1800,125,26],monaco:[100,22,12],'le-mans':[1450,100,27]},[limit,spread,clearance]=settings[model.id]||settings.lab,ppm=track.pixelsPerMeter||1,mask=createRoadMask(track),plants=[],near=new Map(),cell=7*ppm;
  let state=2166136261;for(const c of model.id)state=Math.imul(state^c.charCodeAt(0),16777619);const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const blocked=(x,y,r)=>scenery.zones.some(z=>Math.hypot(x-z.point.x,y-z.point.y)<(Math.max(z.before,z.after)+z.width*.5+track.halfWidth/ppm)*ppm+r);
  for(let attempt=0;attempt<limit*12&&plants.length<limit;attempt++){
    const i=Math.floor(random()*model.center.points.length),a=model.center.points[i],b=model.center.points[(i+1)%model.center.points.length],length=Math.hypot(b.x-a.x,b.y-a.y)||1,side=random()<.5?-1:1,d=(clearance+random()*spread)*ppm,t=random(),x=a.x+(b.x-a.x)*t-(b.y-a.y)/length*d*side,y=a.y+(b.y-a.y)*t+(b.x-a.x)/length*d*side;
    const bush=random()<.24,radius=(bush?1.1+random():2.8+random()*2.2)*ppm,cx=Math.floor(x/cell),cy=Math.floor(y/cell);
    if(mask(x,y)||blocked(x,y,radius)||exclusions.some(p=>Math.hypot(p.x-x,p.y-y)<p.radius+radius+ppm))continue;
    // Check complete crown footprint, not only the trunk, against the actual
    // road. Keep crowns outside safety apron extents by conservative zoning.
    let allowed=true;for(let j=0;j<12;j++)if(mask(x+Math.cos(j*Math.PI/6)*radius,y+Math.sin(j*Math.PI/6)*radius))allowed=false;
    for(let gx=cx-1;gx<=cx+1;gx++)for(let gy=cy-1;gy<=cy+1;gy++)for(const p of near.get(gx+','+gy)||[])if(Math.hypot(p.x-x,p.y-y)<(p.radius+radius)*.85)allowed=false;
    if(!allowed)continue;const p={x,y,radius,bush,height:(bush?1.4+random()*1.2:7+random()*5)*ppm,yaw:random()*Math.PI*2,color:.72+random()*.35,groundY:ground.visualHeight(x,y)*ppm};plants.push(p);const key=cx+','+cy;if(!near.has(key))near.set(key,[]);near.get(key).push(p);
  }
  const nearCount=plants.length,farBudget=world?({monza:1600,monaco:160,'le-mans':1400}[model.id]||0):0;
  if(world&&ground.distanceAt){
    const inGreen=(x,y)=>world.places.greenAreas.some(area=>{let yes=false;const ring=area.polygon;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;});
    const b=track.bounds;
    for(let attempt=0;attempt<farBudget*25&&plants.length<nearCount+farBudget;attempt++){
      const x=b.x-1000*ppm+random()*(b.width+2000*ppm),y=b.y-1000*ppm+random()*(b.height+2000*ppm),d=ground.distanceAt(x,y),radius=(3+random()*2)*ppm;
      if(d<160||d>995||!inGreen(x/ppm,y/ppm)||blocked(x,y,radius)||exclusions.some(p=>Math.hypot(p.x-x,p.y-y)<p.radius+radius+ppm))continue;
      const cx=Math.floor(x/cell),cy=Math.floor(y/cell);let clear=true;
      for(let gx=cx-1;gx<=cx+1&&clear;gx++)for(let gy=cy-1;gy<=cy+1;gy++)for(const p of near.get(gx+','+gy)||[])if(Math.hypot(p.x-x,p.y-y)<(p.radius+radius)*.85)clear=false;
      if(!clear)continue;
      const p={x,y,radius,bush:false,height:(7+random()*5)*ppm,yaw:random()*Math.PI*2,color:.72+random()*.35,groundY:ground.visualHeight(x,y)*ppm,far:true};plants.push(p);const key=cx+','+cy;if(!near.has(key))near.set(key,[]);near.get(key).push(p);
    }
  }
  return {plants,estimated:true,budget:limit+farBudget,farTrees:plants.length-nearCount};
}
export function createVegetation(track,model,scenery,ground,origin,asset=null,exclusions=[],world=null){
  const plan=vegetationPlan(track,model,scenery,ground,exclusions,world),group=new T.Group(),trunks=plan.plants.filter(p=>!p.bush),crowns=plan.plants.filter(p=>!p.bush),bushes=plan.plants.filter(p=>p.bush),object=new T.Object3D(),color=new T.Color();group.name=asset?'supplied-tree-vegetation':'procedural-vegetation';
  const part=(geometry,material,list,pose)=>{if(!list.length){geometry.dispose();material.dispose();return;}
    const mesh=new T.InstancedMesh(geometry,material,list.length);for(let i=0;i<list.length;i++){pose(list[i],object);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);color.setRGB(list[i].color,list[i].color,list[i].color);mesh.setColorAt(i,color);}mesh.computeBoundingSphere();group.add(mesh);};
  const supplied=asset?new EnvironmentInstances(asset,trunks,{origin,ppm:track.pixelsPerMeter||1,height:160}):null;
  if(supplied)group.add(supplied.group);
  else{
    part(new T.CylinderGeometry(.17,.30,1,6),new T.MeshLambertMaterial({color:'#6c5640'}),trunks,(p,o)=>{o.position.set(p.x-origin.x,p.groundY+p.height*.38,p.y-origin.y);o.rotation.set(0,p.yaw,0);o.scale.set(1,p.height*.76,1);});
    part(new T.IcosahedronGeometry(1,1),new T.MeshLambertMaterial({color:'#456e35',flatShading:false}),crowns,(p,o)=>{o.position.set(p.x-origin.x,p.groundY+p.height*.73,p.y-origin.y);o.rotation.set(.12,p.yaw,.10);o.scale.set(p.radius,p.height*.40,p.radius*.88);});
  }
  part(new T.IcosahedronGeometry(1,0),new T.MeshLambertMaterial({color:'#587e3a'}),bushes,(p,o)=>{o.position.set(p.x-origin.x,p.groundY+p.height*.43,p.y-origin.y);o.rotation.set(0,p.yaw,0);o.scale.set(p.radius,p.height*.52,p.radius);});
  return {group,plan,update(camera,mode){supplied?.update(camera,mode);},info(){const info=supplied?.info();return {estimated:true,trees:trunks.length,bushes:bushes.length,instances:plan.plants.length,drawCalls:info?info.drawCalls+(bushes.length?1:0):group.children.length,triangles:info?info.triangles+bushes.length*20:trunks.length*(24+80)+bushes.length*20,supplied:Boolean(supplied),asset:info,variants:info?.variants||0,textures:info?.textures||0};},setVisible(value){group.visible=Boolean(value);supplied?.setVisible(value);},dispose(){supplied?.dispose();for(const m of [...group.children]){m.geometry?.dispose();m.material?.dispose();m.dispose?.();group.remove(m);}group.removeFromParent();}};
}
