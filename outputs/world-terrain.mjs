/* NASA SRTM scenery only. Does not import the solver, policy or save engine. */
import * as T from './vendor/three.module.js';
export const WORLD_RADIUS_M=1000;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=t=>t*t*(3-2*t);
const pending=new Map();
let manifestPromise;
export async function loadLandscape(id){
  if(!['monza','monaco','le-mans'].includes(id))return null;
  if(pending.has(id))return pending.get(id);
  const local=path=>new URL('./data/landscape/'+path,import.meta.url);
  const request=async path=>{const r=await fetch(local(path));if(!r.ok)throw Error('Dati locali non disponibili: '+path);return r;};
  const promise=(async()=>{
    manifestPromise??=request('manifest.json').then(r=>r.json()).catch(e=>{manifestPromise=null;throw e;});
    const manifest=await manifestPromise,entry=manifest.circuits[id];
    if(!entry)throw Error('Circuito senza dati NASA');
    const [bytes,places]=await Promise.all([request(entry.grid.file).then(r=>r.arrayBuffer()),request(entry.placesFile).then(r=>r.json())]);
    if(bytes.byteLength!==entry.grid.columns*entry.grid.rows*4)throw Error('Griglia NASA incompleta');
    const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    if(sha!==entry.grid.sha256)throw Error('Integrità griglia NASA non valida');
    const view=new DataView(bytes),heights=Float32Array.from({length:bytes.byteLength/4},(_,i)=>view.getFloat32(i*4,true));
    if(heights.some(h=>!Number.isFinite(h)||h<=-32768))throw Error('Quote NASA non valide');
    return {entry,manifest,heights,places};
  })().catch(error=>{pending.delete(id);throw error;});
  pending.set(id,promise);return promise;
}

// Exact segment BVH: the legacy physics grid is intentionally not reused for
// far-field distance queries, where its early exit is only a local heuristic.
export function roadDistance(track){
  const segments=track.walls.map(w=>({a:w.a,b:w.b,minX:Math.min(w.a.x,w.b.x),maxX:Math.max(w.a.x,w.b.x),minY:Math.min(w.a.y,w.b.y),maxY:Math.max(w.a.y,w.b.y)}));
  function build(list){
    const box={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};for(const s of list){box.minX=Math.min(box.minX,s.minX);box.maxX=Math.max(box.maxX,s.maxX);box.minY=Math.min(box.minY,s.minY);box.maxY=Math.max(box.maxY,s.maxY);}
    if(list.length<=12)return {...box,list};
    const axis=box.maxX-box.minX>box.maxY-box.minY?'X':'Y';list.sort((a,b)=>(a['min'+axis]+a['max'+axis])-(b['min'+axis]+b['max'+axis]));const m=list.length>>1;return {...box,left:build(list.slice(0,m)),right:build(list.slice(m))};
  }
  const root=build(segments),boxDistance=(b,x,y)=>Math.max(b.minX-x,0,x-b.maxX)**2+Math.max(b.minY-y,0,y-b.maxY)**2;
  return (x,y)=>{
    let best=Infinity;const stack=[root];
    while(stack.length){const node=stack.pop();if(boxDistance(node,x,y)>=best)continue;
      if(node.list){for(const s of node.list){const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,t=clamp(((x-s.a.x)*dx+(y-s.a.y)*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,(x-s.a.x-dx*t)**2+(y-s.a.y-dy*t)**2);}}
      else{const dl=boxDistance(node.left,x,y),dr=boxDistance(node.right,x,y);if(dl<dr)stack.push(node.right,node.left);else stack.push(node.left,node.right);}
    }
    return Math.sqrt(best)/(track.pixelsPerMeter||1);
  };
}
export function gridHeight(data,x,y){
  const g=data.entry.grid,u=(x-g.origin[0])/g.stepM,v=(y-g.origin[1])/g.stepM;
  if(u<0||v<0||u>g.columns-1||v>g.rows-1)throw Error('Punto esterno alla copertura NASA');
  const ix=Math.min(g.columns-2,Math.floor(u)),iy=Math.min(g.rows-2,Math.floor(v)),fx=u-ix,fy=v-iy,a=iy*g.columns+ix,h=data.heights;
  return h[a]*(1-fx)*(1-fy)+h[a+1]*fx*(1-fy)+h[a+g.columns]*(1-fx)*fy+h[a+g.columns+1]*fx*fy;
}
export function createWorldTerrain(track,ground,data,material){
  const ppm=track.pixelsPerMeter||1,b=track.bounds,padding=1100*ppm,origin={x:b.x+b.width/2,y:b.y+b.height/2},width=b.width+2*padding,height=b.height+2*padding;
  const nx=Math.ceil(width/(24*ppm)),nz=Math.ceil(height/(24*ppm)),base=new T.PlaneGeometry(width,height,nx,nz);base.rotateX(-Math.PI/2);
  const p=base.attributes.position,distances=new Float32Array(p.count),color=new Float32Array(p.count*3),distanceAt=roadDistance(track),anchor=track.center[0];
  const datumM=gridHeight(data,anchor.x,anchor.y)-ground.sample(anchor.x,anchor.y).height,background=new T.Color(material.color),earth=new T.Color(),low=new T.Color('#52774a'),high=new T.Color('#8b9573'),water=new T.Color('#335e69');
  let min=Infinity,max=-Infinity;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i)+origin.x,y=p.getZ(i)+origin.y,d=distanceAt(x,y),absolute=gridHeight(data,x,y),raw=absolute-datumM,w=smooth(clamp((d-120)/180,0,1)),edge=smooth(clamp((d-WORLD_RADIUS_M)/90,0,1));
    const near= w<1 ? ground.visualHeight(x,y) : 0;
    const h=((near*(1-w)+raw*w)*(1-edge)-.12)*ppm;p.setY(i,h);distances[i]=d;min=Math.min(min,h/ppm);max=Math.max(max,h/ppm);
    earth.copy(low).lerp(high,clamp((absolute-data.entry.grid.absoluteRangeM[0])/Math.max(1,data.entry.grid.absoluteRangeM[1]-data.entry.grid.absoluteRangeM[0]),0,1)*.65);
    // Coastal tint is an inference from zero-elevation samples, not a water map.
    if(data.entry.srtm.producerGranuleId.startsWith('N43')&&absolute<=.15&&d>160)earth.copy(water);
    earth.lerp(background,edge);color.set([earth.r,earth.g,earth.b],i*3);
  }
  base.setAttribute('color',new T.BufferAttribute(color,3));base.computeVertexNormals();
  const near=[],far=[];for(let i=0;i<base.index.count;i+=3){const tri=[base.index.getX(i),base.index.getX(i+1),base.index.getX(i+2)];(tri.some(k=>distances[k]<96)?near:far).push(...tri);}
  const group=new T.Group();group.name='nasa-srtm-landscape';material.dispose();
  const materials=[new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide,depthWrite:false}),new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide})];
  const geometries=[near,far].map(indices=>{const g=new T.BufferGeometry();for(const [name,attr]of Object.entries(base.attributes))g.setAttribute(name,attr);g.setIndex(indices);g.computeBoundingSphere();return g;});
  geometries.forEach((g,i)=>{const mesh=new T.Mesh(g,materials[i]);mesh.renderOrder=i?-9:-8;group.add(mesh);});
  // PlaneGeometry's diagonal is shared by this sampler and both draw batches.
  const heightAt=(x,y)=>{
    const u=clamp((x-origin.x+width/2)/width*nx,0,nx-.000001),v=clamp((y-origin.y+height/2)/height*nz,0,nz-.000001),ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz,a=iz*(nx+1)+ix,h00=p.getY(a),h10=p.getY(a+1),h01=p.getY(a+nx+1),h11=p.getY(a+nx+2);
    return fx+fz<=1?h00+(h10-h00)*fx+(h01-h00)*fz:h11+(h01-h11)*(1-fx)+(h10-h11)*(1-fz);
  };
  const footprint=[];
  // Fit what the requested 1 km band actually draws, not the blank fade margin.
  for(let i=0;i<p.count;i+=7)if(distances[i]<=WORLD_RADIUS_M)footprint.push({x:p.getX(i)+origin.x,y:p.getZ(i)+origin.y,height:p.getY(i)});
  group.userData={heightAt,distanceAt,data,footprint,info:{revision:data.manifest.revision,source:'NASA SRTMGL1 v003',coverageM:WORLD_RADIUS_M,estimatedRegistration:true,rmseM:data.entry.registration.rmseM,blendM:[120,300],verticalScale:1,sourceAbsoluteRangeM:data.entry.grid.absoluteRangeM,renderedRangeM:[min,max],vertices:p.count,triangles:base.index.count/3,drawCalls:2,physicalSurfaceUnchanged:true},dispose(){for(const g of geometries)g.dispose();base.dispose();for(const m of materials)m.dispose();group.removeFromParent();}};
  return group;
}
