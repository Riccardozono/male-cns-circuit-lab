/* Static visual facilities, estimated from coarse official map zones. No
 * simulation, worker, controller, RNG, sensor or progress imports/writes. */
import * as T from './vendor/three.module.js';
import {createRoadMask} from './track-scenery.mjs';
import {FACILITIES_CATALOG,FACILITIES_REVISION} from './data/facilities.mjs';

const wrap=(d,total)=>((d%total)+total)%total;
const area=ring=>ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a.x*b.y-b.x*a.y;},0)/2;
function sample(line,d){
  d=wrap(d,line.total);let lo=0,hi=line.points.length;
  while(lo+1<hi){const m=(lo+hi)>>1;if(line.arcs[m]<=d)lo=m;else hi=m;}
  const a=line.points[lo],b=line.points[(lo+1)%line.points.length],t=(d-line.arcs[lo])/(line.arcs[lo+1]-line.arcs[lo]||1);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:Math.atan2(b.y-a.y,b.x-a.x)};
}
// The safety union includes road, shoulders and runoffs. Checking its actual
// perimeter avoids placing structures in a nearby parallel road or gravel trap.
export function facilityExclusionMask(track,scenery){
  const mask=createRoadMask(track),rows=new Map(),cell=24*(track.pixelsPerMeter||1);
  for(const ring of scenery.barrierContours||[])for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];if(a.y===b.y)continue;
    for(let j=Math.floor(Math.min(a.y,b.y)/cell);j<=Math.floor(Math.max(a.y,b.y)/cell);j++){if(!rows.has(j))rows.set(j,[]);rows.get(j).push([a,b]);}
  }
  return (x,y)=>{if(mask(x,y))return true;let inside=false;for(const [a,b]of rows.get(Math.floor(y/cell))||[])if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;return inside;};
}
export function facilityPoint(p,u,v){const c=Math.cos(p.yaw),s=Math.sin(p.yaw);return {x:p.x+c*u+s*v,y:p.y-s*u+c*v};}
function footprint(track,ground,blocked,p){
  const ppm=track.pixelsPerMeter||1,halfX=p.width*ppm/2,halfZ=p.depth*ppm/2,margin=1.3*ppm,nx=Math.ceil((halfX+margin)*2/(2*ppm)),nz=Math.ceil((halfZ+margin)*2/(2*ppm)),heights=[];
  for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){
    const q=facilityPoint(p,-halfX-margin+ix*(halfX+margin)*2/nx,-halfZ-margin+iz*(halfZ+margin)*2/nz);if(blocked(q.x,q.y))return false;
    heights.push(ground.visualHeight(q.x,q.y)*ppm);
  }
  p.groundY=Math.max(...heights);p.minY=Math.min(...heights);p.radius=Math.hypot(halfX,halfZ)+margin;
  p.corners=[[-halfX,-halfZ],[halfX,-halfZ],[halfX,halfZ],[-halfX,halfZ]].map(([u,v])=>facilityPoint(p,u,v));
  return heights.every(Number.isFinite);
}
export function buildFacilitiesPlan(track,model,scenery,ground){
  const entry=FACILITIES_CATALOG[model.id]||FACILITIES_CATALOG.lab,ppm=track.pixelsPerMeter||1,line=model.center,orientation=Math.sign(area(line.points))||1,blocked=facilityExclusionMask(track,scenery),placements=[],footprints=[],skipped=[];
  const anchor=spec=>spec.station?track.widthStations?.find(p=>p.label===spec.station)?.alongMeters*ppm:spec.fraction*line.total;
  const place=(spec,kind)=>{
    const along=anchor(spec);if(!Number.isFinite(along)){skipped.push({name:spec.name||spec.station,reason:'station unavailable'});return null;}
    const side=(spec.side==='inner'?1:-1)*orientation,depth=kind==='stand'?spec.rows*.86+3.2:kind==='pit'?15:kind==='board'?1.2:3.8,width=spec.width||3.8;
    for(const shift of kind==='board'?[0]:[0,8,-8,18,-18,30,-30])for(const extra of [0,6,14,26,42,65]){
      const a=sample(line,along+((spec.offset||0)+shift)*ppm),distance=(track.halfWidth/ppm+(kind==='board'?5:kind==='cabin'?7:12)+depth/2+extra)*ppm;
      const p={...spec,kind,x:a.x-Math.sin(a.heading)*distance*side,y:a.y+Math.cos(a.heading)*distance*side,yaw:-a.heading+(side<0?Math.PI:0),width,depth,along:wrap(along+((spec.offset||0)+shift)*ppm,line.total),registrationShiftMeters:shift,lateralExtraMeters:extra,height:(kind==='stand'?spec.rows*.38+4.5:kind==='pit'?7.4:kind==='board'?2.4:3.2)*ppm};
      if(!footprint(track,ground,blocked,p)||placements.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<q.radius+p.radius+2*ppm))continue;
      placements.push(p);footprints.push(...p.corners.map(c=>({...c,height:p.groundY+p.height})));return p;
    }
    skipped.push({name:spec.name||spec.station,reason:'no clear estimated footprint'});return null;
  };
  entry.stands.forEach(s=>place(s,'stand'));place(entry.pit,'pit');
  entry.cabins.forEach((s,i)=>place({...s,side:'outer',name:'Cabina di pista '+(i+1)},'cabin'));
  for(const station of entry.braking)for(const distance of [150,100,50])place({name:station+' · '+distance+' m',station,offset:-distance,side:'outer',width:1.4,distance},'board');
  const start=sample(line,0),supports=[];
  for(const side of [-1,1]){
    for(let distance=track.halfWidth/ppm+4;distance<100;distance+=2){
      const p={kind:'gantry-post',name:'Portale di partenza',x:start.x-Math.sin(start.heading)*distance*ppm*side,y:start.y+Math.cos(start.heading)*distance*ppm*side,yaw:-start.heading,width:1.2,depth:1.2,height:8*ppm};
      if(footprint(track,ground,blocked,p)&&!placements.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<q.radius+p.radius+ppm)){supports.push(p);break;}
    }
  }
  const gantry=supports.length===2?{name:'Portale di partenza',supports,top:Math.max(ground.visualHeight(start.x,start.y)*ppm,...supports.map(p=>p.groundY))+6.8*ppm,start}:null;
  if(gantry)for(const p of supports){placements.push(p);footprints.push(...p.corners.map(c=>({...c,height:gantry.top+ppm})));}else skipped.push({name:'Portale di partenza',reason:'supports unavailable'});
  return {revision:FACILITIES_REVISION,entry,estimated:true,placements,footprints,gantry,skipped};
}

const colours={concrete:0x959b98,steel:0x66787d,roof:0xd6ddd7,glass:0x456679,dark:0x263941,white:0xe5e7dc,red:0xb55248};
// All structure parts share one box geometry and per-instance colours. The
// close seat batch is repacked only when its set of nearby stands changes.
export function createTrackFacilities(track,model,scenery,ground,origin){
  const plan=buildFacilitiesPlan(track,model,scenery,ground),ppm=track.pixelsPerMeter||1,group=new T.Group(),staticParts=[],bands=[],seatGroups=[],object=new T.Object3D(),colour=new T.Color();group.name='estimated-track-facilities';
  const box=(p,u,h,v,w,high,depth,color=colours.concrete,target=staticParts)=>{
    const q=facilityPoint(p,u*ppm,v*ppm);object.position.set(q.x-origin.x,p.groundY+h*ppm,q.y-origin.y);object.rotation.set(0,p.yaw,0);object.scale.set(w*ppm,high*ppm,depth*ppm);object.updateMatrix();target.push({matrix:object.matrix.clone(),color});
  };
  const beam=(p,a,b,thickness=.12,color=colours.steel)=>{
    const qa=facilityPoint(p,a[0]*ppm,a[2]*ppm),qb=facilityPoint(p,b[0]*ppm,b[2]*ppm),start=new T.Vector3(qa.x-origin.x,p.groundY+a[1]*ppm,qa.y-origin.y),end=new T.Vector3(qb.x-origin.x,p.groundY+b[1]*ppm,qb.y-origin.y),delta=end.clone().sub(start);
    object.position.copy(start).add(end).multiplyScalar(.5);object.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());object.scale.set(thickness*ppm,delta.length(),thickness*ppm);object.updateMatrix();staticParts.push({matrix:object.matrix.clone(),color});
  };
  let seats=0;
  for(const p of plan.placements){
    if(p.kind==='gantry-post')continue;
    const foundation=(p.groundY-p.minY)/ppm+.16;box(p,0,-foundation/2,0,p.width+.3,foundation,p.depth+.3);
    if(p.kind==='stand'){
      const rise=.38,tread=.86,front=-p.depth/2+.8,width=p.width,top=1.1+p.rows*rise,seatParts=[],cols=Math.floor((width-3)/.58),aisles=new Set([Math.floor(cols/3),Math.floor(cols*2/3)]);
      for(let row=0;row<p.rows;row++){
        const h=1.1+row*rise,z=front+row*tread;
        box(p,0,h-.12,z,width,.24,tread);box(p,0,h-.24,z+tread/2-.055,width,.20,.11);
        // Distant representation retains row rhythm; no individual chairs.
        box(p,0,h+.23,z+.14,width-.8,.30,.30,p.colour,bands);
        for(let col=0;col<cols;col++){
          const u=(col-(cols-1)/2)*.58;if([...aisles].some(c=>Math.abs(c-col)<=1))continue;
          const color=(col+row)%7===0?colours.white:p.colour;
          box(p,u,h+.19,z+.05,.44,.10,.42,color,seatParts);box(p,u,h+.40,z+.27,.44,.44,.075,color,seatParts);seats++;
        }
        for(const col of aisles){const u=(col-(cols-1)/2)*.58;box(p,u,h-.02,z+.13,1.7,.10,.36,colours.roof);box(p,u,h+rise/2-.02,z+.52,1.7,.10,.36,colours.roof);}
      }
      for(let u=-width/2+.5;u<=width/2;u+=7){
        beam(p,[u,0,front],[u,1.0,front]);beam(p,[u,0,p.depth/2-.6],[u,top,p.depth/2-.6],.18);
        beam(p,[u,1,front],[u,top,p.depth/2-.6],.15);
        beam(p,[u,0,p.depth/2-.6],[u,Math.max(1,top*.6),front+tread*p.rows*.6],.11);
        if(p.roof){beam(p,[u,top,p.depth/2-.6],[u,top+3.0,p.depth/2-.6],.20);beam(p,[u,top+3.0,p.depth/2-.6],[u,top+3.0,front-.5],.18);beam(p,[u,top+2.35,p.depth/2-.6],[u,top+3.0,front-.5],.10);}
      }
      beam(p,[-width/2,top+.85,p.depth/2-.5],[width/2,top+.85,p.depth/2-.5],.09);
      beam(p,[-width/2,top+.35,p.depth/2-.5],[width/2,top+.35,p.depth/2-.5],.075);
      for(const side of [-1,1]){
        const u=side*(width/2-.2);beam(p,[u,1.9,front],[u,top+.85,p.depth/2-.5],.085);
        for(let row=0;row<p.rows;row+=2)beam(p,[u,1.1+row*rise,front+row*tread],[u,1.95+row*rise,front+row*tread],.07);
      }
      if(p.roof){box(p,0,top+3.12,.1,width+1.4,.20,p.depth+2,colours.roof);box(p,0,top+3.08,front-.65,width+1.4,.38,.24,colours.steel);}
      seatGroups.push({placement:p,parts:seatParts});
    }else if(p.kind==='pit'){
      const bay=p.width/p.bays;box(p,0,2.3,0,p.width,4.6,p.depth,colours.roof);box(p,0,5.75,1,p.width,2.25,p.depth-3,colours.concrete);
      box(p,0,5.8,-p.depth/2+1.48,p.width-.8,1.25,.10,colours.glass);box(p,0,7.0,1,p.width+1,.28,p.depth-2,colours.white);
      box(p,0,4.6,-p.depth/2-.7,p.width+1,.22,2,colours.steel);
      for(let i=0;i<p.bays;i++){const u=(i-(p.bays-1)/2)*bay;box(p,u,1.85,-p.depth/2-.025,bay-.60,3.6,.10,colours.dark);for(let h=.5;h<3.6;h+=.5)box(p,u,h,-p.depth/2-.10,bay-.78,.07,.06,colours.steel);box(p,u,4.05,-p.depth/2-.12,1.1,.25,.12,i%2?colours.red:colours.glass);}
      for(let u=-p.width/2;u<=p.width/2;u+=bay)box(p,u,2.35,-p.depth/2-.8,.18,4.7,.18,colours.steel);
    }else if(p.kind==='cabin'){
      box(p,0,1.3,0,3.6,2.6,3.6,colours.white);box(p,0,1.85,-1.82,2.9,1.0,.07,colours.glass);box(p,0,2.7,0,4.1,.18,4.1,colours.steel);box(p,1.82,1.85,0,.07,1,2.9,colours.glass);
      beam(p,[-2,0,0],[-2,4.2,0],.08);box(p,-2,4.12,0,.4,.16,.24,colours.white);
    }else if(p.kind==='board'){
      box(p,0,.85,0,.08,1.7,.08,colours.steel);box(p,0,1.75,0,1.36,.85,.08,colours.white);
      // Real 3D numerals; no canvas/font/network texture or billboard asset.
      const digits=String(p.distance),segments={0:'abcedf',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgecd',7:'abc',8:'abcdefg',9:'abfgcd'},map={a:[0,.28,.20,.035],b:[.105,.14,.035,.24],c:[.105,-.14,.035,.24],d:[0,-.28,.20,.035],e:[-.105,-.14,.035,.24],f:[-.105,.14,.035,.24],g:[0,0,.20,.035]};
      for(let i=0;i<digits.length;i++)for(const s of segments[digits[i]]){const [u,h,w,d]=map[s];box(p,(i-(digits.length-1)/2)*.34+u,1.75+h,-.048,w,d,.016,colours.dark);}
    }
  }
  if(plan.gantry){
    const g=plan.gantry;for(const p of g.supports){const high=(g.top-p.groundY)/ppm;box(p,0,high/2,0,.38,high,.38,colours.steel);box(p,0,-.06,0,1.15,.12,1.15);}
    const a=g.supports[0],b=g.supports[1],span=Math.hypot(b.x-a.x,b.y-a.y)/ppm,p={x:(a.x+b.x)/2,y:(a.y+b.y)/2,yaw:-g.start.heading,groundY:g.top};
    box(p,0,.1,0,.32,.75,span+.5,colours.steel);box(p,0,.15,0,.42,.38,span-.7,colours.dark);
    for(let i=0;i<5;i++)box(p,-.24,.15,(i-2)*.34,.08,.20,.20,colours.red);
  }
  const geometry=new T.BoxGeometry(1,1,1),material=new T.MeshLambertMaterial({color:0xffffff});
  const batch=(list,name)=>{const mesh=new T.InstancedMesh(geometry,material,Math.max(1,list.length));mesh.name=name;mesh.count=list.length;for(let i=0;i<list.length;i++){mesh.setMatrixAt(i,list[i].matrix);mesh.setColorAt(i,colour.set(list[i].color));}mesh.computeBoundingSphere();group.add(mesh);return mesh;};
  const structure=batch(staticParts,'facilities-structure'),far=batch(bands,'seat-row-lod'),near=batch(seatGroups.flatMap(s=>s.parts),'individual-seat-lod');near.instanceMatrix.setUsage(T.DynamicDrawUsage);near.instanceColor?.setUsage(T.DynamicDrawUsage);let key=null,nearStands=0,disposed=false;
  return {group,plan,focuses:plan.placements.filter(p=>p.kind==='stand'||p.kind==='pit').map((p,i)=>({...p,key:'facility:'+i,label:p.name+' · 3D stimato'})),
    update(camera){
      if(disposed||!group.visible)return;const active=seatGroups.map((s,i)=>({s,i})).filter(({s})=>camera.position.distanceTo(new T.Vector3(s.placement.x-origin.x,s.placement.groundY+s.placement.height*.45,s.placement.y-origin.y))<190*ppm),next=active.map(a=>a.i).join(',');if(next===key)return;key=next;nearStands=active.length;
      let index=0;for(const {s}of active)for(const part of s.parts){near.setMatrixAt(index,part.matrix);near.setColorAt(index,colour.set(part.color));index++;}near.count=index;near.instanceMatrix.needsUpdate=true;if(near.instanceColor)near.instanceColor.needsUpdate=true;near.computeBoundingSphere();
      const visibleBands=seatGroups.filter((s,i)=>!active.some(a=>a.i===i));index=0;
      // Each stand contributes exactly one row ribbon per row, in plan order.
      let cursor=0;for(const s of seatGroups){if(visibleBands.includes(s))for(let r=0;r<s.placement.rows;r++){const part=bands[cursor+r];far.setMatrixAt(index,part.matrix);far.setColorAt(index,colour.set(part.color));index++;}cursor+=s.placement.rows;}
      far.count=index;far.instanceMatrix.needsUpdate=true;if(far.instanceColor)far.instanceColor.needsUpdate=true;far.computeBoundingSphere();
    },
    setVisible(value){group.visible=Boolean(value);},
    info(){return {revision:plan.revision,estimated:true,source:plan.entry.source,referenceYear:plan.entry.referenceYear,grandstands:seatGroups.length,seats,pitBuildings:plan.placements.filter(p=>p.kind==='pit').length,cabins:plan.placements.filter(p=>p.kind==='cabin').length,brakingBoards:plan.placements.filter(p=>p.kind==='board').length,startGantry:Boolean(plan.gantry),nearStands,seatInstances:near.count,drawCalls:[structure,far,near].filter(m=>m.count>0).length,visible:group.visible,skipped:plan.skipped};},
    dispose(){if(disposed)return;disposed=true;for(const mesh of [structure,far,near]){mesh.dispose();mesh.removeFromParent();}geometry.dispose();material.dispose();group.removeFromParent();}
  };
}
