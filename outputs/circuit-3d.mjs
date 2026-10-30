/* Read-only 3D view. One metre in the physical model is one scene unit.
 * Road triangles have exactly the same outer/inner rings as collision/sensors.
 * Shared estimated terrain and edge markers, not surveyed heights.
 * No controller, physics tick, random generator or training command lives here. */
import * as T from './vendor/three.module.js';
import {CarFleet,CAR_VISUAL_REVISION,DRIVER_EYE} from './car-3d.mjs';
import {createTrackScenery} from './track-scenery.mjs';
import {Terrain,drape,refineRoad,terrainMesh,placeCar} from './terrain-3d.mjs';
import {createVegetation} from './vegetation.mjs';
import {EnvironmentAssets} from './environment-assets.mjs';
import {createBuildings} from './buildings.mjs';
import {createTrackFacilities} from './track-facilities.mjs';
import {loadLandscape,createWorldTerrain} from './world-terrain.mjs';
import {createDistrictBuildings} from './district-buildings.mjs';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createDriverPose(){return {body:new T.Object3D(),tilt:new T.Matrix4(),matrix:new T.Matrix4(),position:new T.Vector3(),forward:new T.Vector3(),up:new T.Vector3(),target:new T.Vector3()};}
export function driverCameraFrame(car,origin,ground,lookYaw=0,lookPitch=0,pose=createDriverPose()){
  // Same road frame and bounded body tilt as the exterior. Observation only.
  placeCar(pose.body,car,origin,ground,.04);
  const pitch=clamp(Number(car.vehicle?.pitch)||0,-.09,.09),roll=clamp(Number(car.vehicle?.roll)||0,-.10,.10);
  pose.tilt.makeRotationFromEuler(new T.Euler(roll,0,-pitch));pose.matrix.multiplyMatrices(pose.body.matrix,pose.tilt);
  pose.position.set(DRIVER_EYE.x,DRIVER_EYE.y,DRIVER_EYE.z).applyMatrix4(pose.matrix);
  pose.forward.set(Math.cos(lookYaw)*Math.cos(lookPitch),Math.sin(lookPitch),Math.sin(lookYaw)*Math.cos(lookPitch)).transformDirection(pose.matrix);
  pose.up.set(0,1,0).transformDirection(pose.matrix);pose.target.copy(pose.position).addScaledVector(pose.forward,30*(car.pixelsPerMeter||1));return pose;
}
function createCockpit(){
  // Original schematic dashboard/wheel; the supplied GLB is exterior-only.
  const group=new T.Group(),material=new T.MeshPhongMaterial({color:0x171e25,shininess:12}),trim=new T.MeshPhongMaterial({color:0x4a5560,shininess:24});
  const box=(size,position,mat=material)=>{const mesh=new T.Mesh(new T.BoxGeometry(...size),mat);mesh.position.set(...position);group.add(mesh);return mesh;};
  box([.32,.12,1.38],[.64,.64,0]);box([.20,.19,.26],[.60,.70,-.32],trim);
  const wheel=new T.Group();wheel.position.set(.43,.70,-.32);group.add(wheel);
  const rim=new T.Mesh(new T.TorusGeometry(.17,.021,8,24),material);rim.rotation.y=Math.PI/2;wheel.add(rim);
  for(const angle of [0,Math.PI*2/3,Math.PI*4/3]){const spoke=new T.Mesh(new T.BoxGeometry(.035,.026,.17),trim);spoke.position.set(0,Math.sin(angle)*.075,Math.cos(angle)*.075);spoke.rotation.x=-angle;wheel.add(spoke);}
  const hub=new T.Mesh(new T.BoxGeometry(.05,.07,.07),material);wheel.add(hub);
  group.matrixAutoUpdate=false;group.visible=false;return {group,wheel};
}
export function overviewFit(bounds,aspect,yaw=2.3,pitch=.90,fov=48,points=null,target={x:0,z:0}){
  const tangent=Math.tan(fov*Math.PI/360),halfX=bounds.width/2,halfZ=bounds.height/2;
  const coordinates=points?points.map(p=>[p.x-bounds.x-halfX-target.x,p.y-bounds.y-halfZ-target.z,(p.height||0)-(target.y||0)]):[-halfX,halfX].flatMap(x=>[-halfZ,halfZ].map(z=>[x,z,0]));
  let distance=0;
  for(const [x,z,y] of coordinates){
    const horizontal=x*Math.cos(yaw)-z*Math.sin(yaw),along=x*Math.sin(yaw)+z*Math.cos(yaw);
    distance=Math.max(distance,along*Math.cos(pitch)+y*Math.sin(pitch)+Math.max(Math.abs(horizontal)/(tangent*Math.max(.1,aspect)),Math.abs(y*Math.cos(pitch)-along*Math.sin(pitch))/tangent));
  }
  return Math.max(20,distance*1.10);
}
export function overviewTarget(track,yaw=2.3){
  const b=track.bounds,cx=b.x+b.width/2,cz=b.y+b.height/2;let loU=Infinity,hiU=-Infinity,loV=Infinity,hiV=-Infinity;
  for(const p of track.outer){const x=p.x-cx,z=p.y-cz,u=x*Math.cos(yaw)-z*Math.sin(yaw),v=x*Math.sin(yaw)+z*Math.cos(yaw);loU=Math.min(loU,u);hiU=Math.max(hiU,u);loV=Math.min(loV,v);hiV=Math.max(hiV,v);}
  const u=(loU+hiU)/2,v=(loV+hiV)/2,heights=track.outer.map(p=>p.height||0);return {x:u*Math.cos(yaw)+v*Math.sin(yaw),y:(Math.min(...heights)+Math.max(...heights))/2,z:-u*Math.sin(yaw)+v*Math.cos(yaw)};
}

export function roadGeometry(track,origin={x:0,y:0},height=.035){
  const points=ring=>ring.map(p=>new T.Vector2(p.x-origin.x,-(p.y-origin.y)));
  const shape=new T.Shape(points(track.outer));shape.holes.push(new T.Path(points(track.inner)));
  let geometry=new T.ShapeGeometry(shape);const ground=Terrain.forTrack(track);if(!ground.flat)geometry=refineRoad(geometry,12*(track.pixelsPerMeter||1));const position=geometry.getAttribute('position');
  for(let i=0;i<position.count;i++)position.setXYZ(i,position.getX(i),height,-position.getY(i));
  drape(geometry,origin,ground);geometry.computeVertexNormals();return geometry;
}
export function groundMesh(bounds,material,ppm=1){
  const size=Math.max(bounds.width,bounds.height)*20,geometry=new T.PlaneGeometry(size,size);geometry.rotateX(-Math.PI/2);
  // Large ground triangles must not win depth interpolation against centimetre
  // high road/apron meshes on kilometre-wide maps. Draw terrain as a backdrop,
  // below the road and without writing depth; all actual scene objects follow.
  material.depthWrite=false;const mesh=new T.Mesh(geometry,material);mesh.position.y=-.15*ppm;mesh.renderOrder=-10;return mesh;
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
  constructor(canvas,{onChange=()=>{},onSelect=()=>{},onFallback=()=>{},onModelStatus=()=>{},onReset=null}={}){
    this.canvas=canvas;this.onChange=onChange;this.onSelect=onSelect;this.onFallback=onFallback;this.onReset=onReset;this.origin={x:0,y:0};this.mode='follow';this.yaw=2.3;this.pitch=.64;this.distance=20;this.followDistance=18;this.focus=new T.Vector3();this.visible=true;this.dirty=true;this.lost=false;this.width=0;this.height=0;
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(1.5,globalThis.devicePixelRatio||1));this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.scene=new T.Scene();this.scene.background=new T.Color('#101a20');
    this.camera=new T.PerspectiveCamera(48,1,.08,20000);this.camera.up.set(0,1,0);
    this.lookYaw=0;this.lookPitch=0;this.firstPersonFov=70;this.driverPose=createDriverPose();this.cockpit=createCockpit();this.scene.add(this.cockpit.group);
    this.scene.add(new T.HemisphereLight(0xc7d8e8,0x40513c,2.1));const sunlight=new T.DirectionalLight(0xffedc8,2.3);sunlight.position.set(-70,160,80);this.scene.add(sunlight);
    this.staticGroup=new T.Group();this.scene.add(this.staticGroup);this.carGroup=new T.Group();this.scene.add(this.carGroup);this.fleet=new CarFleet(this.carGroup);
    this.rayGeometry=new T.BufferGeometry();this.rayGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(11*6),3));
    this.rays=new T.LineSegments(this.rayGeometry,new T.LineBasicMaterial({color:0xff7658,depthTest:false,transparent:true,opacity:.85}));this.rays.frustumCulled=false;this.rays.renderOrder=5;this.scene.add(this.rays);
    const markerGeometry=new T.BufferGeometry();markerGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(300),3));markerGeometry.setAttribute('color',new T.BufferAttribute(new Float32Array(300),3));
    this.markers=new T.Points(markerGeometry,new T.PointsMaterial({size:5,sizeAttenuation:false,vertexColors:true,depthTest:false}));this.markers.frustumCulled=false;this.markers.renderOrder=6;this.scene.add(this.markers);
    this.selection=new T.Mesh(new T.RingGeometry(2.6,2.7,40),new T.MeshBasicMaterial({color:0xf0bd69,side:T.DoubleSide,depthTest:false}));this.selection.rotation.x=-Math.PI/2;this.selection.renderOrder=7;this.scene.add(this.selection);
    this.listeners=[];this.bindControls();this.environmentAssets=new EnvironmentAssets();this.onModelStatus=onModelStatus;
    this.treeReady=Promise.all(['tree','european-tree','oak-tree'].map(id=>this.environmentAssets.load(id))).then(()=>{if(!this.disposed&&this.track)this.refreshDressing();this.notifyModelStatus();return true;}).catch(error=>{if(!this.disposed){this.treeError='Alberi Sketchfab non disponibili: vegetazione di riserva. '+error.message;this.notifyModelStatus();}return false;});
    this.modelReady=import('./supplied-car-3d.mjs').then(({SuppliedCarFleet})=>SuppliedCarFleet.load(this.carGroup)).then(fleet=>{
      if(this.disposed){fleet.dispose();return false;}
      this.fleet.dispose();this.fleet=fleet;this.carRevision=fleet.info().revision;this.dirty=true;this.notifyModelStatus();this.onChange();return true;
    }).catch(error=>{if(!this.disposed){this.carError='Porsche non disponibile: auto semplificata temporanea. '+error.message;this.notifyModelStatus();}return false;});
    this.listen('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.onFallback('Contesto 3D perso. La simulazione continua in 2D.');});
  }
  listen(name,handler,options){this.canvas.addEventListener(name,handler,options);this.listeners.push([name,handler,options]);}
  modelStatus(){
    const tree=this.environmentAssets.assets.has('tree'),houses=['monaco','le-mans'].includes(this.model?.id),house=this.environmentAssets.assets.has(this.model?.id);
    const radius=(this.worldData?.entry.coverageM||1000)/1000,variants=this.vegetation?.info().variants;
    return [this.carError||(this.carRevision?'Porsche 992 · livrea originale':'Caricamento Porsche 992…'),this.treeError||(tree?`Alberi Sketchfab · ${variants||2} sagome · texture locali`:'Caricamento alberi Sketchfab…'),...(houses?[this.houseError||(house?'Edifici Sketchfab · posizioni illustrative':'Caricamento edifici locali…')]:[]),...(this.facilities?[`${this.facilities.info().grandstands} tribune · box e dettagli stimati`]:[]),...(this.model?.id!=='lab'?[this.worldError||(this.worldData?`NASA SRTM · fascia ${radius} km · raccordo stimato · ${this.districts?.info().buildings||0} edifici OSM`:'Caricamento paesaggio NASA locale…')]:[])].join(' · ');
  }
  notifyModelStatus(){if(!this.disposed)this.onModelStatus(this.modelStatus());}
  bindControls(){
    const pointers=new Map();let gesture=null,pinch=0;
    this.listen('pointerdown',e=>{if(e.button!==0&&e.button!==2)return;this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture={x:e.clientX,y:e.clientY,moved:false,pan:e.shiftKey||e.button===2};if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}});
    this.listen('pointermove',e=>{
      if(!pointers.has(e.pointerId)||!gesture)return;const previous=pointers.get(e.pointerId),dx=e.clientX-previous.x,dy=e.clientY-previous.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===2){const p=[...pointers.values()],d=Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y));this.zoom(d/Math.max(1,pinch));pinch=d;gesture.moved=true;return;}
      if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>4)gesture.moved=true;if(!gesture.moved)return;
      if(this.mode==='first-person')this.look(dx,dy);else if(gesture.pan)this.pan(dx,dy);else{this.yaw-=dx*.008;this.pitch=clamp(this.pitch+dy*.006,.10,1.48);this.dirty=true;this.onChange();}
    });
    const end=e=>{if(!pointers.has(e.pointerId))return;const choose=gesture&&!gesture.moved&&pointers.size===1;pointers.delete(e.pointerId);if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);if(choose)this.pick(e.clientX,e.clientY);if(!pointers.size)gesture=null;};
    this.listen('pointerup',end);this.listen('pointercancel',e=>{pointers.delete(e.pointerId);gesture=null;});
    this.listen('contextmenu',e=>e.preventDefault());
    this.listen('wheel',e=>{e.preventDefault();this.zoom(Math.exp(-e.deltaY*.001));},{passive:false});
    this.listen('keydown',e=>{let handled=true;if(e.key==='+'||e.key==='=')this.zoom(1.3);else if(e.key==='-')this.zoom(1/1.3);else if(e.key==='Home'){if(this.onReset)this.onReset();else this.reset();}else if(this.mode==='first-person'&&e.key.startsWith('Arrow')){const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(delta)this.look(...delta);else handled=false;}else if(e.key==='ArrowLeft')this.yaw+=.13;else if(e.key==='ArrowRight')this.yaw-=.13;else if(e.key==='ArrowUp')this.pitch=clamp(this.pitch+.10,.10,1.48);else if(e.key==='ArrowDown')this.pitch=clamp(this.pitch-.10,.10,1.48);else handled=false;if(handled){e.preventDefault();this.dirty=true;this.onChange();}});
  }
  setTrack(track,model,onRoad){
    if(this.track===track&&this.model===model)return;
    this.clearStatic();this.track=track;this.model=model;this.houseError=null;this.worldError=null;const b=track.bounds;this.origin={x:b.x+b.width/2,y:b.y+b.height/2};
    this.scene.background.set(model.theme.ground);
    const add=(geometry,material)=>{const mesh=new T.Mesh(geometry,material);this.staticGroup.add(mesh);return mesh;};
    this.scenery=createTrackScenery(track,model,this.origin);this.staticGroup.add(this.scenery.group);
    this.ground=Terrain.forTrack(track);this.terrainInfo=this.ground.info();
    for(const object of this.scenery.group.children)drape(object.geometry,this.origin,this.ground);
    this.terrainObject=terrainMesh(track,this.scenery.groundMaterial(),this.ground);this.staticGroup.add(this.terrainObject);
    this.dressingGround={...this.ground,visualHeight:(x,y)=>this.terrainObject.userData.heightAt(x,y)/this.ground.ppm};
    this.baseOverviewPoints=[...track.outer,...this.scenery.plan.footprint].map(p=>({...p,height:this.ground.sample(p.x,p.y).height*this.ground.ppm}));
    this.facilities=createTrackFacilities(track,model,this.scenery.plan,this.dressingGround,this.origin);this.staticGroup.add(this.facilities.group);
    this.refreshDressing();
    const house=['monaco','le-mans'].includes(model.id)?this.environmentAssets.load(model.id):Promise.resolve();
    const landscape=loadLandscape(model.id).then(data=>{
      if(!data||this.disposed||this.track!==track)return true;
      const world=createWorldTerrain(track,this.ground,data,this.scenery.groundMaterial());
      this.terrainObject.geometry.dispose();this.terrainObject.material.dispose();this.terrainObject.removeFromParent();this.terrainObject=world;this.staticGroup.add(world);this.worldData=data;
      this.dressingGround={...this.ground,visualHeight:(x,y)=>world.userData.heightAt(x,y)/this.ground.ppm,distanceAt:world.userData.distanceAt};
      this.facilities.dispose();this.facilities=createTrackFacilities(track,model,this.scenery.plan,this.dressingGround,this.origin);this.staticGroup.add(this.facilities.group);return true;
    }).catch(error=>{if(!this.disposed&&this.track===track)this.worldError='Paesaggio NASA non disponibile: '+error.message;return false;});
    this.notifyModelStatus();
    this.environmentReady=Promise.all([this.treeReady,house,landscape]).then(([tree,,world])=>{if(!this.disposed&&this.track===track){this.refreshDressing();this.notifyModelStatus();return tree&&world;}return false;}).catch(error=>{if(!this.disposed&&this.track===track){this.houseError='Edifici non disponibili: riprova cambiando circuito. '+error.message;this.notifyModelStatus();}return false;});
    this.staticGroup.add(groundMesh(b,this.scenery.groundMaterial(),track.pixelsPerMeter||1));
    this.road=add(roadGeometry(track,this.origin),new T.MeshLambertMaterial({color:model.theme.road,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    const outline=[];for(const wall of track.walls)outline.push(wall.a.x-this.origin.x,.06,wall.a.y-this.origin.y,wall.b.x-this.origin.x,.06,wall.b.y-this.origin.y);
    const outlineGeometry=new T.BufferGeometry();outlineGeometry.setAttribute('position',new T.Float32BufferAttribute(outline,3));drape(outlineGeometry,this.origin,this.ground);
    this.outline=new T.LineSegments(outlineGeometry,new T.LineBasicMaterial({color:0x82999d}));this.staticGroup.add(this.outline);
    // Physical edge visualization, not an assertion about real track barriers.
    this.edges=add(drape(boundaryGeometry(track,this.origin,.20*(track.pixelsPerMeter||1)),this.origin,this.ground),new T.MeshLambertMaterial({color:0x9aaba4,side:T.DoubleSide}));
    this.kerbs=curbGeometry(model,track,this.origin,onRoad).map((g,i)=>add(drape(g,this.origin,this.ground),new T.MeshLambertMaterial({color:model.theme.curbColors[i],side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-4})));
    const start=track.center[0],next=track.center[1],heading=Math.atan2(next.y-start.y,next.x-start.x),width=(track.widthMeters?.[0]||track.halfWidth*2),ppm=track.pixelsPerMeter||1;
    const count=Math.max(4,Math.round(width/(.6*ppm))),checker=[[],[]],x=start.x-this.origin.x,z=start.y-this.origin.y,cos=Math.cos(heading),sin=Math.sin(heading),point=(a,b)=>[x+cos*a-sin*b,.055,z+sin*a+cos*b];
    for(let row=0;row<2;row++)for(let col=0;col<count;col++){const a=(row-.5)*.45*ppm,b=-width/2+col*width/count;quad(checker[(row+col)%2],point(a,b),point(a+.45*ppm,b),point(a+.45*ppm,b+width/count),point(a,b+width/count));}
    checker.forEach((p,i)=>add(drape(triangles(p),this.origin,this.ground),new T.MeshBasicMaterial({color:i?0xf4efdf:0x13191d,side:T.DoubleSide})));
    this.overviewDistance=this.fitDistance();this.reset();
  }
  refreshDressing(){
    this.vegetation?.dispose();this.buildings?.dispose();this.districts?.dispose();this.buildings=null;this.districts=null;
    const exclusions=this.facilities?.plan.placements||[],house=this.environmentAssets.assets.get(this.model.id);if(house){this.buildings=createBuildings(this.track,this.model,this.scenery.plan,this.dressingGround,this.origin,house,exclusions);this.staticGroup.add(this.buildings.group);}
    const reserved=[...exclusions,...this.buildings?.plan.placements||[]];
    if(this.worldData){this.districts=createDistrictBuildings(this.track,this.scenery.plan,this.dressingGround,this.origin,this.worldData,reserved);this.staticGroup.add(this.districts.group);reserved.push(...this.districts.plan.placements);}
    this.vegetation=createVegetation(this.track,this.model,this.scenery.plan,this.dressingGround,this.origin,this.environmentAssets.assets.get('tree'),reserved,this.worldData,{european:this.environmentAssets.assets.get('european-tree'),oak:this.environmentAssets.assets.get('oak-tree')});this.staticGroup.add(this.vegetation.group);
    this.overviewPoints=[...this.baseOverviewPoints,...this.facilities?.plan.footprints||[]];for(const p of this.vegetation.plan.plants)if(!p.far)this.overviewPoints.push({...p,height:p.groundY+p.height*1.15});if(this.buildings)this.overviewPoints.push(...this.buildings.plan.footprints);
    this.dirty=true;this.onChange();
  }
  clearStatic(){this.scenery?.dispose();this.vegetation?.dispose();this.buildings?.dispose();this.districts?.dispose();this.facilities?.dispose();this.scenery=null;this.vegetation=null;this.buildings=null;this.districts=null;this.facilities=null;this.worldData=null;this.overviewPoints=null;for(const o of [...this.staticGroup.children]){o.userData?.dispose?.();o.geometry?.dispose();o.material?.dispose();this.staticGroup.remove(o);}}
  fitPoints(){return this.overviewScope==='landscape'&&this.worldData?[...this.terrainObject.userData.footprint,...this.districts?.plan.footprints||[]]:this.overviewPoints||this.track.outer;}
  overviewTarget(){return overviewTarget({...this.track,outer:this.fitPoints()},this.yaw);}
  fitDistance(){return this.track?overviewFit(this.track.bounds,this.camera.aspect,this.yaw,this.pitch,this.camera.fov,this.fitPoints(),this.overviewTarget()):1200;}
  centreOverview(){const target=this.track?this.overviewTarget():{x:0,z:0};this.focus.set(target.x,target.y||0,target.z);this.overviewDistance=this.fitDistance();this.distance=this.overviewDistance;}
  resize(){const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(1.5,globalThis.devicePixelRatio||1);if(this.width!==r.width||this.height!==r.height||this.dpr!==dpr){
    const ratio=this.distance/(this.overviewDistance||this.distance);
    this.width=r.width;this.height=r.height;this.dpr=dpr;this.renderer.setPixelRatio(dpr);this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;
    if(this.track){this.overviewDistance=this.fitDistance();if(this.mode==='overview')this.distance=this.overviewDistance*ratio;}
    this.camera.updateProjectionMatrix();this.dirty=true;
  }}
  setMode(mode){this.overviewScope='circuit';this.mode=['follow','first-person'].includes(mode)?mode:'overview';this.camera.fov=this.mode==='first-person'?this.firstPersonFov:48;this.camera.updateProjectionMatrix();if(this.mode==='overview'){this.pitch=.90;this.yaw=2.3;this.centreOverview();}else if(this.mode==='follow'){this.pitch=.50;this.yaw=-1.05;}else{this.lookYaw=0;this.lookPitch=0;}this.dirty=true;}
  reset(){this.overviewScope='circuit';this.focus.set(0,0,0);this.followDistance=18;if(this.mode==='first-person'){this.lookYaw=0;this.lookPitch=0;this.firstPersonFov=70;this.camera.fov=70;this.camera.updateProjectionMatrix();}else{this.yaw=this.mode==='follow'?-1.05:2.3;this.pitch=this.mode==='follow'?.50:.90;this.centreOverview();}this.dirty=true;this.onChange();}
  zoom(factor){if(!Number.isFinite(factor)||factor<=0)return;if(this.mode==='first-person'){this.firstPersonFov=clamp(this.firstPersonFov/factor,40,95);this.camera.fov=this.firstPersonFov;this.camera.updateProjectionMatrix();}else if(this.mode==='follow')this.followDistance=clamp(this.followDistance/factor,6,150);else this.distance=clamp(this.distance/factor,8,(this.overviewDistance||3000)*2);this.dirty=true;this.onChange();}
  look(dx,dy){this.lookYaw=clamp(this.lookYaw+dx*.006,-1.4,1.4);this.lookPitch=clamp(this.lookPitch-dy*.006,-.5,.5);this.dirty=true;this.onChange();}
  focusPoint(point){this.overviewScope='circuit';this.mode='overview';this.focus.set(point.x-this.origin.x,this.ground.sample(point.x,point.y).height*this.ground.ppm,point.y-this.origin.y);this.distance=95;this.pitch=.85;this.dirty=true;this.onChange();}
  focusFacility(point){this.focusPoint(point);const ppm=this.track.pixelsPerMeter||1;this.focus.y=point.groundY+point.height*.35;this.distance=Math.max(65,point.width*1.45,point.depth*3)*ppm;this.yaw=point.yaw+Math.PI;this.pitch=.42;this.dirty=true;}
  focusLandscape(){
    if(!this.worldData)return;
    this.overviewScope='landscape';this.mode='overview';const points=this.terrainObject.userData.footprint;
    const cx=points.reduce((n,p)=>n+p.x,0)/points.length,cy=points.reduce((n,p)=>n+p.y,0)/points.length;let xx=0,yy=0,xy=0;
    for(const p of points){xx+=(p.x-cx)**2;yy+=(p.y-cy)**2;xy+=(p.x-cx)*(p.y-cy);}
    this.yaw=-.5*Math.atan2(2*xy,xx-yy)+(this.camera.aspect<1?Math.PI/2:0);this.pitch=.90;this.centreOverview();this.dirty=true;this.onChange();
  }
  focusDistrict(){const point=this.districts?.plan.placements[0];if(!point)return;this.focusPoint(point);this.focus.y=point.groundY+point.height*.35;this.distance=Math.max(85,point.radius*3);this.pitch=.5;this.yaw=1.8;this.dirty=true;this.onChange();}
  focusWoodland(){
    const start=this.track.center[0],plants=this.vegetation?.plan.plants.filter(p=>p.woodland&&['forest','wood'].includes(p.landKind))||[],cell=35*(this.track.pixelsPerMeter||1),cells=new Map();
    for(const p of plants){const key=Math.floor(p.x/cell)+','+Math.floor(p.y/cell);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}
    const dense=plants.filter(p=>{const x=Math.floor(p.x/cell),y=Math.floor(p.y/cell);let n=0;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const q of cells.get((x+dx)+','+(y+dy))||[])if(Math.hypot(p.x-q.x,p.y-q.y)<cell)n++;return n>=18;});
    const candidates=dense.length?dense:plants.length?plants:this.vegetation?.plan.plants.filter(p=>p.woodland)||[];
    const point=candidates.reduce((a,p)=>!a||Math.hypot(p.x-start.x,p.y-start.y)<Math.hypot(a.x-start.x,a.y-start.y)?p:a,null);if(!point)return;
    this.focusPoint(point);this.focus.y=point.groundY+point.height*.4;this.distance=75*(this.track.pixelsPerMeter||1);this.pitch=.46;this.yaw=2.3;this.dirty=true;this.onChange();
  }
  pan(dx,dy){if(this.mode==='first-person'){this.look(dx,dy);return;}if(this.mode==='follow'){this.mode='overview';this.distance=this.followDistance;}const unit=this.distance/Math.max(200,this.height);this.focus.x-=Math.cos(this.yaw)*dx*unit+Math.sin(this.yaw)*dy*unit;this.focus.z+=Math.sin(this.yaw)*dx*unit-Math.cos(this.yaw)*dy*unit;this.dirty=true;this.onChange();}
  project(car){const v=new T.Vector3(car.x-this.origin.x,(this.ground.sample(car.x,car.y).height+.8)*(car.pixelsPerMeter||1),car.y-this.origin.y).project(this.camera);return {x:(v.x+1)*this.width/2,y:(1-v.y)*this.height/2,visible:v.z>-1&&v.z<1};}
  pick(clientX,clientY){if(!this.cars)return;const r=this.canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;let min=22,id=null;for(const car of this.cars){const p=this.project(car),d=Math.hypot(p.x-x,p.y-y);if(p.visible&&d<min){min=d;id=car.id;}}if(id!==null)this.onSelect(id);}
  render(sim,selected,palette,{sensors=true,boundaries=false,details=true,sensorDistances,angles}={}){
    if(this.lost||!this.track||!selected)return;this.resize();if(!this.width||!this.height)return;this.cars=sim.cars;
    const ppm=selected.pixelsPerMeter||1;
    const elevation=this.ground.sample(selected.x,selected.y).height*ppm;
    if(this.mode==='follow')this.focus.set(selected.x-this.origin.x,elevation+.55*ppm,selected.y-this.origin.y);
    const firstPerson=this.mode==='first-person',yaw=this.yaw-(this.mode==='follow'?selected.heading:0),distance=firstPerson?5*ppm:this.mode==='follow'?this.followDistance*ppm:this.distance;
    const near=firstPerson?.03*ppm:Math.max(.05,distance*.003),far=Math.max(250,distance+Math.hypot(this.track.bounds.width,this.track.bounds.height)*2);
    if(this.camera.near!==near||this.camera.far!==far){this.camera.near=near;this.camera.far=far;this.camera.updateProjectionMatrix();}
    this.cockpit.group.visible=firstPerson;
    if(firstPerson){const pose=driverCameraFrame(selected,this.origin,this.ground,this.lookYaw,this.lookPitch,this.driverPose);this.camera.position.copy(pose.position);this.camera.up.copy(pose.up);this.camera.lookAt(pose.target);this.cockpit.group.matrix.copy(pose.matrix);this.cockpit.wheel.rotation.x=-(Number(selected.vehicle?.steeringAngle)||0)*10;this.driverAgentId=selected.id;}
    else{this.camera.up.set(0,1,0);this.camera.position.set(this.focus.x+Math.sin(yaw)*Math.cos(this.pitch)*distance,this.focus.y+Math.sin(this.pitch)*distance,this.focus.z+Math.cos(yaw)*Math.cos(this.pitch)*distance);this.camera.lookAt(this.focus);}
    this.camera.updateMatrixWorld();
    this.fleet.update(sim.cars,this.origin,palette,{selected,camera:this.camera,height:this.height,mode:this.mode,ground:this.ground});
    this.edges.visible=boundaries||details;this.outline.visible=this.mode==='overview'||boundaries;this.edges.material.color.set(boundaries?0xffc476:0x9aaba4);for(const curb of this.kerbs)curb.visible=details;
    this.scenery?.setVisible(details,this.mode);
    this.vegetation?.setVisible(details);
    this.buildings?.setVisible(details);this.districts?.setVisible(details);this.facilities?.setVisible(details);this.vegetation?.update(this.camera,this.mode);this.buildings?.update(this.camera,this.mode);this.districts?.update(this.camera,this.mode);this.facilities?.update(this.camera);
    this.road.material.color.set(this.mode==='overview'?0x62757b:this.model.theme.road);this.outline.material.color.set(this.mode==='overview'?0xb1c0c1:0x82999d);
    this.selection.position.set(selected.x-this.origin.x,elevation+.10*ppm,selected.y-this.origin.y);this.selection.scale.setScalar(ppm);
    this.selection.visible=!firstPerson;this.rays.visible=sensors&&!firstPerson;
    if(this.rays.visible&&sensorDistances){const distances=sensorDistances(sim.track,selected),p=this.rayGeometry.attributes.position;for(let i=0;i<distances.length;i++){const a=selected.heading+angles[i],x=selected.x-this.origin.x,z=selected.y-this.origin.y,ex=selected.x+Math.cos(a)*distances[i],ez=selected.y+Math.sin(a)*distances[i];p.setXYZ(i*2,x,elevation+.52*ppm,z);p.setXYZ(i*2+1,ex-this.origin.x,(this.ground.sample(ex,ez).height+.52)*ppm,ez-this.origin.y);}p.needsUpdate=true;this.rayGeometry.setDrawRange(0,distances.length*2);}
    const p=this.markers.geometry.attributes.position,c=this.markers.geometry.attributes.color,color=new T.Color();this.markers.visible=!firstPerson&&(this.mode!=='follow'||distance>90*ppm);
    for(let i=0;i<sim.cars.length;i++){const car=sim.cars[i];p.setXYZ(i,car.x-this.origin.x,(this.ground.sample(car.x,car.y).height+1.4)*ppm,car.y-this.origin.y);color.set(palette[car.id%palette.length]);if(!car.alive)color.multiplyScalar(.35);c.setXYZ(i,color.r,color.g,color.b);}p.needsUpdate=true;c.needsUpdate=true;this.markers.geometry.setDrawRange(0,sim.cars.length);
    this.renderer.render(this.scene,this.camera);this.dirty=false;
  }
  info(){return {backend:'WebGL 2',carRevision:this.carRevision||CAR_VISUAL_REVISION,mode:this.mode,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,roadVertices:this.road?.geometry.attributes.position.count,carCount:this.fleet.carCount??this.fleet.parts[0].mesh.count,carLods:this.fleet.info?.(),scenery:this.scenery?.info(),terrain:this.terrainInfo,landscape:this.worldData?this.terrainObject.userData.info:null,districts:this.districts?.info(),vegetation:this.vegetation?.info(),buildings:this.buildings?.info(),facilities:this.facilities?.info(),environmentError:this.treeError||this.houseError||this.worldError||null,lost:this.lost};}
  dispose(){this.disposed=true;for(const args of this.listeners)this.canvas.removeEventListener(...args);this.clearStatic();this.fleet.dispose();this.environmentAssets.dispose();const materials=new Set();this.cockpit.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});for(const m of materials)m.dispose();this.cockpit.group.removeFromParent();for(const object of [this.rays,this.markers,this.selection]){object.geometry.dispose();object.material.dispose();}this.renderer.dispose();}
}
