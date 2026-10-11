'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const F=require('../simulation.js'),Tracks=require('../track-renderer.js'),catalog=require('../data/circuits.json'),Legacy=require('../legacy-models.js'),data=require('../data/connectome.json');
const graph=Legacy.buildV2(data),hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const simulations=()=>[{id:'lab'},...catalog.circuits].map(c=>new F.Simulation(graph,{population:4,circuits:catalog,circuitId:c.id,seed:7717}));
function assertNoCrossingPanels(points,ppm,id){
  const buckets=new Map(),cell=20*ppm,cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  for(let i=0;i<points.length;i+=2){const a=points[i],b=points[i+1],seen=new Set();
    for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++){
      const key=x+','+y,previous=buckets.get(key)||[];
      for(const j of previous){if(seen.has(j))continue;seen.add(j);const c=points[j],d=points[j+1];assert.ok(!(cross(a,b,c)*cross(a,b,d)<-1e-10&&cross(c,d,a)*cross(c,d,b)<-1e-10),id+': visual barrier panels cross');}
      previous.push(i);buckets.set(key,previous);
    }
  }
}
test('Scenery catalog is immutable, explicitly estimated and matches registered track sections',async()=>{
  const {SCENERY_CATALOG}=await import('../data/scenery.mjs');
  assert.ok(Object.isFrozen(SCENERY_CATALOG));
  for(const c of catalog.circuits){const entry=SCENERY_CATALOG[c.id];assert.equal(entry.referenceYear,2025);assert.match(entry.source,/^https:/);for(const z of entry.zones){assert.ok(c.widthStations.some(s=>s.label===z.station));assert.equal(z.estimated,true);assert.ok(z.before>0&&z.after>0&&z.width>0);assert.ok(['asphalt','gravel'].includes(z.surface));}}
  assert.equal(SCENERY_CATALOG.monaco.barrier,'concrete');assert.ok(SCENERY_CATALOG.monaco.zones.every(z=>z.surface==='asphalt'));
});
for(const id of ['lab','monza','monaco','le-mans']){
  test(id+': accelerated presentation mask matches physical road classification',async()=>{
    const {createRoadMask}=await import('../track-scenery.mjs'),sim=simulations().find(s=>s.circuitId===id),track=sim.track,mask=createRoadMask(track),b=track.bounds;
    for(let x=0;x<=19;x++)for(let y=0;y<=17;y++){const px=b.x+b.width*x/19,py=b.y+b.height*y/17;assert.equal(mask(px,py),F.onRoad(track,px,py));}
    for(const p of track.center.slice(0,40))assert.equal(mask(p.x,p.y),F.onRoad(track,p.x,p.y));
  });
  test(id+': scenery is finite, outside the road, bounded and observation-only',async()=>{
    const {buildSceneryPlan,createRoadMask,createTrackScenery}=await import('../track-scenery.mjs'),sim=simulations().find(s=>s.circuitId===id),track=sim.track,model=Tracks.buildModel(track,sim.circuit),before=hash([track,model,sim.cars]),origin={x:track.bounds.x+track.bounds.width/2,y:track.bounds.y+track.bounds.height/2};
    const plan=buildSceneryPlan(track,model,origin),mask=createRoadMask(track);
    assert.ok(plan.stats.barrierSegments>50);assert.ok(plan.stats.fencePanels>50);
    assertNoCrossingPanels(plan.footprint,track.pixelsPerMeter||1,id);
    assert.ok(plan.zones.every(z=>z.renderedTiles>0),JSON.stringify(plan.zones));
    for(const [name,buffer] of Object.entries(plan.buffers)){
      assert.ok(buffer.every(Number.isFinite),name);assert.equal(buffer.length%(name==='fence'?6:9),0,name);
      if(name==='fence')continue;
      for(let i=0;i<buffer.length;i+=9){const x=origin.x+(buffer[i]+buffer[i+3]+buffer[i+6])/3,y=origin.y+(buffer[i+2]+buffer[i+5]+buffer[i+8])/3;assert.equal(mask(x,y),false,id+': '+name+' intersects physical road');}
    }
    const scene=createTrackScenery(track,model,origin);assert.ok(scene.group.children.length<=9);assert.ok(scene.info().triangles<300000);assert.equal(scene.info().estimated,true);
    scene.setVisible(false,'follow');assert.equal(scene.group.visible,false);scene.setVisible(true,'overview');assert.equal(scene.group.visible,true);assert.equal(scene.group.children.find(o=>o.name==='scenery-fence').visible,false);
    assert.equal(hash([track,model,sim.cars]),before);const geometries=scene.group.children.map(o=>o.geometry);let disposed=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);scene.dispose();assert.equal(disposed,geometries.length);assert.equal(scene.group.children.length,0);
  });
}
test('New scenery dependencies are packaged and cannot import physics/controller code',()=>{
  const pkg=require('../../package.json');for(const f of ['outputs/track-scenery.mjs','outputs/data/scenery.mjs','outputs/vendor/polygon-clipping.umd.js','outputs/vendor/POLYGON-CLIPPING-LICENSE.txt'])assert.ok(pkg.build.files.includes(f));
  for(const f of ['track-scenery.mjs','data/scenery.mjs']){const body=fs.readFileSync(require('node:path').join(__dirname,'..',f),'utf8');const imports=body.split('\n').filter(line=>/^import\b/.test(line));assert.ok(imports.every(line=>!/(simulation|learning|worker|rewards|vehicle-992)/.test(line)));assert.doesNotMatch(body,/Math\.random\s*\(/);}
});
