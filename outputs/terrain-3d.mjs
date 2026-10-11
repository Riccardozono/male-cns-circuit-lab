import * as T from './vendor/three.module.js';
import './data/terrain.js';
import * as Surface from './terrain.js';
export const Terrain=Surface.default||globalThis.MaleCNSTerrain;
const basis=new T.Matrix4(),xAxis=new T.Vector3(),yAxis=new T.Vector3(),zAxis=new T.Vector3();
export function placeCar(object,car,origin,ground,offset=0){
  const ppm=car.pixelsPerMeter||1,frame=Terrain.frame(ground?.sample(car.x,car.y)||{height:0},car.heading);
  basis.makeBasis(xAxis.fromArray(frame.forward),yAxis.fromArray(frame.normal),zAxis.fromArray(frame.side));
  object.position.set(car.x-origin.x,(frame.height+offset)*ppm,car.y-origin.y);object.rotation.setFromRotationMatrix(basis);object.scale.setScalar(ppm);object.updateMatrix();return frame;
}
export function drape(geometry,origin,ground,visual=false){
  if(!ground||ground.flat)return geometry;const p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i)+origin.x,y=p.getZ(i)+origin.y,h=visual?ground.visualHeight(x,y):ground.sample(x,y).height;p.setY(i,p.getY(i)+h*ground.ppm);}
  p.needsUpdate=true;if(geometry.attributes.normal||geometry.index)geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
// Preserve the original XY polygon triangles exactly while refining long
// straight spans so an interpolated hill cannot cut through a coarse road face.
export function refineRoad(geometry,maxEdge=12){
  const p=geometry.attributes.position,vertices=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]),midpoints=new Map(),out=[],stack=[];
  const indices=geometry.index?Array.from(geometry.index.array):vertices.map((_,i)=>i);
  for(let i=0;i<indices.length;i+=3)stack.push(indices.slice(i,i+3));
  const midpoint=(a,b)=>{const key=Math.min(a,b)+':'+Math.max(a,b);if(midpoints.has(key))return midpoints.get(key);const v=vertices[a].map((n,i)=>(n+vertices[b][i])/2),id=vertices.push(v)-1;midpoints.set(key,id);return id;};
  while(stack.length){const tri=stack.pop(),lengths=tri.map((a,i)=>{const b=tri[(i+1)%3];return Math.hypot(vertices[a][0]-vertices[b][0],vertices[a][2]-vertices[b][2]);}),edge=lengths.indexOf(Math.max(...lengths));
    if(lengths[edge]<=maxEdge){out.push(...tri);continue;}
    const a=tri[edge],b=tri[(edge+1)%3],c=tri[(edge+2)%3],m=midpoint(a,b);stack.push([a,m,c],[m,b,c]);if(vertices.length>350000)throw Error('Budget superficie 3D superato');
  }
  const refined=new T.BufferGeometry();refined.setAttribute('position',new T.Float32BufferAttribute(vertices.flat(),3));refined.setIndex(out);geometry.dispose();return refined;
}
export function terrainMesh(track,material,ground){
  const b=track.bounds,ppm=track.pixelsPerMeter||1,padding=240*ppm,origin={x:b.x+b.width/2,y:b.y+b.height/2},width=b.width+padding*2,height=b.height+padding*2;
  const nx=Math.min(300,Math.max(24,Math.ceil(width/(18*ppm)))),nz=Math.min(180,Math.max(24,Math.ceil(height/(18*ppm)))),g=new T.PlaneGeometry(width,height,nx,nz);g.rotateX(-Math.PI/2);
  drape(g,origin,ground,true);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)-.12*ppm);
  material.depthWrite=false;const mesh=new T.Mesh(g,material);mesh.renderOrder=-9;mesh.name='estimated-terrain';
  mesh.userData.heightAt=(x,y)=>{const u=Math.max(0,Math.min(nx-.000001,(x-origin.x+width/2)/width*nx)),v=Math.max(0,Math.min(nz-.000001,(y-origin.y+height/2)/height*nz)),ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz,a=iz*(nx+1)+ix,h00=p.getY(a),h10=p.getY(a+1),h01=p.getY(a+nx+1),h11=p.getY(a+nx+2);return fx+fz<=1?h00+(h10-h00)*fx+(h01-h00)*fz:h11+(h01-h11)*(1-fx)+(h10-h11)*(1-fz);};return mesh;
}
