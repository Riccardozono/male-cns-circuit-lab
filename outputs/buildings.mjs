/* Illustrative dressing, not a survey of Monaco/Le Mans buildings. No physics writes. */
import * as T from './vendor/three.module.js';
import {createRoadMask} from './track-scenery.mjs';
import {EnvironmentInstances} from './environment-assets.mjs';

export function buildingPlan(track,model,scenery,ground,unitSize,exclusions=[]){
  if(!['monaco','le-mans'].includes(model.id))return {placements:[],footprints:[],estimated:true,budget:0};
  const ppm=track.pixelsPerMeter||1,mask=createRoadMask(track),urban=model.id==='monaco',budget=urban?140:100,placements=[],footprints=[],line=model.center.points;
  let state=urban?81473:51917;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const near=new Map(),cell=40*ppm;
  for(let attempt=0;attempt<budget*60&&placements.length<budget;attempt++){
    const i=Math.floor(random()*line.length),a=line[i],b=line[(i+1)%line.length],d=Math.hypot(b.x-a.x,b.y-a.y)||1,heading=Math.atan2(b.y-a.y,b.x-a.x),side=random()<.5?-1:1,t=random();
    const height=(urban?15+random()*12:6+random()*3.5)*ppm,hx=unitSize[0]*height*.5,hz=unitSize[2]*height*.5,radius=Math.hypot(hx,hz),offset=(urban?32+random()*65:38+random()*85)*ppm+radius;
    const x=a.x+(b.x-a.x)*t-Math.sin(heading)*offset*side,y=a.y+(b.y-a.y)*t+Math.cos(heading)*offset*side,yaw=-heading+(side>0?Math.PI:0),cos=Math.cos(yaw),sin=Math.sin(yaw),corners=[];
    const point=(u,v)=>({x:x+cos*u+sin*v,y:y-sin*u+cos*v});
    for(const [u,v]of [[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]])corners.push(point(u,v));
    if(scenery.zones.some(z=>Math.hypot(x-z.point.x,y-z.point.y)<(Math.max(z.before,z.after)+z.width*.5+track.halfWidth/ppm+8)*ppm+radius)||exclusions.some(p=>Math.hypot(p.x-x,p.y-y)<p.radius+radius+3*ppm))continue;
    let clear=true;const samples=[];
    // Full footprint sampling at <=2m catches the actual >=7m road corridor,
    // including a nearby, parallel section rather than just the nearest road.
    const nx=Math.max(2,Math.ceil(hx*2/(2*ppm))),nz=Math.max(2,Math.ceil(hz*2/(2*ppm)));
    for(let ix=0;ix<=nx&&clear;ix++)for(let iz=0;iz<=nz;iz++){const p=point(-hx+ix*hx*2/nx,-hz+iz*hz*2/nz);if(mask(p.x,p.y)){clear=false;break;}samples.push(ground.visualHeight(p.x,p.y)*ppm);}
    const cx=Math.floor(x/cell),cy=Math.floor(y/cell);
    for(let gx=cx-2;gx<=cx+2&&clear;gx++)for(let gy=cy-2;gy<=cy+2;gy++)for(const p of near.get(gx+','+gy)||[])if(Math.hypot(p.x-x,p.y-y)<p.radius+radius+3*ppm)clear=false;
    if(!clear)continue;
    const groundY=Math.max(...samples),minY=Math.min(...samples),p={x,y,yaw,height,radius,groundY,minY,corners,scaleM:height/ppm};
    placements.push(p);footprints.push(...corners.map(c=>({...c,height:groundY+height})));const key=cx+','+cy;if(!near.has(key))near.set(key,[]);near.get(key).push(p);
  }
  return {placements,footprints,estimated:true,budget};
}
function foundationGeometry(placements,origin){
  const positions=[],quad=(a,b,c,d)=>positions.push(...a,...b,...c,...a,...c,...d);
  for(const p of placements){if(p.groundY-p.minY<.02)continue;const top=p.corners.map(c=>[c.x-origin.x,p.groundY+.005,c.y-origin.y]),bottom=p.corners.map(c=>[c.x-origin.x,p.minY-.08,c.y-origin.y]);for(let i=0;i<4;i++)quad(bottom[i],bottom[(i+1)%4],top[(i+1)%4],top[i]);quad(...top);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
export function createBuildings(track,model,scenery,ground,origin,asset,exclusions=[]){
  const size=[...asset.variants.values()][0],plan=buildingPlan(track,model,scenery,ground,size,exclusions),group=new T.Group();group.name='illustrative-buildings';
  const instances=new EnvironmentInstances(asset,plan.placements,{origin,ppm:track.pixelsPerMeter||1,height:230});group.add(instances.group);
  const foundation=new T.Mesh(foundationGeometry(plan.placements,origin),new T.MeshLambertMaterial({color:0x65615a,side:T.DoubleSide}));group.add(foundation);
  return {group,plan,update(camera,mode){instances.update(camera,mode);},setVisible(value){group.visible=Boolean(value);instances.setVisible(value);},info(){return {...instances.info(),estimated:true,buildings:plan.placements.length,budget:plan.budget,drawCalls:instances.parts.length+(foundation.geometry.attributes.position.count?1:0),visible:group.visible};},dispose(){instances.dispose();foundation.geometry.dispose();foundation.material.dispose();foundation.removeFromParent();group.removeFromParent();}};
}
