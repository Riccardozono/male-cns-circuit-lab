/* Native static instancing: illustrative vegetation, not a tree survey. */
import * as T from './vendor/three.module.js';
import {createRoadMask} from './track-scenery.mjs';
import {EnvironmentInstances} from './environment-assets.mjs';
import {createLandCoverIndex,landscapeRadius} from './world-terrain.mjs';
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
  const nearCount=plants.length,farBudget=world?({monza:18000,monaco:280,'le-mans':24000}[model.id]||0):0;
  if(world&&ground.distanceAt){
    const cover=createLandCoverIndex(world),coverage=landscapeRadius(world),b=track.bounds,areas=[],reserved=new Map(),rcell=64*ppm;
    for(const p of exclusions)for(let gx=Math.floor((p.x-p.radius)/rcell);gx<=Math.floor((p.x+p.radius)/rcell);gx++)for(let gy=Math.floor((p.y-p.radius)/rcell);gy<=Math.floor((p.y+p.radius)/rcell);gy++){const key=gx+','+gy;if(!reserved.has(key))reserved.set(key,[]);reserved.get(key).push(p);}
    let total=0;for(const a of cover.areas){if(!['wood','forest','park'].includes(a.kind))continue;const [ax,ay,bx,by]=a.bounds,x=Math.max(ax,b.x/ppm-coverage),y=Math.max(ay,b.y/ppm-coverage),width=Math.min(bx,(b.x+b.width)/ppm+coverage)-x,height=Math.min(by,(b.y+b.height)/ppm+coverage)-y;if(width<=0||height<=0)continue;total+=width*height*(a.kind==='park'?.18:1);areas.push({a,x,y,width,height,cumulative:total});}
    for(let attempt=0;attempt<farBudget*15&&plants.length<nearCount+farBudget&&areas.length;attempt++){
      const pick=random()*total;let lo=0,hi=areas.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(areas[mid].cumulative<pick)lo=mid+1;else hi=mid;}const area=areas[lo],x=(area.x+random()*area.width)*ppm,y=(area.y+random()*area.height)*ppm,d=ground.distanceAt(x,y),radius=(2.5+random()*2.4)*ppm,land=cover.at(x/ppm,y/ppm);
      if(d<44||d>coverage-12||!land||!['wood','forest','park'].includes(land.kind)||blocked(x,y,radius))continue;
      let reservedOverlap=false;for(let gx=Math.floor((x-radius-ppm)/rcell);gx<=Math.floor((x+radius+ppm)/rcell);gx++)for(let gy=Math.floor((y-radius-ppm)/rcell);gy<=Math.floor((y+radius+ppm)/rcell);gy++)for(const p of reserved.get(gx+','+gy)||[])if(Math.hypot(p.x-x,p.y-y)<p.radius+radius+ppm)reservedOverlap=true;
      if(reservedOverlap)continue;
      const cx=Math.floor(x/cell),cy=Math.floor(y/cell);let clear=true;
      for(let gx=cx-2;gx<=cx+2&&clear;gx++)for(let gy=cy-2;gy<=cy+2;gy++)for(const p of near.get(gx+','+gy)||[])if(Math.hypot(p.x-x,p.y-y)<(p.radius+radius)*.85)clear=false;
      if(!clear)continue;
      const p={x,y,radius,bush:false,height:(12+random()*10)*ppm,yaw:random()*Math.PI*2,color:.78+random()*.28,groundY:ground.visualHeight(x,y)*ppm,far:true,woodland:true,osmArea:land.osmWay,landKind:land.kind};plants.push(p);const key=cx+','+cy;if(!near.has(key))near.set(key,[]);near.get(key).push(p);
    }
  }
  return {plants,estimated:true,budget:limit+farBudget,farTrees:plants.length-nearCount};
}
export function createVegetation(track,model,scenery,ground,origin,asset=null,exclusions=[],world=null,extraAssets={}){
  const plan=vegetationPlan(track,model,scenery,ground,exclusions,world),group=new T.Group(),trunks=plan.plants.filter(p=>!p.bush),crowns=plan.plants.filter(p=>!p.bush),bushes=plan.plants.filter(p=>p.bush),object=new T.Object3D(),color=new T.Color();group.name=asset?'supplied-tree-vegetation':'procedural-vegetation';
  const part=(geometry,material,list,pose)=>{if(!list.length){geometry.dispose();material.dispose();return;}
    const mesh=new T.InstancedMesh(geometry,material,list.length);for(let i=0;i<list.length;i++){pose(list[i],object);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);color.setRGB(list[i].color,list[i].color,list[i].color);mesh.setColorAt(i,color);}mesh.computeBoundingSphere();group.add(mesh);};
  const {european,oak}=extraAssets,newTrees=Boolean(european&&oak&&plan.farTrees),instances=[];
  const originalTrees=newTrees?trunks.filter(p=>!p.woodland):trunks;
  const supplied=asset?new EnvironmentInstances(asset,originalTrees,{origin,ppm:track.pixelsPerMeter||1,height:160}):null;
  if(supplied){instances.push(supplied);group.add(supplied.group);}
  if(newTrees){const wood=trunks.filter(p=>p.woodland),oakTrees=wood.filter((p,i)=>i%3===0),cards=wood.filter((p,i)=>i%3!==0);
    // The original pack uses crossed alpha cards; oak provides a full canopy
    // volume. Alternate foliage brightness without modifying source pixels.
    for(const [source,list]of [[oak,oakTrees],[european,cards]]){const batch=new EnvironmentInstances(source,list,{origin,ppm:track.pixelsPerMeter||1,height:220,maxDistance:2500});instances.push(batch);group.add(batch.group);}
  }
  if(!supplied){
    part(new T.CylinderGeometry(.17,.30,1,6),new T.MeshLambertMaterial({color:'#6c5640'}),trunks,(p,o)=>{o.position.set(p.x-origin.x,p.groundY+p.height*.38,p.y-origin.y);o.rotation.set(0,p.yaw,0);o.scale.set(1,p.height*.76,1);});
    part(new T.IcosahedronGeometry(1,1),new T.MeshLambertMaterial({color:'#456e35',flatShading:false}),crowns,(p,o)=>{o.position.set(p.x-origin.x,p.groundY+p.height*.73,p.y-origin.y);o.rotation.set(.12,p.yaw,.10);o.scale.set(p.radius,p.height*.40,p.radius*.88);});
  }
  part(new T.IcosahedronGeometry(1,0),new T.MeshLambertMaterial({color:'#587e3a'}),bushes,(p,o)=>{o.position.set(p.x-origin.x,p.groundY+p.height*.43,p.y-origin.y);o.rotation.set(0,p.yaw,0);o.scale.set(p.radius,p.height*.52,p.radius);});
  return {group,plan,update(camera,mode){for(const i of instances)i.update(camera,mode);},info(){const info=supplied?.info(),all=instances.map(i=>i.info());return {estimated:true,trees:trunks.length,bushes:bushes.length,instances:plan.plants.length,woodlandTrees:plan.farTrees,coverageM:world?landscapeRadius(world):null,drawCalls:info?all.reduce((n,a)=>n+a.drawCalls,0)+(bushes.length?1:0):group.children.length,triangles:info?all.reduce((n,a)=>n+a.triangles,0)+bushes.length*20:trunks.length*(24+80)+bushes.length*20,supplied:Boolean(supplied),asset:info,assets:all,variants:all.reduce((n,a)=>n+a.variants,0),textures:all.reduce((n,a)=>n+a.textures,0)};},setVisible(value){group.visible=Boolean(value);for(const i of instances)i.setVisible(value);},dispose(){for(const i of instances)i.dispose();for(const m of [...group.children]){m.geometry?.dispose();m.material?.dispose();m.dispose?.();group.remove(m);}group.removeFromParent();}};
}
