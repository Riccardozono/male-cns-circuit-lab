const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const F=require('../simulation.js'),data=require('../data/connectome.json'),catalog=require('../data/circuits.json');
const make=id=>new F.Simulation(data,{circuits:catalog,circuitId:id,population:4});
const evaluateGeneration=sim=>{const generation=sim.generation;for(let i=0;i<3600&&sim.generation===generation;i++)sim.tick();if(sim.generation===generation)sim.evolve();};
test('Offline JS catalog equals JSON and exposes the three requested tracks',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../data/circuits.js'),'utf8'),context);
  assert.equal(JSON.stringify(context.MALE_CNS_CIRCUITS),JSON.stringify(catalog));
  assert.deepEqual(catalog.circuits.map(c=>c.id),['monza','monaco','le-mans']);
  assert.equal(new Set(catalog.circuits.map(c=>JSON.stringify(c.points))).size,3);
});
for(const def of catalog.circuits){
  test(`${def.name}: source provenance and map proportions are retained`,()=>{
    assert.match(def.url,/^https:/);assert.match(def.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(def.page>0);
    const xs=def.points.map(p=>p[0]),ys=def.points.map(p=>p[1]);
    const width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys);
    assert.ok(Math.abs(width/height-def.sourceBounds.width/def.sourceBounds.height)<1e-6);
    assert.ok(Math.abs(Math.max(width,height)-Math.max(def.sourceBounds.width,def.sourceBounds.height)*def.uniformScale)<.001);assert.ok(def.landmarks.length>=4);
  });
  test(`${def.name}: closed borders do not cross; centerline is fully clear for cars`,()=>{
    const t=make(def.id).track;
    const cross=(x,y,z)=>(y.x-x.x)*(z.y-x.y)-(y.y-x.y)*(z.x-x.x);
    for(let i=0;i<t.walls.length;i++)for(let j=i+1;j<t.walls.length;j++){
      const a=t.walls[i],b=t.walls[j];
      if(a.maxX<b.minX||a.minX>b.maxX||a.maxY<b.minY||a.minY>b.maxY)continue;
      assert.ok(!(cross(a.a,a.b,b.a)*cross(a.a,a.b,b.b)<-1e-8&&cross(b.a,b.b,a.a)*cross(b.a,b.b,a.b)<-1e-8),'crossed walls');
    }
    t.center.forEach((p,i)=>{
      const c=F.makeCar(t),next=t.center[(i+1)%t.center.length];Object.assign(c,p,{heading:Math.atan2(next.y-p.y,next.x-p.x)});
      assert.equal(F.collided(t,c),false,`blocked center point ${i}`);
      assert.ok(F.sense(t,c).every(v=>Number.isFinite(v)&&v>0&&v<=1));
    });
  });
  test(`${def.name}: sensor distances are derived from the real closed borders`,()=>{
    const t=make(def.id).track,c=F.makeCar(t),distances=F.sensorDistances(t,c);
    assert.equal(distances.length,F.VISUAL_SENSOR_COUNT);
    assert.ok(distances.every(v=>Number.isFinite(v)&&v>0&&v<=F.SENSOR_MAX));
    assert.ok(distances.some(v=>v<F.SENSOR_MAX),'the initial pose must see at least one real boundary');
  });
  test(`${def.name}: no rail-following; surface gravity and zero-steer motion are physical`,()=>{
    const t=make(def.id).track,a=F.makeCar(t),b=F.makeCar(t),control=F.makeCar(t),ground=F.Vehicle.Terrain.forTrack(t),pose=[a.x,a.y,a.heading];
    for(let i=0;i<420;i++)F.drive(t,a,[0,0,0]);assert.deepEqual([a.x,a.y,a.heading],pose);
    for(let i=0;i<3600&&b.alive;i++){F.drive(t,b,[0,.7,0]);F.Vehicle.step(control,[0,.7,0],F.DT,ground);assert.deepEqual([b.x,b.y,b.heading],[control.x,control.y,control.heading],'reward/collision layer must not project or steer a moving car');}
    assert.equal(b.reason,'urto');assert.ok(b.distance>10);
  });
  test(`${def.name}: neural simulation evolves with finite states and unchanged graph`,()=>{
    const sim=make(def.id),edges=JSON.stringify(data.edges);
    for(let i=0;i<2;i++)evaluateGeneration(sim);
    assert.equal(sim.generation,3);assert.equal(sim.history.length,2);
    assert.ok(sim.history.every(h=>[h.best,h.reward,h.penalty].every(Number.isFinite)));
    assert.ok(sim.history.every(h=>h.laps<=F.SCORE_RULES.maxLapsPerGeneration));
    assert.ok(sim.cars.every(c=>c.laps<=F.SCORE_RULES.maxLapsPerGeneration));
    assert.ok(sim.cars.every(c=>[c.x,c.y,c.heading,c.speed,...c.inputs,...c.brain.activity].every(Number.isFinite)));
    assert.equal(JSON.stringify(data.edges),edges);
  });
}
test('Switching track clears only the trial, preserving controls, pause and graph',()=>{
  const sim=make('lab'),graph=sim.graph;sim.advance(2);sim.evolve();sim.running=false;sim.population=8;sim.mutation=.1;sim.speedMultiplier=4;
  sim.setCircuit('monaco');assert.equal(sim.graph,graph);assert.equal(sim.running,false);assert.equal(sim.population,8);assert.equal(sim.mutation,.1);assert.equal(sim.speedMultiplier,4);
  assert.equal(sim.generation,1);assert.equal(sim.elapsed,0);assert.equal(sim.history.length,0);assert.equal(sim.champion,null);assert.equal(sim.bestEver,-Infinity);
  assert.equal(sim.cars.length,8);assert.ok(sim.cars.every(c=>c.brain.activity.every(a=>a===0)));
  const track=sim.track;assert.throws(()=>sim.setCircuit('unknown'),/sconosciuto/);assert.equal(sim.track,track);
  sim.setCircuit('lab');assert.equal(sim.track.total,F.makeTrack().total);assert.equal('maxSeconds' in sim,false);
});
test('Checkpoint keys isolate circuits; legacy Lab saves never load on map tracks',()=>{
  const sim=make('lab');
  const record={schema:1,rewardRevision:F.Rewards.REVISION,vehicleRevision:F.Vehicle.REVISION,graphRevision:sim.graph.revision,dataset:data.dataset,nodes:sim.graph.n,edges:sim.graph.from.length,fitness:123,genome:F.cloneGenome(sim.cars[0].genome)};
  assert.equal(F.checkpointKey(),`malecns-circuit-v48-${F.Rewards.REVISION}-${F.Vehicle.REVISION}-lab-r1-champion`);assert.equal(F.validCheckpoint(record,sim,data.dataset),true);
  assert.equal(F.validCheckpoint({...record,vehicleRevision:'992-gt3r-si-1'},sim,data.dataset),false,'pre-elevation physics cannot silently resume');
  assert.equal(F.validCheckpoint({...record,vehicleRevision:undefined},sim,data.dataset),false,'previous physics is explicitly incompatible');
  const legacy={...record,graphRevision:undefined,nodes:364,edges:6441};
  assert.equal(F.validCheckpoint(legacy,sim,data.dataset),false,'RL readout must not load against a different graph');
  const legacyGenome={...record.genome};delete legacyGenome.policyWeights;delete legacyGenome.adapterVersion;
  assert.equal(F.validCheckpoint({...legacy,genome:legacyGenome},sim,data.dataset),true);
  const ids=['lab',...catalog.circuits.map(c=>c.id)];assert.equal(new Set(ids.map(id=>F.checkpointKey(id))).size,4);
  for(const id of ids.slice(1)){
    sim.setCircuit(id);assert.equal(F.validCheckpoint(record,sim,data.dataset),false);
    const saved={...record,circuitId:id,circuitRevision:sim.circuit.revision};assert.equal(F.validCheckpoint(saved,sim,data.dataset),true);
    assert.equal(F.validCheckpoint({...saved,circuitRevision:1},sim,data.dataset),false);
    assert.equal(F.validCheckpoint({...saved,fitness:Infinity},sim,data.dataset),false);
    assert.equal(F.validCheckpoint({...saved,genome:{...saved.genome,gain:NaN}},sim,data.dataset),false);
  }
});
