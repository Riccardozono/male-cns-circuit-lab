/* OSM footprints, estimated registration and schematic architecture. Visual only. */
import * as T from './vendor/three.module.js';
import {facilityExclusionMask} from './track-facilities.mjs';
import {gridHeight,landscapeRadius} from './world-terrain.mjs';
import {surfaceMaterial,SURFACE_DETAIL_GLSL} from './track-scenery.mjs';
const inside=(x,y,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;};
export function districtPlan(track,scenery,ground,data,exclusions=[]){
  const ppm=track.pixelsPerMeter||1,blocked=facilityExclusionMask(track,scenery),placements=[],footprints=[],skipped=[];
  for(const source of data.places.buildings){
    const corners=source.polygon.map(([x,y])=>({x:x*ppm,y:y*ppm})),x=corners.reduce((s,p)=>s+p.x,0)/corners.length,y=corners.reduce((s,p)=>s+p.y,0)/corners.length,radius=Math.max(...corners.map(p=>Math.hypot(p.x-x,p.y-y)));
    if(ground.distanceAt(x,y)>landscapeRadius(data)||exclusions.some(p=>Math.hypot(p.x-x,p.y-y)<p.radius+radius+3*ppm))continue;
    if(data.entry.srtm.producerGranuleId.startsWith('N43')&&gridHeight(data,x/ppm,y/ppm)<=.15)continue;
    const samples=[];let clear=true;
    // Interior plus edge checks, not just a centroid: no wall over a parallel
    // road or runoff. A source footprint is omitted, never warped to fit.
    for(let i=0;i<corners.length&&clear;i++){const a=corners[i],b=corners[(i+1)%corners.length],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/(2*ppm));for(let j=0;j<=n;j++){const t=j/Math.max(1,n),px=a.x+(b.x-a.x)*t,py=a.y+(b.y-a.y)*t;if(blocked(px,py)){clear=false;break;}samples.push(ground.visualHeight(px,py)*ppm);}}
    const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
    for(let px=minX;px<=maxX&&clear;px+=2*ppm)for(let py=minY;py<=maxY;py+=2*ppm)if(inside(px,py,corners)){if(blocked(px,py)){clear=false;break;}samples.push(ground.visualHeight(px,py)*ppm);}
    if(!clear||!samples.length){skipped.push(source.osmWay);continue;}
    const base=Math.max(...samples),bottom=Math.min(...samples),height=source.heightM*ppm;
    // Discard implausibly tall retaining foundations on a steep DEM pixel.
    if(!Number.isFinite(base)||base-bottom>height*.8+4*ppm)continue;
    const placement={...source,x,y,radius,corners,groundY:base,minY:bottom,height};placements.push(placement);footprints.push(...corners.map(p=>({...p,height:base+height})));
  }
  return {placements,footprints,skipped,source:'OpenStreetMap',estimated:true,budget:data.places.buildings.length};
}
export function createDistrictBuildings(track,scenery,ground,origin,data,exclusions=[]){
  const plan=districtPlan(track,scenery,ground,data,exclusions),group=new T.Group(),ppm=track.pixelsPerMeter||1,walls=[],wallColors=[],facadeBounds=[],facadeFloors=[],roofs=[],roofColors=[],foundations=[],features=[];
  group.name='osm-district-buildings';
  const palette=['#d7c8aa','#c1beb0','#d5b798','#c5ad97','#d8d3c0','#c09177'].map(color=>new T.Color(color));
  const roofPalette=['#757e81','#a26d53','#938b7c','#a85c44'].map(color=>new T.Color(color));
  const push=(out,colors,points,color)=>{out.push(...points.flat());if(colors)for(const p of points)colors.push(color.r,color.g,color.b);};
  const quad=(out,colors,a,b,c,d,color)=>push(out,colors,[a,b,c,a,c,d],color);
  for(const p of plan.placements){
    const roof=p.groundY+p.height,color=palette[p.osmWay%palette.length],rcolor=roofPalette[p.osmWay%roofPalette.length],level=Math.max(1,Math.floor(p.height/(3.1*ppm))),edges=[];
    for(let i=0;i<p.corners.length;i++){
      const a=p.corners[i],b=p.corners[(i+1)%p.corners.length],ax=a.x-origin.x,az=a.y-origin.y,bx=b.x-origin.x,bz=b.y-origin.y;
      const length=Math.hypot(b.x-a.x,b.y-a.y),widthM=length/ppm,heightM=p.height/ppm;
      quad(walls,wallColors,[ax,p.groundY,az],[bx,p.groundY,bz],[bx,roof,bz],[ax,roof,az],color);
      for(const [u,v] of [[0,0],[widthM,0],[widthM,heightM],[0,0],[widthM,heightM],[0,heightM]]){
        facadeBounds.push(u,v,widthM,heightM);
        facadeFloors.push(level,p.osmWay%31);
      }
      if(p.groundY-p.minY>.03*ppm)quad(foundations,null,[ax,p.minY-.08*ppm,az],[bx,p.minY-.08*ppm,bz],[bx,p.groundY,bz],[ax,p.groundY,az]);
      if(length>3*ppm)edges.push({a,b,length,yaw:-Math.atan2(b.y-a.y,b.x-a.x)});
    }
    const triangles=T.ShapeUtils.triangulateShape(p.corners.map(p=>new T.Vector2(p.x,p.y)),[]);
    for(const tri of triangles){const points=tri.map(i=>[p.corners[i].x-origin.x,roof,p.corners[i].y-origin.y]);
      const normal=new T.Vector3().crossVectors(new T.Vector3().fromArray(points[1]).sub(new T.Vector3().fromArray(points[0])),new T.Vector3().fromArray(points[2]).sub(new T.Vector3().fromArray(points[0])));if(normal.y<0)[points[1],points[2]]=[points[2],points[1]];push(roofs,roofColors,points,rcolor);
    }
    const orientation=Math.sign(p.corners.reduce((sum,a,i)=>{const b=p.corners[(i+1)%p.corners.length];return sum+a.x*b.y-b.x*a.y;},0))||1;
    features.push({placement:p,edges,level,orientation});
  }
  const facade=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  facade.customProgramCacheKey=()=>'district-facade';
  facade.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec4 facadeBounds; attribute vec2 facadeFloor; varying vec4 wall; varying vec2 storeys;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      wall=facadeBounds;
      storeys=facadeFloor;
    `);
    shader.fragmentShader='varying vec4 wall; varying vec2 storeys;\n'+SURFACE_DETAIL_GLSL+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float levelHeight=wall.w/max(1.,storeys.x);
      float cornice=wall.w-wall.y;
      float level=fract(wall.y/levelHeight);
      float aa=max(fwidth(wall.y),.02);
      float joint=(1.-smoothstep(.019,.09+aa,level))* (1.-smoothstep(.18,.75,aa));
      float plinth=1.-smoothstep(.36,.55+aa,wall.y);
      float cap=1.-smoothstep(.23,.38+aa,cornice);
      float corner=1.-smoothstep(.11,.23+aa,min(wall.x,wall.z-wall.x));
      float plaster=surfaceDetail(wall.xy+vec2(storeys.y*13.,0.),12.,.11,.10);
      diffuseColor.rgb*=plaster*(1.-.13*joint-.20*plinth+.18*cap+.07*corner);
    `);
  };
  const meshes=[];
  const roofSurface=surfaceMaterial(0xffffff,'roof',ppm,{vertexColors:true});
  const foundation=new T.MeshLambertMaterial({color:0x706c61,side:T.DoubleSide});
  for(const [positions,colors,material] of [[walls,wallColors,facade],[roofs,roofColors,roofSurface],[foundations,null,foundation]]){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    if(colors)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    if(material===facade){
      g.setAttribute('facadeBounds',new T.Float32BufferAttribute(facadeBounds,4));
      g.setAttribute('facadeFloor',new T.Float32BufferAttribute(facadeFloors,2));
    }
    g.computeVertexNormals();g.computeBoundingSphere();
    const m=new T.Mesh(g,material);group.add(m);meshes.push(m);
  }
  // Fine facades exist only around the camera; full urban silhouettes remain
  // cheap static batches. Hard cap avoids adding per-agent visual work.
  const width=32,height=40,pixels=new Uint8Array(width*height*4),shutters=data.entry.srtm.producerGranuleId.startsWith('N43');
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const outside=x<6||x>=width-6;
    const frame=x===6||x===width-7||x===15||y<=3||y>=height-3||y===25;
    const sill=y>=1&&y<=3;
    const shutter=shutters&&outside&&y>4&&y<height-3;
    const pane=shutter?(y%3===0?[94,110,102]:[132,145,132]):sill?[204,192,169]:frame?[174,169,150]:y>25?[110,145,164]:[57,83,101];
    pixels.set([...pane,shutter||sill||!outside?255:0],(y*width+x)*4);
  }
  const glazing=new T.DataTexture(pixels,width,height);glazing.colorSpace=T.SRGBColorSpace;
  glazing.generateMipmaps=true;glazing.minFilter=T.LinearMipmapLinearFilter;glazing.magFilter=T.LinearFilter;glazing.needsUpdate=true;
  const cap=14000,windows=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshPhongMaterial({map:glazing,alphaTest:.35,shininess:26,specular:0x222a30,side:T.DoubleSide}),cap),object=new T.Object3D(),last=new T.Vector3(Infinity,Infinity,Infinity);windows.instanceMatrix.setUsage(T.DynamicDrawUsage);windows.count=0;windows.frustumCulled=false;group.add(windows);let lastMode='';
  return {group,plan,update(camera,mode){
    if(!group.visible||mode===lastMode&&camera.position.distanceToSquared(last)<(8*ppm)**2)return;
    last.copy(camera.position);lastMode=mode;let count=0;
    for(const {placement:p,edges,level,orientation}of features){if(new T.Vector3(p.x-origin.x,p.groundY+p.height*.5,p.y-origin.y).distanceTo(camera.position)>230*ppm+p.radius)continue;
      for(const edge of edges){const cols=Math.max(1,Math.floor(edge.length/(3.3*ppm)));for(let row=0;row<level&&count<cap;row++)for(let col=0;col<cols&&count<cap;col++){
        const t=(col+.5)/cols,dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y;
        object.position.set(edge.a.x+dx*t-origin.x+dy/edge.length*.025*ppm*orientation,p.groundY+(row+.56)*p.height/level,edge.a.y+dy*t-origin.y-dx/edge.length*.025*ppm*orientation);object.rotation.set(0,edge.yaw,0);object.scale.set(1.65*ppm,1.55*ppm,1);object.updateMatrix();windows.setMatrixAt(count++,object.matrix);
      }}
    }
    windows.count=count;windows.instanceMatrix.needsUpdate=true;
  },setVisible(value){const was=group.visible;group.visible=Boolean(value);if(!was&&value)lastMode='';},info(){return {source:'OpenStreetMap',estimatedRegistration:true,illustrativeArchitecture:true,buildings:plan.placements.length,budget:plan.budget,mappedHeightTags:plan.placements.filter(p=>p.heightFromOsmTag).length,estimatedHeights:plan.placements.filter(p=>!p.heightFromOsmTag).length,windows:windows.count,windowCapacity:cap,drawCalls:meshes.filter(m=>m.geometry.attributes.position.count).length+(windows.count?1:0),triangles:meshes.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0)+windows.count*2,visible:group.visible};},dispose(){glazing.dispose();for(const m of [...meshes,windows]){m.geometry.dispose();m.material.dispose();m.dispose?.();m.removeFromParent();}group.removeFromParent();}};
}
