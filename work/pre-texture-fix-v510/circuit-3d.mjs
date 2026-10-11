/* Read-only 3D view. One metre in the physical model is one scene unit.
 * Road triangles have exactly the same outer/inner rings as collision/sensors.
 * Flat terrain and vertical edge markers are schematic, not surveyed heights.
 * No controller, physics tick, random generator or training command lives here. */
import * as T from './vendor/three.module.js';
import {CarFleet,CAR_VISUAL_REVISION} from './car-3d.mjs';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function overviewFit(bounds,aspect,yaw=2.3,pitch=.90,fov=48,points=null,target={x:0,z:0}){
  const tangent=Math.tan(fov*Math.PI/360),halfX=bounds.width/2,halfZ=bounds.height/2;
  const coordinates=points?points.map(p=>[p.x-bounds.x-halfX-target.x,p.y-bounds.y-halfZ-target.z]):[-halfX,halfX].flatMap(x=>[-halfZ,halfZ].map(z=>[x,z]));
  let distance=0;
  for(const [x,z] of coordinates){
    const horizontal=x*Math.cos(yaw)-z*Math.sin(yaw),along=x*Math.sin(yaw)+z*Math.cos(yaw);
    distance=Math.max(distance,along*Math.cos(pitch)+Math.max(Math.abs(horizontal)/(tangent*Math.max(.1,aspect)),Math.abs(along*Math.sin(pitch))/tangent));
  }
  return Math.max(20,distance*1.10);
}
export function overviewTarget(track,yaw=2.3){
  const b=track.bounds,cx=b.x+b.width/2,cz=b.y+b.height/2;let loU=Infinity,hiU=-Infinity,loV=Infinity,hiV=-Infinity;
  for(const p of track.outer){const x=p.x-cx,z=p.y-cz,u=x*Math.cos(yaw)-z*Math.sin(yaw),v=x*Math.sin(yaw)+z*Math.cos(yaw);loU=Math.min(loU,u);hiU=Math.max(hiU,u);loV=Math.min(loV,v);hiV=Math.max(hiV,v);}
  const u=(loU+hiU)/2,v=(loV+hiV)/2;return {x:u*Math.cos(yaw)+v*Math.sin(yaw),z:-u*Math.sin(yaw)+v*Math.cos(yaw)};
}

export function roadGeometry(track,origin={x:0,y:0},height=.035){
  const points=ring=>ring.map(p=>new T.Vector2(p.x-origin.x,-(p.y-origin.y)));
  const shape=new T.Shape(points(track.outer));shape.holes.push(new T.Path(points(track.inner)));
  const geometry=new T.ShapeGeometry(shape),position=geometry.getAttribute('position');
  for(let i=0;i<position.count;i++)position.setXYZ(i,position.getX(i),height,-position.getY(i));
  geometry.computeVertexNormals();return geometry;
}
function triangles(points){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.computeVertexNormals();return g;}
function quad(out,a,b,c,d){out.push(...a,...b,...c,...a,...c,...d);}
function boundaryGeometry(track,origin,height){
  const p=[];for(const wall of track.walls){const a=wall.a,b=wall.b;quad(p,[a.x-origin.x,.02,a.y-origin.y],[a.x-origin.x,height,a.y-origin.y],[b.x-origin.x,height,b.y-origin.y],[b.x-origin.x,.02,b.y-origin.y]);}return triangles(p);
}
function curbGeometry(model,track,origin,onRoad){
  const colors=[[],[]],width=Math.min(.7,(track.halfWidth||5)*.15),ppm=track.pixelsPerMeter||1;
  for(const edge of model.curbs)for(let color=0;color<edge.length;color++)for(const run of edge[color])for(let i=0;i<run.length-1;i++){
    const a=run[i],b=run[i+1],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<1e-9)continue;
    let nx=-(b.y-a.y)/length*width,ny=(b.x-a.x)/length*width;
    if(!onRoad(track,(a.x+b.x)/2+nx/2,(a.y+b.y)/2+ny/2)){nx=-nx;ny=-ny;}
    quad(colors[color],[a.x-origin.x,.07*ppm,a.y-origin.y],[b.x-origin.x,.07*ppm,b.y-origin.y],[b.x+nx-origin.x,.08*ppm,b.y+ny-origin.y],[a.x+nx-origin.x,.08*ppm,a.y+ny-origin.y]);
  }
  return colors.map(triangles);
}
export class Circuit3D{
  constructor(canvas,{onChange=()=>{},onSelect=()=>{},onFallback=()=>{},onModelStatus=()=>{}}={}){
    this.canvas=canvas;this.onChange=onChange;this.onSelect=onSelect;this.onFallback=onFallback;this.origin={x:0,y:0};this.mode='follow';this.yaw=2.3;this.pitch=.64;this.distance=20;this.followDistance=18;this.focus=new T.Vector3();this.visible=true;this.dirty=true;this.lost=false;this.width=0;this.height=0;
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(1.5,globalThis.devicePixelRatio||1));this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.scene=new T.Scene();this.scene.background=new T.Color('#101a20');
    this.camera=new T.PerspectiveCamera(48,1,.08,20000);this.camera.up.set(0,1,0);
    this.scene.add(new T.HemisphereLight(0xc7d8e8,0x40513c,2.1));const sunlight=new T.DirectionalLight(0xffedc8,2.3);sunlight.position.set(-70,160,80);this.scene.add(sunlight);
    this.staticGroup=new T.Group();this.scene.add(this.staticGroup);this.carGroup=new T.Group();this.scene.add(this.carGroup);this.fleet=new CarFleet(this.carGroup);
    this.rayGeometry=new T.BufferGeometry();this.rayGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(11*6),3));
    this.rays=new T.LineSegments(this.rayGeometry,new T.LineBasicMaterial({color:0xff7658,depthTest:false,transparent:true,opacity:.85}));this.rays.frustumCulled=false;this.rays.renderOrder=5;this.scene.add(this.rays);
    const markerGeometry=new T.BufferGeometry();markerGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(300),3));markerGeometry.setAttribute('color',new T.BufferAttribute(new Float32Array(300),3));
    this.markers=new T.Points(markerGeometry,new T.PointsMaterial({size:5,sizeAttenuation:false,vertexColors:true,depthTest:false}));this.markers.frustumCulled=false;this.markers.renderOrder=6;this.scene.add(this.markers);
    this.selection=new T.Mesh(new T.RingGeometry(2.6,2.7,40),new T.MeshBasicMaterial({color:0xf0bd69,side:T.DoubleSide,depthTest:false}));this.selection.rotation.x=-Math.PI/2;this.selection.renderOrder=7;this.scene.add(this.selection);
    this.listeners=[];this.bindControls();
    this.modelReady=import('./supplied-car-3d.mjs').then(({SuppliedCarFleet})=>SuppliedCarFleet.load(this.carGroup)).then(fleet=>{
      if(this.disposed){fleet.dispose();return false;}
      this.fleet.dispose();this.fleet=fleet;this.carRevision='992-user-glb-lod-1';this.dirty=true;onModelStatus('Porsche 992 dello ZIP · dettaglio adattivo su GPU');this.onChange();return true;
    }).catch(error=>{onModelStatus('Modello Porsche non disponibile: auto semplificata temporanea. '+error.message);return false;});
    this.listen('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.onFallback('Contesto 3D perso. La simulazione continua in 2D.');});
  }
  listen(name,handler,options){this.canvas.addEventListener(name,handler,options);this.listeners.push([name,handler,options]);}
  bindControls(){
    const pointers=new Map();let gesture=null,pinch=0;
    this.listen('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture={x:e.clientX,y:e.clientY,moved:false,pan:e.shiftKey||e.button===2};if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});
    this.listen('pointermove',e=>{
      if(!pointers.has(e.pointerId)||!gesture)return;const previous=pointers.get(e.pointerId),dx=e.clientX-previous.x,dy=e.clientY-previous.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===2){const p=[...pointers.values()],d=Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y));this.zoom(d/Math.max(1,pinch));pinch=d;gesture.moved=true;return;}
      if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>4)gesture.moved=true;if(!gesture.moved)return;
      if(gesture.pan)this.pan(dx,dy);else{this.yaw-=dx*.008;this.pitch=clamp(this.pitch+dy*.006,.10,1.48);this.dirty=true;this.onChange();}
    });
    const end=e=>{if(!pointers.has(e.pointerId))return;const choose=gesture&&!gesture.moved&&pointers.size===1;pointers.delete(e.pointerId);if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);if(choose)this.pick(e.clientX,e.clientY);if(!pointers.size)gesture=null;};
    this.listen('pointerup',end);this.listen('pointercancel',e=>{pointers.delete(e.pointerId);gesture=null;});
    this.listen('contextmenu',e=>e.preventDefault());
    this.listen('wheel',e=>{e.preventDefault();this.zoom(Math.exp(-e.deltaY*.001));},{passive:false});
    this.listen('keydown',e=>{let handled=true;if(e.key==='+'||e.key==='=')this.zoom(1.3);else if(e.key==='-')this.zoom(1/1.3);else if(e.key==='Home')this.reset();else if(e.key==='ArrowLeft')this.yaw+=.13;else if(e.key==='ArrowRight')this.yaw-=.13;else if(e.key==='ArrowUp')this.pitch=clamp(this.pitch+.10,.10,1.48);else if(e.key==='ArrowDown')this.pitch=clamp(this.pitch-.10,.10,1.48);else handled=false;if(handled){e.preventDefault();this.dirty=true;this.onChange();}});
  }
  setTrack(track,model,onRoad){
    if(this.track===track&&this.model===model)return;
    this.clearStatic();this.track=track;this.model=model;const b=track.bounds;this.origin={x:b.x+b.width/2,y:b.y+b.height/2};
    this.scene.background.set(model.theme.ground);
    const add=(geometry,material)=>{const mesh=new T.Mesh(geometry,material);this.staticGroup.add(mesh);return mesh;};
    const ground=new T.PlaneGeometry(Math.max(b.width,b.height)*1.8,Math.max(b.width,b.height)*1.8);ground.rotateX(-Math.PI/2);add(ground,new T.MeshLambertMaterial({color:model.theme.ground}));
    this.road=add(roadGeometry(track,this.origin),new T.MeshLambertMaterial({color:model.theme.road,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    const outline=[];for(const wall of track.walls)outline.push(wall.a.x-this.origin.x,.06,wall.a.y-this.origin.y,wall.b.x-this.origin.x,.06,wall.b.y-this.origin.y);
    const outlineGeometry=new T.BufferGeometry();outlineGeometry.setAttribute('position',new T.Float32BufferAttribute(outline,3));
    this.outline=new T.LineSegments(outlineGeometry,new T.LineBasicMaterial({color:0x82999d}));this.staticGroup.add(this.outline);
    // Physical edge visualization, not an assertion about real track barriers.
    this.edges=add(boundaryGeometry(track,this.origin,.20*(track.pixelsPerMeter||1)),new T.MeshLambertMaterial({color:0x9aaba4,side:T.DoubleSide}));
    this.kerbs=curbGeometry(model,track,this.origin,onRoad).map((g,i)=>add(g,new T.MeshLambertMaterial({color:model.theme.curbColors[i],side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-4})));
    const start=track.center[0],next=track.center[1],heading=Math.atan2(next.y-start.y,next.x-start.x),width=(track.widthMeters?.[0]||track.halfWidth*2),ppm=track.pixelsPerMeter||1;
    const count=Math.max(4,Math.round(width/(.6*ppm))),checker=[[],[]],x=start.x-this.origin.x,z=start.y-this.origin.y,cos=Math.cos(heading),sin=Math.sin(heading),point=(a,b)=>[x+cos*a-sin*b,.055,z+sin*a+cos*b];
    for(let row=0;row<2;row++)for(let col=0;col<count;col++){const a=(row-.5)*.45*ppm,b=-width/2+col*width/count;quad(checker[(row+col)%2],point(a,b),point(a+.45*ppm,b),point(a+.45*ppm,b+width/count),point(a,b+width/count));}
    checker.forEach((p,i)=>add(triangles(p),new T.MeshBasicMaterial({color:i?0xf4efdf:0x13191d,side:T.DoubleSide})));
    this.overviewDistance=this.fitDistance();this.reset();
  }
  clearStatic(){for(const o of [...this.staticGroup.children]){o.geometry?.dispose();o.material?.dispose();this.staticGroup.remove(o);}}
  fitDistance(){return this.track?overviewFit(this.track.bounds,this.camera.aspect,this.yaw,this.pitch,this.camera.fov,this.track.outer,overviewTarget(this.track,this.yaw)):1200;}
  centreOverview(){const target=this.track?overviewTarget(this.track,this.yaw):{x:0,z:0};this.focus.set(target.x,0,target.z);this.overviewDistance=this.fitDistance();this.distance=this.overviewDistance;}
  resize(){const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(1.5,globalThis.devicePixelRatio||1);if(this.width!==r.width||this.height!==r.height||this.dpr!==dpr){
    const ratio=this.distance/(this.overviewDistance||this.distance);
    this.width=r.width;this.height=r.height;this.dpr=dpr;this.renderer.setPixelRatio(dpr);this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;
    if(this.track){this.overviewDistance=this.fitDistance();if(this.mode==='overview')this.distance=this.overviewDistance*ratio;}
    this.camera.updateProjectionMatrix();this.dirty=true;
  }}
  setMode(mode){this.mode=mode==='follow'?'follow':'overview';if(this.mode==='overview'){this.pitch=.90;this.yaw=2.3;this.centreOverview();}else{this.pitch=.50;this.yaw=-1.05;}this.dirty=true;}
  reset(){this.focus.set(0,0,0);this.followDistance=18;this.yaw=this.mode==='follow'?-1.05:2.3;this.pitch=this.mode==='follow'?.50:.90;this.centreOverview();this.dirty=true;this.onChange();}
  zoom(factor){if(this.mode==='follow')this.followDistance=clamp(this.followDistance/factor,6,150);else this.distance=clamp(this.distance/factor,8,(this.overviewDistance||3000)*2);this.dirty=true;this.onChange();}
  focusPoint(point){this.mode='overview';this.focus.set(point.x-this.origin.x,0,point.y-this.origin.y);this.distance=95;this.pitch=.85;this.dirty=true;this.onChange();}
  pan(dx,dy){if(this.mode==='follow'){this.mode='overview';this.distance=this.followDistance;}const unit=this.distance/Math.max(200,this.height);this.focus.x-=Math.cos(this.yaw)*dx*unit+Math.sin(this.yaw)*dy*unit;this.focus.z+=Math.sin(this.yaw)*dx*unit-Math.cos(this.yaw)*dy*unit;this.dirty=true;this.onChange();}
  project(car){const v=new T.Vector3(car.x-this.origin.x,.8*(car.pixelsPerMeter||1),car.y-this.origin.y).project(this.camera);return {x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2,visible:v.z>-1&&v.z<1};}
  pick(clientX,clientY){if(!this.cars)return;const r=this.canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;let min=22,id=null;for(const car of this.cars){const p=this.project(car),d=Math.hypot(p.x-x,p.y-y);if(p.visible&&d<min){min=d;id=car.id;}}if(id!==null)this.onSelect(id);}
  render(sim,selected,palette,{sensors=true,boundaries=false,details=true,sensorDistances,angles}={}){
    if(this.lost||!this.track||!selected)return;this.resize();if(!this.width||!this.height)return;this.cars=sim.cars;
    const ppm=selected.pixelsPerMeter||1;
    if(this.mode==='follow')this.focus.set(selected.x-this.origin.x,.55*ppm,selected.y-this.origin.y);
    const yaw=this.yaw-(this.mode==='follow'?selected.heading:0),distance=this.mode==='follow'?this.followDistance*ppm:this.distance;
    const near=Math.max(.05,distance*.003),far=Math.max(250,distance+Math.hypot(this.track.bounds.width,this.track.bounds.height)*2);
    if(this.camera.near!==near||this.camera.far!==far){this.camera.near=near;this.camera.far=far;this.camera.updateProjectionMatrix();}
    this.camera.position.set(this.focus.x+Math.sin(yaw)*Math.cos(this.pitch)*distance,this.focus.y+Math.sin(this.pitch)*distance,this.focus.z+Math.cos(yaw)*Math.cos(this.pitch)*distance);this.camera.lookAt(this.focus);this.camera.updateMatrixWorld();
    this.fleet.update(sim.cars,this.origin,palette,{selected,camera:this.camera,height:this.height,mode:this.mode});
    this.edges.visible=boundaries||details;this.outline.visible=this.mode==='overview'||boundaries;this.edges.material.color.set(boundaries?0xffc476:0x9aaba4);for(const curb of this.kerbs)curb.visible=details;
    this.road.material.color.set(this.mode==='overview'?0x62757b:this.model.theme.road);this.outline.material.color.set(this.mode==='overview'?0xb1c0c1:0x82999d);
    this.selection.position.set(selected.x-this.origin.x,.10*ppm,selected.y-this.origin.y);this.selection.scale.setScalar(ppm);
    this.rays.visible=sensors;
    if(sensors&&sensorDistances){const distances=sensorDistances(sim.track,selected),p=this.rayGeometry.attributes.position;for(let i=0;i<distances.length;i++){const a=selected.heading+angles[i],x=selected.x-this.origin.x,z=selected.y-this.origin.y;p.setXYZ(i*2,x,.52*ppm,z);p.setXYZ(i*2+1,x+Math.cos(a)*distances[i],.52*ppm,z+Math.sin(a)*distances[i]);}p.needsUpdate=true;this.rayGeometry.setDrawRange(0,distances.length*2);}
    const p=this.markers.geometry.attributes.position,c=this.markers.geometry.attributes.color,color=new T.Color();this.markers.visible=this.mode!=='follow'||distance>90*ppm;
    for(let i=0;i<sim.cars.length;i++){const car=sim.cars[i];p.setXYZ(i,car.x-this.origin.x,1.4*ppm,car.y-this.origin.y);color.set(palette[car.id%palette.length]);if(!car.alive)color.multiplyScalar(.35);c.setXYZ(i,color.r,color.g,color.b);}p.needsUpdate=true;c.needsUpdate=true;this.markers.geometry.setDrawRange(0,sim.cars.length);
    this.renderer.render(this.scene,this.camera);this.dirty=false;
  }
  info(){return {backend:'WebGL 2',carRevision:this.carRevision||CAR_VISUAL_REVISION,mode:this.mode,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,roadVertices:this.road?.geometry.attributes.position.count,carCount:this.fleet.carCount??this.fleet.parts[0].mesh.count,carLods:this.fleet.info?.(),lost:this.lost};}
  dispose(){this.disposed=true;for(const args of this.listeners)this.canvas.removeEventListener(...args);this.clearStatic();this.fleet.dispose();for(const object of [this.rays,this.markers,this.selection]){object.geometry.dispose();object.material.dispose();}this.renderer.dispose();}
}
