'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../track-renderer.js'),F=require('../simulation.js'),catalog=require('../data/circuits.json');
const source=require('../data/connectome.json');
const curbCatalog=require('../data/curbs.js');
const bounds={x:0,y:0,width:2400,height:1300};
const point=(x,y)=>({x,y}),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const id of ['lab','monza','monaco','le-mans'])test('Visual model preserves actual physical polygons: '+id,()=>{
  const sim=new F.Simulation(source,{circuits:catalog,circuitId:id,population:4}),before=JSON.stringify(sim.track),model=T.buildModel(sim.track,sim.circuit);
  assert.equal(model.id,id);assert.deepEqual(model.outer.points,sim.track.outer.map(p=>point(p.x,p.y)));
  assert.deepEqual(model.inner.points,sim.track.inner.map(p=>point(p.x,p.y)));
  assert.deepEqual(model.center.points,sim.track.center.map(p=>point(p.x,p.y)));
  assert.deepEqual(model.bounds,sim.track.bounds);assert.equal(model.halfWidth,sim.track.halfWidth);
  assert.equal(JSON.stringify(sim.track),before);assert.notEqual(model.outer.points,sim.track.outer);
  assert.ok(Object.isFrozen(model)&&Object.isFrozen(model.outer.points[0]));assert.ok(model.notice.includes('schematici'));
  assert.ok(model.curbs.flat(2).length>0);assert.equal(model.landmarks.length,sim.circuit.landmarks.length);
});
test('Polyline sampling wraps both directions without cutting across corners',()=>{
  const line=T.polyline([point(0,0),point(10,0),point(10,10),point(0,10)]);
  assert.equal(line.total,40);assert.deepEqual(T.sample(line,5),{x:5,y:0,angle:0,segment:0});
  assert.equal(T.sample(line,-5).y,5);assert.equal(T.sample(line,45).x,5);
  const span=T.span(line,5,25);assert.deepEqual(span.slice(1,-1),[point(10,0),point(10,10)]);assert.equal(span.at(-1).x,5);
  assert.throws(()=>T.polyline([point(0,0),point(0,0),point(0,0)]),/non valida/);
});

test('Paint spans retain original vertices across the closed-boundary seam',()=>{
  const line=T.polyline([point(0,0),point(10,0),point(10,10),point(0,10)]);
  assert.deepEqual(T.span(line,35,55).slice(1,-1),[point(0,0),point(10,0)]);
  assert.deepEqual(T.span(line,-5,15).slice(1,-1),[point(0,0),point(10,0)]);
  assert.throws(()=>T.span(line,10,5),/non valido/);assert.throws(()=>T.span(line,0,41),/non valido/);
});

for(const id of ['monza','monaco','le-mans'])test('Only explicit source-backed driver-side curb zones: '+id,()=>{
  const sim=new F.Simulation(source,{circuits:catalog,circuitId:id,population:4}),before=JSON.stringify(sim.track),model=T.buildModel(sim.track,sim.circuit),entry=curbCatalog.circuits[id];
  assert.equal(model.curbSegments.length,entry.segments.length);assert.equal(model.curbReference.coverage,'partial');assert.equal(model.curbReference.referenceYear,2025);
  assert.equal(JSON.stringify(sim.track),before);assert.ok(model.notice.includes('non un rilievo completo'));
  assert.deepEqual(model.theme.curbColors,entry.colors);assert.ok(Object.isFrozen(entry.segments[0].from));
  for(const segment of model.curbSegments){
    assert.match(segment.source,/^https:\/\/(www\.fia\.com|fiawec\.alkamelsystems\.com|www\.mclaren\.com)\//);assert.ok(segment.evidence.length>20);
    assert.equal(segment.boundaryIndex,(T.signedArea(model.center)>0?segment.side==='right':segment.side==='left')?1:0);
    assert.ok(segment.length>0&&segment.length<model.center.total*.08);assert.ok(segment.centerLength>0&&segment.centerLength<model.center.total*.08);
  }
  // Every painted point is on that exact physics boundary, never a smoothing
  // offset or an invisible route; no painted span bridges an unobserved zone.
  for(const [boundaryIndex,colors]of model.curbs.entries())for(const runs of colors)for(const run of runs)for(const p of run){
    const line=boundaryIndex?model.inner:model.outer,q=T.sample(line,T.closestArc(line,p));assert.ok(Math.hypot(q.x-p.x,q.y-p.y)<1e-8);
  }
});

test('Unknown real circuits do not receive heuristic kerbs on either side',()=>{
  const sim=new F.Simulation(source,{circuits:catalog,circuitId:'monza',population:4});
  const unknown=T.buildModel(sim.track,{...sim.circuit,id:'unknown'});assert.equal(unknown.curbs.flat(2).length,0);assert.equal(unknown.curbReference,null);
  assert.throws(()=>T.buildModel(sim.track,{...sim.circuit,revision:sim.circuit.revision+1}),/non compatibile/);
});

test('Monaco omitted flat paint stays omitted and Le Mans paint is blue/yellow',()=>{
  assert.ok(curbCatalog.circuits.monaco.omissions.includes('T10–T11'));
  assert.deepEqual(curbCatalog.circuits.monaco.segments.map(s=>s.id),['t1-apex','t10-apex','t13-apex','t14-apex','t16-apex']);
  assert.equal(curbCatalog.circuits['le-mans'].colors[1],'#ebca55');assert.notEqual(curbCatalog.circuits['le-mans'].colors[1],curbCatalog.circuits.monza.colors[1]);
});
test('Camera projects and picks with identical world-space math',()=>{
  const camera=new T.Camera(bounds),view=camera.view(1100,540);
  for(const p of [point(0,0),point(160,532),point(2400,1300)]){const back=T.unproject(T.project(p,view),view);close(back.x,p.x);close(back.y,p.y);}
  const center=T.project(camera.center,view);close(center.x,550);close(center.y,270);
});
test('Zoom preserves the world coordinate under the mouse, not the route',()=>{
  const camera=new T.Camera(bounds),view=camera.view(1100,540),p=point(670,350),anchor=T.unproject(p,view);
  camera.zoomAt(1.4,p,view);const next=camera.view(1100,540),after=T.unproject(p,next);
  close(anchor.x,after.x);close(anchor.y,after.y);close(camera.zoom,1.4);
});
test('Panning, follow release, landmarks and reset change only camera state',()=>{
  const camera=new T.Camera(bounds),car={x:1900,y:450},before=JSON.stringify(car),view=camera.view(1100,540,car);
  camera.releaseFollow(view);const free=camera.view(1100,540);close(free.scale,view.scale);close(free.offsetX,view.offsetX);close(free.offsetY,view.offsetY);
  camera.pan(80,-35,free);assert.notEqual(camera.center.x,car.x);assert.equal(JSON.stringify(car),before);
  camera.focus(point(450,700),free);assert.equal(camera.center.x,450);assert.ok(camera.zoom>=6);
  camera.reset();assert.equal(camera.zoom,1);assert.equal(camera.followZoom,1);assert.deepEqual(camera.center,point(1200,650));
});
test('Zoom and pan limits stay finite at tiny and large window sizes',()=>{
  const camera=new T.Camera(bounds);
  for(const [w,h]of [[1,1],[390,410],[3840,2160]]){
    let view=camera.view(w,h);camera.zoomAt(1e8,point(w/2,h/2),view);assert.equal(camera.zoom,40);
    view=camera.view(w,h);camera.pan(1e8,-1e8,view);assert.ok(Number.isFinite(camera.center.x));assert.ok(camera.center.x>=bounds.x-bounds.width*.15);
    camera.zoomAt(1e-8,point(w/2,h/2),view,true);assert.equal(camera.followZoom,.4);camera.reset();
  }
});
test('Visible tiles remain bounded independently of zoom, window size and DPR',()=>{
  for(const [w,h]of [[334,300],[1100,600],[3840,2160]])for(const dpr of [1,2,3])for(const scale of [.04,.2,1.8,8,25]){
    const plan=T.tilePlan({width:w,height:h,scale,offsetX:w/2-300*scale,offsetY:h/2-700*scale},dpr);
    assert.ok(plan.count<=T.MAX_TILES*.8,JSON.stringify(plan));assert.ok(plan.resolution>0&&Number.isFinite(plan.worldSize));
    assert.ok((T.TILE_PIXELS+T.GUTTER*2)**2*4*T.MAX_TILES<30*1024*1024);
  }
});
test('LRU reuses existing tiles, disposes oldest pixels, and frees on circuit switch',()=>{
  const cache=new T.TileCache(3),disposed=[],make=key=>({key,dispose:()=>disposed.push(key)});
  cache.get('a',()=>make('a'));cache.get('b',()=>make('b'));cache.get('c',()=>make('c'));
  assert.equal(cache.get('a',()=>{throw Error('Unexpected rebuild');}).key,'a');cache.get('d',()=>make('d'));
  assert.deepEqual(disposed,['b']);assert.equal(cache.entries.size,3);assert.equal(cache.peak,3);assert.equal(cache.hits,1);
  cache.clear();assert.equal(cache.entries.size,0);assert.equal(disposed.length,4);
});
test('Map labels stay inside the viewport and do not overlap each other',()=>{
  for(const width of [334,1100]){
    const view={width,height:410,scale:1,offsetX:0,offsetY:0},marks=[{x:20,y:80,label:'Partenza / arrivo'},{x:45,y:85,label:'Prima Variante'},{x:width-18,y:390,label:'Ultima curva'},{x:20,y:89,label:'Una curva molto vicina'}];
    const labels=T.layoutLabels(marks,view,text=>text.length*7);assert.ok(labels.length>=2);
    for(let i=0;i<labels.length;i++){const a=labels[i];assert.ok(a.x>=12&&a.x+a.width<=width-12);assert.ok(a.y>=12&&a.y+a.height<=view.height-36);
      for(let j=i+1;j<labels.length;j++){const b=labels[j];assert.ok(a.x+a.width+5<=b.x||b.x+b.width+5<=a.x||a.y+a.height+5<=b.y||b.y+b.height+5<=a.y);}
    }
  }
});
test('Curve labels avoid the inspected car and its readout',()=>{
  const view={width:500,height:400,scale:1,offsetX:0,offsetY:0},reserved=[{x:206,y:170,width:85,height:26},{x:190,y:190,width:20,height:20}];
  const labels=T.layoutLabels([{x:200,y:200,label:'Partenza / arrivo'}],view,text=>text.length*7,reserved);
  assert.equal(labels.length,1);for(const b of reserved){const a=labels[0];assert.ok(a.x+a.width+5<=b.x||b.x+b.width+5<=a.x||a.y+a.height+5<=b.y||b.y+b.height+5<=a.y);}
});
test('Scale bar reports simulation units, with a useful on-screen length',()=>{
  for(const scale of [.1,.22,.45,1.8,8,25]){const length=T.scaleBar(scale);assert.ok(length>0);assert.ok(length*scale<=86+1e-9&&length*scale>=34);}
});
