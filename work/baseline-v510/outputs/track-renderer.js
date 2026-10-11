/* Read-only circuit presentation. Road fill, paint and selection use the SAME
 * explicit polygons as physics. No route policy, RNG or simulation commands.
 * Real-circuit curbs have explicit source-backed zones, not curve heuristics.
 * Their map registration, width, apron and grid remain non-surveyed graphics. */
(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const TILE_PIXELS=384,GUTTER=2,MAX_TILES=48;
  const CURB_CATALOG=typeof module!=='undefined'&&module.exports?require('./data/curbs.js'):root.MaleCNSCurbs;
  const THEMES=Object.freeze({
    lab:{ground:'#101a20',apron:'#1c2a30',road:'#34424b',curb:'#ff7658'},
    monza:{ground:'#111c1c',apron:'#21312e',road:'#364248',curb:'#d66f5a'},
    monaco:{ground:'#111a24',apron:'#26333f',road:'#3a4652',curb:'#d66f5a'},
    'le-mans':{ground:'#131d21',apron:'#253236',road:'#364249',curb:'#7badd0'}
  });
  function polyline(points){
    const p=points.map(p=>Object.freeze({x:Number(p.x),y:Number(p.y)})),arcs=[0];
    for(let i=0;i<p.length;i++)arcs.push(arcs[i]+Math.hypot(p[(i+1)%p.length].x-p[i].x,p[(i+1)%p.length].y-p[i].y));
    if(p.length<3||!Number.isFinite(arcs.at(-1))||arcs.at(-1)<=0)throw Error('Geometria del circuito non valida.');
    return Object.freeze({points:Object.freeze(p),arcs:Object.freeze(arcs),total:arcs.at(-1)});
  }
  function sample(line,distance){
    const d=((distance%line.total)+line.total)%line.total,a=line.arcs,p=line.points;
    let lo=0,hi=p.length;
    while(lo+1<hi){const m=(lo+hi)>>1;if(a[m]<=d)lo=m;else hi=m;}
    const start=p[lo],end=p[(lo+1)%p.length],t=(d-a[lo])/Math.max(1e-12,a[lo+1]-a[lo]);
    return {x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,angle:Math.atan2(end.y-start.y,end.x-start.x),segment:lo};
  }
  // Retain every original boundary vertex in a painted span: no corner-cutting
  // spline/parallel offset is used, even on Monaco's tight hairpin.
  function span(line,start,end){
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>line.total+1e-8)throw Error('Intervallo di bordo non valido.');
    const points=[sample(line,start)];
    const cycle=Math.floor(start/line.total);
    for(let lap=cycle;lap<=Math.floor(end/line.total);lap++)for(let i=0;i<line.points.length;i++){
      const d=lap*line.total+line.arcs[i];if(d>start&&d<end)points.push(line.points[i]);
    }
    points.push(sample(line,end));return points;
  }
  function schematicCurbs(line,halfWidth){
    const count=Math.ceil(line.total/(halfWidth*.75)),step=line.total/count,runs=[[],[]];
    for(let i=0;i<count;i++){
      const d=(i+.5)*step,a=sample(line,d-halfWidth*2.5).angle,b=sample(line,d+halfWidth*2.5).angle;
      const turn=Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)));
      if(turn>.13)runs[i%2].push(span(line,i*step,(i+1)*step));
    }
    return Object.freeze(runs.map(r=>Object.freeze(r)));
  }
  function signedArea(line){return line.points.reduce((sum,a,i)=>{const b=line.points[(i+1)%line.points.length];return sum+a.x*b.y-b.x*a.y;},0)/2;}
  function closestArc(line,point){
    let best=Infinity,result=0;
    for(let i=0;i<line.points.length;i++){
      const a=line.points[i],b=line.points[(i+1)%line.points.length],dx=b.x-a.x,dy=b.y-a.y;
      const t=clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),d=(point.x-a.x-dx*t)**2+(point.y-a.y-dy*t)**2;
      if(d<best){best=d;result=line.arcs[i]+t*(line.arcs[i+1]-line.arcs[i]);}
    }
    return result;
  }
  function observedCurbs(outer,inner,center,halfWidth,circuit){
    const entry=CURB_CATALOG?.circuits[circuit.id],runs=[[[],[]],[[],[]]],segments=[];
    if(!entry)return {runs:Object.freeze(runs.map(s=>Object.freeze(s.map(Object.freeze)))),segments:Object.freeze(segments),reference:null};
    if(circuit.revision!==entry.mapRevision||!circuit.sourceBounds||!Number.isFinite(circuit.uniformScale))throw Error('Riferimento cordoli non compatibile con la mappa.');
    const toWorld=p=>({x:(p[0]-circuit.sourceBounds.x)*circuit.uniformScale+140,y:(p[1]-circuit.sourceBounds.y)*circuit.uniformScale+140});
    const centerSign=Math.sign(signedArea(center));
    for(const observation of entry.segments){
      if(!['left','right'].includes(observation.side))throw Error('Lato del cordolo non valido.');
      const boundaryIndex=(centerSign>0?observation.side==='right':observation.side==='left')?1:0,line=boundaryIndex?inner:outer;
      const a=toWorld(observation.from),b=toWorld(observation.to),ca=closestArc(center,a),cb=closestArc(center,b),centerLength=(cb-ca+center.total)%center.total;
      if(centerLength<=0||centerLength>center.total*.08)throw Error('Intervallo cordolo fuori dalla zona documentata: '+observation.id);
      const direction=Math.sign(signedArea(line))*centerSign,start=closestArc(line,a),finish=closestArc(line,b);
      const length=((finish-start)*direction+line.total)%line.total;
      if(length<=0||length>centerLength+halfWidth*8)throw Error('Registrazione sul bordo non valida: '+observation.id);
      const count=Math.ceil(length/(halfWidth*.65)),step=length/count;
      for(let i=0;i<count;i++){
        const x=start+direction*i*step,y=start+direction*(i+1)*step;
        const points=direction>0?span(line,x,y):span(line,y,x).reverse();
        runs[boundaryIndex][i%2].push(Object.freeze(points.map(p=>Object.freeze({x:p.x,y:p.y}))));
      }
      segments.push(Object.freeze({...observation,boundaryIndex,start,length,direction,centerStart:ca,centerLength}));
    }
    return {runs:Object.freeze(runs.map(s=>Object.freeze(s.map(Object.freeze)))),segments:Object.freeze(segments),reference:entry};
  }
  function buildModel(track,circuit){
    const outer=polyline(track.outer),inner=polyline(track.inner),center=polyline(track.center),halfWidth=track.halfWidth;
    const observed=observedCurbs(outer,inner,center,halfWidth,circuit),lab=circuit.id==='lab';
    const theme={...THEMES[circuit.id]||THEMES.lab};theme.curbColors=Object.freeze(observed.reference?.colors||[theme.curb,'#deddd0']);
    return Object.freeze({id:circuit.id,bounds:Object.freeze({...track.bounds}),halfWidth,outer,inner,center,
      widthMeters:track.widthMeters?Object.freeze([...track.widthMeters]):null,
      theme:Object.freeze(theme),curbs:lab?Object.freeze([schematicCurbs(outer,halfWidth),schematicCurbs(inner,halfWidth)]):observed.runs,
      curbSegments:observed.segments,curbReference:observed.reference,
      landmarks:Object.freeze((circuit.landmarks||[]).map(p=>Object.freeze({...p}))),
      notice:lab?'Cordoli, fasce esterne e griglia schematici. Il bordo fisico resta quello della mappa; nessuna altimetria.':`Cordoli: ${observed.segments.length} tratti documentati · riferimento ${observed.reference?.referenceYear||'non disponibile'}. Posizione e lunghezza raccordate alla mappa, non un rilievo completo. Fasce esterne e griglia schematici; bordi condivisi con sensori e collisioni.`});
  }
  function halfWidthAt(model,along=0){
    if(!model.widthMeters)return model.halfWidth;
    const p=sample(model.center,along),i=p.segment,a=model.center.arcs,d=((along%model.center.total)+model.center.total)%model.center.total;
    const t=(d-a[i])/(a[i+1]-a[i]),w=model.widthMeters;
    return (w[i]+(w[(i+1)%w.length]-w[i])*t)/2;
  }
  function project(point,view){return {x:point.x*view.scale+view.offsetX,y:point.y*view.scale+view.offsetY};}
  function unproject(point,view){return {x:(point.x-view.offsetX)/view.scale,y:(point.y-view.offsetY)/view.scale};}
  class Camera{
    constructor(bounds){this.setBounds(bounds);}
    setBounds(bounds){this.bounds={...bounds};this.reset();}
    reset(){const b=this.bounds;this.center={x:b.x+b.width/2,y:b.y+b.height/2};this.zoom=1;this.followZoom=1;}
    view(width,height,follow){
      const b=this.bounds,fit=Math.max(.01,Math.min(Math.max(20,width-64)/b.width,Math.max(20,height-88)/b.height));
      const scale=follow?Math.max(fit*4,1.8)*this.followZoom:fit*this.zoom,center=follow||this.center;
      return {width,height,fit,scale,offsetX:width/2-center.x*scale,offsetY:height/2-center.y*scale};
    }
    constrain(){const b=this.bounds;this.center.x=clamp(this.center.x,b.x-b.width*.15,b.x+b.width*1.15);this.center.y=clamp(this.center.y,b.y-b.height*.15,b.y+b.height*1.15);}
    zoomAt(factor,point,view,follow=false){
      if(!Number.isFinite(factor)||factor<=0)return;
      if(follow){this.followZoom=clamp(this.followZoom*factor,.4,6);return;}
      const anchor=unproject(point,view),before=this.zoom;this.zoom=clamp(this.zoom*factor,.65,40);
      const scale=view.scale*this.zoom/before;
      this.center={x:anchor.x-(point.x-view.width/2)/scale,y:anchor.y-(point.y-view.height/2)/scale};this.constrain();
    }
    pan(dx,dy,view){this.center.x-=dx/view.scale;this.center.y-=dy/view.scale;this.constrain();}
    releaseFollow(view){this.zoom=clamp(view.scale/view.fit,.65,40);this.center=unproject({x:view.width/2,y:view.height/2},view);this.constrain();}
    focus(point,view){this.center={x:point.x,y:point.y};this.zoom=clamp(Math.max(6,1.2/view.fit),1,40);this.constrain();}
  }
  function tilePlan(view,dpr=1,maxTiles=MAX_TILES){
    let resolution=2**Math.round(Math.log2(Math.max(.03125,view.scale*dpr))),result;
    for(let attempt=0;attempt<18;attempt++){
      const worldSize=TILE_PIXELS/resolution,x0=Math.floor(-view.offsetX/view.scale/worldSize),y0=Math.floor(-view.offsetY/view.scale/worldSize);
      const x1=Math.floor((view.width-view.offsetX)/view.scale/worldSize),y1=Math.floor((view.height-view.offsetY)/view.scale/worldSize);
      result={resolution,worldSize,x0,y0,x1,y1,count:(x1-x0+1)*(y1-y0+1)};
      if(result.count<=maxTiles*.8)break;resolution/=2;
    }
    return result;
  }
  class TileCache{
    constructor(limit=MAX_TILES){this.limit=limit;this.entries=new Map();this.hits=0;this.misses=0;this.peak=0;}
    get(key,create){
      if(this.entries.has(key)){const value=this.entries.get(key);this.entries.delete(key);this.entries.set(key,value);this.hits++;return value;}
      this.misses++;const value=create();this.entries.set(key,value);
      while(this.entries.size>this.limit){const oldest=this.entries.keys().next().value;const item=this.entries.get(oldest);this.entries.delete(oldest);item.dispose?.();}
      this.peak=Math.max(this.peak,this.entries.size);return value;
    }
    clear(){for(const item of this.entries.values())item.dispose?.();this.entries.clear();}
  }
  function overlaps(a,b){return a.x<b.x+b.width+5&&a.x+a.width+5>b.x&&a.y<b.y+b.height+5&&a.y+a.height+5>b.y;}
  function layoutLabels(marks,view,measure,reserved=[]){
    const placed=[];
    for(const mark of marks){
      const p=project(mark,view);if(p.x<8||p.y<8||p.x>view.width-8||p.y>view.height-36)continue;
      const width=Math.min(measure(mark.label)+14,view.width-24),height=23;
      const candidates=[[p.x+12,p.y-30],[p.x-width-12,p.y-30],[p.x+12,p.y+10],[p.x-width-12,p.y+10],[p.x-width/2,p.y-49],[p.x-width/2,p.y+30]];
      for(const [x,y]of candidates){
        const box={x:clamp(x,12,view.width-width-12),y:clamp(y,12,view.height-height-36),width,height,mark,p};
        if(!placed.some(other=>overlaps(box,other))&&!reserved.some(other=>overlaps(box,other))){placed.push(box);break;}
      }
    }
    return placed;
  }
  function trace(context,points,close=true){
    points.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));if(close)context.closePath();
  }
  class Renderer{
    constructor(){this.cache=new TileCache();this.details=true;this.boundaries=false;this.labels=[];this.lastNewTiles=0;}
    setTrack(track,circuit){
      this.pixelsPerMeter=track.pixelsPerMeter||1;this.metricSource=track.metricSource;
      this.model=buildModel(track,circuit);this.cache.clear();this.road=new Path2D();
      for(const line of [this.model.outer,this.model.inner])trace(this.road,line.points);
      this.edge=new Path2D(this.road);
      this.curbPaths=this.model.curbs.map(sides=>sides.map(runs=>{const p=new Path2D();for(const run of runs)trace(p,run,false);return p;}));
      this.texture=document.createElement('canvas');this.texture.width=64;this.texture.height=64;
      const context=this.texture.getContext('2d'),pixels=context.createImageData(64,64);let seed=4139;
      for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const shade=seed>>>29;pixels.data[i]=shade+25;pixels.data[i+1]=shade+32;pixels.data[i+2]=shade+38;pixels.data[i+3]=72;}
      context.putImageData(pixels,0,0);this.pattern=context.createPattern(this.texture,'repeat');
    }
    setDetails(value){this.details=Boolean(value);this.cache.clear();}
    paintTile(x,y,resolution){
      const model=this.model,h=model.halfWidth,size=TILE_PIXELS/resolution,pad=GUTTER/resolution;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=TILE_PIXELS+GUTTER*2;
      const c=canvas.getContext('2d');
      c.setTransform(resolution,0,0,resolution,-x*resolution+GUTTER,-y*resolution+GUTTER);
      c.fillStyle=model.theme.ground;c.fillRect(x-pad,y-pad,size+pad*2,size+pad*2);
      if(this.details){c.strokeStyle=model.theme.apron;c.lineJoin='round';c.lineWidth=h*1.8;c.stroke(this.edge);}
      // Tiny full-circuit maps need a brighter surface, not a wider/fake road.
      c.fillStyle=resolution<.5?'#62757b':model.theme.road;c.fill(this.road,'evenodd');
      c.save();c.clip(this.road,'evenodd');
      if(this.details){
        c.fillStyle=this.pattern;c.fillRect(x-pad,y-pad,size+pad*2,size+pad*2);
        c.lineCap='butt';c.lineJoin='round';c.lineWidth=h*.54;
        for(const sides of this.curbPaths)for(let i=0;i<sides.length;i++){c.strokeStyle=model.theme.curbColors[i];c.stroke(sides[i]);}
        this.paintGrid(c);
      }
      c.strokeStyle='#b1c0c1';c.lineWidth=Math.min(Math.max(.75/resolution,h*.09),h*.23);c.stroke(this.edge);
      this.paintFinish(c);c.restore();
      return {canvas,x:x-pad,y:y-pad,size:size+pad*2,dispose:()=>{canvas.width=canvas.height=1;}};
    }
    paintGrid(c){
      const m=this.model,h=halfWidthAt(m);c.strokeStyle='#9daaaa';c.lineWidth=h*.07;
      for(let row=0;row<5;row++)for(const side of [-1,1]){
        const p=sample(m.center,-h*(5+row*4+(side===1?1.8:0)));
        c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.beginPath();
        const local=halfWidthAt(m,-h*(5+row*4+(side===1?1.8:0))),y=side*local*.43;c.moveTo(-h*1.35,y-h*.19);c.lineTo(h*.2,y-h*.19);c.lineTo(h*.2,y+h*.19);c.lineTo(-h*1.35,y+h*.19);c.stroke();c.restore();
      }
    }
    paintFinish(c){
      const m=this.model,h=halfWidthAt(m),p=sample(m.center,0);c.save();c.translate(p.x,p.y);c.rotate(p.angle);
      const s=h/7;for(let col=0;col<2;col++)for(let row=0;row<14;row++){c.fillStyle=(row+col)%2?'#10171e':'#f4efdf';c.fillRect((col-1)*s,-h+row*s,s,s);}c.restore();
    }
    draw(c,view,dpr=1){
      const m=this.model,plan=tilePlan(view,dpr),b=m.bounds,before=this.cache.misses;
      const left=-view.offsetX/view.scale,top=-view.offsetY/view.scale;c.fillStyle=m.theme.ground;c.fillRect(left,top,view.width/view.scale,view.height/view.scale);
      for(let y=plan.y0;y<=plan.y1;y++)for(let x=plan.x0;x<=plan.x1;x++){
        const wx=x*plan.worldSize,wy=y*plan.worldSize;
        if(wx+plan.worldSize<b.x||wx>b.x+b.width||wy+plan.worldSize<b.y||wy>b.y+b.height)continue;
        const tile=this.cache.get(`${plan.resolution}:${x}:${y}`,()=>this.paintTile(wx,wy,plan.resolution));
        // Opaque tiles include a gutter. Overwriting identical neighbor pixels
        // avoids fractional-zoom seams without accumulating translucent paint.
        c.drawImage(tile.canvas,tile.x,tile.y,tile.size,tile.size);
      }
      if(this.boundaries){c.strokeStyle='#68d3c5';c.lineWidth=.85/view.scale;c.stroke(this.edge);}
      this.lastNewTiles=this.cache.misses-before;this.lastPlan=plan;
    }
    drawLabels(c,view,includeLandmarks=true,highlight='',reserved=[]){
      // Caller supplies the CSS-pixel transform (including device pixel ratio).
      c.font='12px system-ui,sans-serif';
      const start=sample(this.model.center,0),marks=[{...start,label:'Partenza / arrivo',key:'start'},...(includeLandmarks?this.model.landmarks.map((p,i)=>({...p,key:String(i)})):[])];
      this.labels=layoutLabels(marks,view,text=>c.measureText(text).width,reserved);
      for(const box of this.labels){
        const {p,x,y,width,height,mark}=box;
        c.strokeStyle=mark.key===highlight?'#f0bd69':'#61767d';c.lineWidth=1;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(clamp(p.x,x,x+width),clamp(p.y,y,y+height));c.stroke();
        c.fillStyle='#101920';c.fillRect(x,y,width,height);c.fillStyle=mark.key===highlight?'#f0bd69':'#d7e0dd';c.fillText(mark.label,x+7,y+16);
        c.fillStyle=mark.key==='start'?'#f4efdf':'#68d3c5';c.beginPath();c.arc(p.x,p.y,2.5,0,Math.PI*2);c.fill();
      }
      const bar=metricScale(view.scale,this.pixelsPerMeter),y=view.height-18,x=16;
      c.strokeStyle='#a9babc';c.lineWidth=1;c.beginPath();c.moveTo(x,y-4);c.lineTo(x,y);c.lineTo(x+bar.pixels,y);c.lineTo(x+bar.pixels,y-4);c.stroke();
      c.font='10px ui-monospace,monospace';c.fillStyle='#b9c7c7';c.fillText(`${bar.metres} m · ${this.metricSource?'scala calibrata':'laboratorio'}`,x,y-8);
    }
    hitLabel(point){return this.labels.find(b=>point.x>=b.x&&point.y>=b.y&&point.x<=b.x+b.width&&point.y<=b.y+b.height)?.mark;}
    info(){return {id:this.model?.id,tiles:this.cache.entries.size,peakTiles:this.cache.peak,tileLimit:this.cache.limit,cacheBytes:this.cache.entries.size*(TILE_PIXELS+GUTTER*2)**2*4,hits:this.cache.hits,misses:this.cache.misses,newTiles:this.lastNewTiles,resolution:this.lastPlan?.resolution,details:this.details,boundaries:this.boundaries,labels:this.labels.map(b=>({key:b.mark.key,label:b.mark.label,x:b.x,y:b.y,width:b.width,height:b.height})),curbSpans:this.model?.curbs.reduce((n,s)=>n+s.reduce((a,r)=>a+r.length,0),0),documentedCurbSegments:this.model?.curbSegments.length,curbCoverage:this.model?.curbReference?.coverage||'schematic',curbReferenceYear:this.model?.curbReference?.referenceYear||null};}
  }
  function scaleBar(scale){const target=86/scale,power=10**Math.floor(Math.log10(target)),unit=target/power;return (unit>=5?5:unit>=2?2:1)*power;}
  function metricScale(scale,pixelsPerMeter=1){const metres=scaleBar(scale*pixelsPerMeter);return {metres,pixels:metres*pixelsPerMeter*scale};}
  const api={buildModel,halfWidthAt,polyline,sample,span,signedArea,closestArc,observedCurbs,project,unproject,Camera,TileCache,tilePlan,layoutLabels,scaleBar,metricScale,Renderer,TILE_PIXELS,GUTTER,MAX_TILES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MaleCNSTracks=api;
})(typeof globalThis!=='undefined'?globalThis:this);
