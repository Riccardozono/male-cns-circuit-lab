/* Static observation-only geometry. This module does not import a simulation,
 * controller, worker, RNG or sensor. It never writes to track/model inputs. */
import * as T from './vendor/three.module.js';
import './vendor/polygon-clipping.umd.js';
import {SCENERY_CATALOG,SCENERY_REVISION} from './data/scenery.mjs';
const clipping=globalThis.polygonClipping;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const area=ring=>ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a.x*b.y-b.x*a.y;},0)/2;
const wrap=(x,total)=>((x%total)+total)%total;
function sample(line,d){
  d=wrap(d,line.total);let lo=0,hi=line.points.length;
  while(lo+1<hi){const m=(lo+hi)>>1;if(line.arcs[m]<=d)lo=m;else hi=m;}
  const a=line.points[lo],b=line.points[(lo+1)%line.points.length],t=(d-line.arcs[lo])/(line.arcs[lo+1]-line.arcs[lo]||1);
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
}
function closestArc(line,p){
  let distance=Infinity,along=0;
  for(let i=0;i<line.points.length;i++){
    const a=line.points[i],b=line.points[(i+1)%line.points.length],dx=b.x-a.x,dy=b.y-a.y;
    const t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),d=(p.x-a.x-dx*t)**2+(p.y-a.y-dy*t)**2;
    if(d<distance){distance=d;along=line.arcs[i]+t*(line.arcs[i+1]-line.arcs[i]);}
  }
  return along;
}

// Horizontal buckets accelerate the same ray-crossing predicate as the road
// rings. All geometry checks run once on track change, never on a neural tick.
export function createRoadMask(track){
  const size=24*(track.pixelsPerMeter||1);
  const index=ring=>{
    const rows=new Map();
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];if(a.y===b.y)continue;
      for(let j=Math.floor(Math.min(a.y,b.y)/size);j<=Math.floor(Math.max(a.y,b.y)/size);j++){
        if(!rows.has(j))rows.set(j,[]);rows.get(j).push([a,b]);
      }
    }
    return (x,y)=>{let inside=false;for(const [a,b] of rows.get(Math.floor(y/size))||[])if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;return inside;};
  };
  const outer=index(track.outer),inner=index(track.inner);return (x,y)=>outer(x,y)&&!inner(x,y);
}
function resolveZones(track,model,entry){
  const lines=[model.outer,model.inner],orientation=Math.sign(area(model.center.points));
  return entry.zones.map(zone=>{
    const station=track.widthStations?.find(s=>s.label===zone.station);if(!station)return null;
    const along=station.alongMeters*(track.pixelsPerMeter||1),before=sample(model.center,along-24),p=sample(model.center,along),after=sample(model.center,along+24);
    const turn=(p.x-before.x)*(after.y-p.y)-(p.y-before.y)*(after.x-p.x);
    const boundaryIndex=Math.sign(turn||orientation)===orientation?0:1,line=lines[boundaryIndex];
    return {...zone,boundaryIndex,along:closestArc(line,p),point:{x:station.x,y:station.y}};
  }).filter(Boolean);
}
const offset=(p,d)=>({x:p.x+p.nx*d,y:p.y+p.ny*d});
function quad(out,a,b,c,d,origin,height){
  for(const p of [a,b,c,a,c,d])out.push(p.x-origin.x,height,p.y-origin.y);
}
function box(out,a,b,bottom,top,width,origin){
  const len=Math.hypot(b.x-a.x,b.y-a.y);if(len<1e-6)return;
  const nx=-(b.y-a.y)/len*width/2,ny=(b.x-a.x)/len*width/2;
  const v=(p,side,h)=>[p.x+nx*side-origin.x,h,p.y+ny*side-origin.y];
  const emit=(p,q,r,s)=>out.push(...p,...q,...r,...p,...r,...s);
  const al=v(a,1,bottom),ar=v(a,-1,bottom),bl=v(b,1,bottom),br=v(b,-1,bottom),at=v(a,1,top),au=v(a,-1,top),bt=v(b,1,top),bu=v(b,-1,top);
  emit(al,bl,bt,at);emit(br,ar,au,bu);emit(at,bt,bu,au);emit(ar,al,at,au);emit(bl,br,bu,bt);
}
function line(out,a,b,ha,hb,origin){out.push(a.x-origin.x,ha,a.y-origin.y,b.x-origin.x,hb,b.y-origin.y);}

export function buildSceneryPlan(track,model,origin={x:0,y:0}){
  const ppm=track.pixelsPerMeter||1,entry=SCENERY_CATALOG[model.id]||SCENERY_CATALOG.lab,mask=createRoadMask(track),zones=resolveZones(track,model,entry);
  const buffers={shoulder:[],asphalt:[],gravel:[],rail:[],concrete:[],protectionRed:[],protectionWhite:[],posts:[],fence:[]};
  const stats={barrierSegments:0,fencePanels:0,runoffTiles:0,skippedSegments:0,runoffZones:zones.length,geometryRevision:SCENERY_REVISION};
  const footprint=[],zoneTiles=zones.map(()=>0),safetyTiles=[],surfaceTiles={asphalt:[],gravel:[]};
  const xy=p=>[Math.round(p.x*1e6)/1e6,Math.round(p.y*1e6)/1e6];
  const road=[track.outer.map(xy),track.inner.map(xy)];
  const polygon=(a,b,c,d)=>[[xy(a),xy(b),xy(c),xy(d)]];
  const outside=p=>!mask(p.x,p.y);
  const clear=(a,b)=>outside(a)&&outside(b)&&outside({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const safeQuad=(buffer,a,b,c,d,height)=>{
    const mid={x:(a.x+b.x+c.x+d.x)/4,y:(a.y+b.y+c.y+d.y)/4};
    if(!outside(mid)||!clear(a,b)||!clear(b,c)||!clear(c,d)||!clear(d,a))return false;
    quad(buffer,a,b,c,d,origin,height);return true;
  };
  for(const [index,ring] of [model.outer,model.inner].entries()){
    const count=Math.min(12000,Math.max(16,Math.ceil(ring.total/(3.5*ppm)))),step=ring.total/count;
    const localZones=zones.map((z,i)=>({...z,index:i})).filter(z=>z.boundaryIndex===index);
    const profile=along=>{
      let width=0,zone=null;
      for(const z of localZones){
        const d=wrap(along-z.along+ring.total/2,ring.total)-ring.total/2,start=-z.before*ppm,end=z.after*ppm;
        if(d<start||d>end)continue;
        const w=z.width*ppm*Math.pow(Math.sin(Math.PI*(d-start)/(end-start)),.75);
        if(w>width){width=w;zone=z;}
      }
      return {width,zone};
    };
    // Calculate area/orientation once per ring rather than at each sample.
    const ringSign=Math.sign(area(ring.points))*(index===0?-1:1);
    const boundary=along=>{
      const p=sample(ring,along),a=sample(ring,along-.8*ppm),b=sample(ring,along+.8*ppm),len=Math.hypot(b.x-a.x,b.y-a.y)||1;
      return {...p,nx:-(b.y-a.y)/len*ringSign,ny:(b.x-a.x)/len*ringSign};
    };
    for(let i=0;i<count;i++){
      const along=i*step,a=boundary(along),b=boundary(along+step),pa=profile(along),pb=profile(along+step);
      const shoulder=entry.shoulder*ppm,margin=.12*ppm;
      safeQuad(buffers.shoulder,offset(a,margin),offset(b,margin),offset(b,shoulder),offset(a,shoulder),.018*ppm);
      // Safety envelope is a boolean union, not an offset path that folds into
      // itself at a chicane. It is visual-only and deliberately contains the
      // physical road; its cleaned perimeter lies OUTSIDE the actual corridor.
      safetyTiles.push(polygon(offset(a,-.25*ppm),offset(b,-.25*ppm),offset(b,entry.setback*ppm+pb.width),offset(a,entry.setback*ppm+pa.width)));
      const runoff=Math.max(pa.width,pb.width)>1.2*ppm,zone=pa.zone||pb.zone;
      if(runoff&&zone){
        surfaceTiles[zone.surface].push(polygon(offset(a,shoulder),offset(b,shoulder),offset(b,shoulder+pb.width),offset(a,shoulder+pa.width)));
        stats.runoffTiles++;zoneTiles[zone.index]++;
      }
    }
  }
  // Union overlapping apron tiles and subtract the original road before
  // triangulation. No crossing barriers or missing strips on folded offsets.
  for(const kind of ['asphalt','gravel']){
    if(!surfaceTiles[kind].length)continue;
    const polygons=clipping.difference(clipping.union(surfaceTiles[kind]),road);
    for(const rings of polygons){
      const points=ring=>ring.slice(0,-1).map(([x,y])=>new T.Vector2(x-origin.x,-(y-origin.y)));
      const shape=new T.Shape(points(rings[0]));for(const hole of rings.slice(1))shape.holes.push(new T.Path(points(hole)));
      const geometry=new T.ShapeGeometry(shape),p=geometry.attributes.position,index=geometry.index.array;
      for(let i=0;i<index.length;i+=3){
        const ids=[index[i],index[i+1],index[i+2]],cx=ids.reduce((s,n)=>s+p.getX(n),0)/3+origin.x,cy=origin.y-ids.reduce((s,n)=>s+p.getY(n),0)/3;
        if(mask(cx,cy))continue;
        for(const n of ids)buffers[kind].push(p.getX(n),.012*ppm,-p.getY(n));
      }
      geometry.dispose();
    }
  }
  const safety=clipping.union(road,safetyTiles),barrierContours=[];
  for(const polygon of safety)for(const coordinates of polygon){
    const points=coordinates.slice(0,-1).map(([x,y])=>({x,y})),arcs=[0];
    for(let i=0;i<points.length;i++)arcs.push(arcs[i]+Math.hypot(points[(i+1)%points.length].x-points[i].x,points[(i+1)%points.length].y-points[i].y));
    const ring={points,arcs,total:arcs.at(-1)};if(ring.total<4*ppm)continue;
    barrierContours.push(points);
    const count=Math.min(12000,Math.max(4,Math.ceil(ring.total/(3.5*ppm)))),step=ring.total/count;
    for(let i=0;i<count;i++){
      const ba=sample(ring,i*step),bb=sample(ring,(i+1)*step),dx=bb.x-ba.x,dy=bb.y-ba.y,len=Math.hypot(dx,dy)||1;
      const midpoint={x:(ba.x+bb.x)/2,y:(ba.y+bb.y)/2},nx=-dy/len,ny=dx/len;
      // A straight panel can shortcut a convex corner of the union contour.
      // Check both ends and the actual box triangle projections, not only its
      // centre, before drawing it. Omitted panels are a presentation safeguard.
      let panelClear=clear(ba,bb);
      for(const t of [0,1/3,2/3,1])for(const side of [-1,0,1]){
        if(!outside({x:ba.x+dx*t+nx*side*.45*ppm,y:ba.y+dy*t+ny*side*.45*ppm}))panelClear=false;
      }
      if(!panelClear){stats.skippedSegments++;continue;}
      const nearRunoff=zones.some(z=>Math.hypot(midpoint.x-z.point.x,midpoint.y-z.point.y)<Math.max(z.before,z.after)*.8*ppm);
      stats.barrierSegments++;footprint.push(ba,bb);
      if(entry.barrier==='concrete')box(buffers.concrete,ba,bb,.02*ppm,1.05*ppm,.38*ppm,origin);
      else if(nearRunoff)box(i%4<2?buffers.protectionRed:buffers.protectionWhite,ba,bb,.02*ppm,1.0*ppm,.65*ppm,origin);
      else for(const h of [.34,.61,.88])box(buffers.rail,ba,bb,(h-.095)*ppm,(h+.095)*ppm,.12*ppm,origin);
      if(i%2===0){const postEnd={x:ba.x+nx*.13*ppm,y:ba.y+ny*.13*ppm};box(buffers.posts,ba,postEnd,.02*ppm,2.6*ppm,.1*ppm,origin);}
      for(const h of [1.18,1.85,2.55])line(buffers.fence,ba,bb,h*ppm,h*ppm,origin);
      line(buffers.fence,ba,bb,1.18*ppm,2.55*ppm,origin);line(buffers.fence,ba,bb,2.55*ppm,1.18*ppm,origin);stats.fencePanels++;
    }
  }
  const limits={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(const p of [...track.outer,...footprint]){limits.minX=Math.min(limits.minX,p.x);limits.minY=Math.min(limits.minY,p.y);limits.maxX=Math.max(limits.maxX,p.x);limits.maxY=Math.max(limits.maxY,p.y);}
  return {buffers,stats,entry,footprint,barrierContours,zones:zones.map((z,i)=>({...z,renderedTiles:zoneTiles[i]})),bounds:{x:limits.minX,y:limits.minY,width:limits.maxX-limits.minX,height:limits.maxY-limits.minY},origin:{...origin}};
}
function surfaceMaterial(color,kind){
  const material=new T.MeshLambertMaterial({color,side:T.DoubleSide});
  if(kind==='gravel'||kind==='asphalt'||kind==='grass'){
    const scale=kind==='gravel'?10:kind==='grass'?2.3:7,amount=kind==='gravel'?.22:kind==='grass'?.12:.08;
    material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 sceneryPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsceneryPosition = position;');
      shader.fragmentShader='varying vec3 sceneryPosition;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nvec2 cell = floor(sceneryPosition.xz * ${scale.toFixed(2)});\nfloat stone = fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);\ndiffuseColor.rgb *= (1.0 - ${amount.toFixed(2)} + stone * ${(amount*2).toFixed(2)});`);
    };
    material.customProgramCacheKey=()=>SCENERY_REVISION+'-'+kind;
  }
  return material;
}
export function createTrackScenery(track,model,origin={x:0,y:0}){
  const {buffers,...plan}=buildSceneryPlan(track,model,origin),group=new T.Group();group.name='read-only-track-scenery';
  const colors={shoulder:'#56605e',asphalt:'#5b6466',gravel:'#bfa781',rail:'#aeb9b8',concrete:'#bec2b9',protectionRed:'#c95648',protectionWhite:'#e5ddcb',posts:'#737f7d'};
  for(const [kind,positions] of Object.entries(buffers)){
    if(!positions.length)continue;
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeBoundingSphere();
    let object;
    if(kind==='fence')object=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#9faeab',transparent:true,opacity:.42}));
    else{geometry.computeVertexNormals();object=new T.Mesh(geometry,surfaceMaterial(colors[kind],kind));}
    object.name='scenery-'+kind;group.add(object);
  }
  return {
    group,plan,groundMaterial:()=>surfaceMaterial(plan.entry.ground,'grass'),
    setVisible(details,mode){group.visible=Boolean(details);const fence=group.children.find(o=>o.name==='scenery-fence');if(fence)fence.visible=mode!=='overview';},
    info(){return {...plan.stats,visible:group.visible,meshes:group.children.length,triangles:group.children.filter(o=>o.isMesh).reduce((n,o)=>n+o.geometry.attributes.position.count/3,0),referenceYear:plan.entry.referenceYear,source:plan.entry.source,estimated:true,zones:plan.zones.map(z=>({station:z.station,surface:z.surface,renderedTiles:z.renderedTiles}))};},
    dispose(){group.removeFromParent();for(const object of [...group.children]){object.geometry.dispose();object.material.dispose();group.remove(object);}}
  };
}
