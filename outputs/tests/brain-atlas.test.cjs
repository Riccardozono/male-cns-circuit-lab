'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Atlas=require('../brain-atlas.js'),F=require('../simulation.js'),Legacy=require('../legacy-models.js'),source=require('../data/connectome.json');
const graph=()=>({n:4,missingPosition:-2147483648,positions:new Int32Array([0,0,0,10,20,30,40,50,60,-2147483648,0,0]),rowOffsets:new Uint32Array([0,2,3,4,4]),targets:new Uint32Array([1,2,2,3]),csrWeights:new Float32Array([.4,.2,.8,1]),learning:{groups:new Uint8Array([0,1,1,0])}});
const camera=()=>({focus:[0,0,0],fit:1,yaw:0,pitch:0,zoom:1,pan:[0,0]});

test('Atlas excludes missing coordinates instead of fabricating a soma location',()=>{
  const g=graph(),original=g.positions.slice(),c=Atlas.coordinates(g);
  assert.deepEqual(c.indices,[0,1,2]);assert.equal(c.missing,1);assert.equal(c.valid[3],0);
  assert.deepEqual(c.center,[20,25,30]);assert.equal(c.span,60);assert.deepEqual(g.positions,original);
  assert.deepEqual(Array.from(c.positions.subarray(9)),[0,0,0]); // Never sampled: valid[3] is false.
});
test('Atlas also excludes a missing Y/Z coordinate, NaN or incomplete triples',()=>{
  const g={n:4,missingPosition:-2147483648,positions:[1,2,3,1,-2147483648,3,NaN,2,3,1,2]};
  assert.deepEqual(Atlas.coordinates(g).indices,[0]);
});
test('An empty atlas has finite normalization and no invented points',()=>{
  const c=Atlas.coordinates({n:1,missingPosition:-1,positions:[-1,-1,-1]});
  assert.deepEqual(c.indices,[]);assert.deepEqual(c.center,[0,0,0]);assert.equal(c.span,1);assert.equal(c.missing,1);
});
test('Visual sampling is deterministic, unique and preserves real readout points only',()=>{
  const indices=[0,2,4,6,8,10],points=Atlas.sample(indices,3,[10,4,99]);
  assert.deepEqual(points,[0,4,8,10]);assert.equal(new Set(points).size,points.length);
  assert.ok(points.every(i=>indices.includes(i)));assert.deepEqual(Atlas.sample([],3,[99]),[]);
});
test('Perspective uses the same camera math for positions and point selection',()=>{
  const c=camera(),center=Atlas.project([0,0,0],c,800,400),right=Atlas.project([1,0,0],c,800,400);
  assert.equal(center.x,400);assert.equal(center.y,200);assert.equal(right.x,564);
  c.yaw=Math.PI/2;const rotated=Atlas.project([1,0,0],c,800,400);assert.ok(Math.abs(rotated.x-400)<1e-8);assert.equal(rotated.depth,1);
  c.pan=[12,-8];const p=Atlas.project([0,0,0],c,800,400);assert.equal(p.x,412);assert.equal(p.y,192);
});
test('Zoomed projections stay finite, with a positive perspective near the camera',()=>{
  const c=camera();c.fit=40;c.zoom=5;
  const p=Atlas.project([0,0,-1],c,390,360);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.perspective>0);
});
test('Connection display reads real CSR edges, source gains and signed activity only',()=>{
  const g=graph(),a=new Float32Array([.5,-.8,.7,0]),originalA=a.slice(),originalW=g.csrWeights.slice(),valid=Atlas.coordinates(g).valid,mask=new Uint8Array([1,1,1,1]);
  const e=Atlas.edges(g,a,valid,mask,2,-1,[2,.5]);
  assert.equal(e.length,2);assert.deepEqual(e.map(v=>[v.source,v.target]),[[0,1],[1,2]]);
  assert.ok(e[0].contribution>0&&e[1].contribution<0);assert.ok(e[0].score>=e[1].score);
  assert.deepEqual(a,originalA);assert.deepEqual(g.csrWeights,originalW);
});
test('Hidden endpoints, zero activity and a zero connection budget draw no edges',()=>{
  const g=graph(),valid=Atlas.coordinates(g).valid,a=new Float32Array([1,1,1,0]);
  assert.deepEqual(Atlas.edges(g,a,valid,new Uint8Array([1,0,0,0]),10),[]);
  assert.deepEqual(Atlas.edges(g,new Float32Array(4),valid,new Uint8Array(4).fill(1),10),[]);
  assert.deepEqual(Atlas.edges(g,a,valid,new Uint8Array(4).fill(1),0),[]);
});
test('Selecting a neuron shows only existing adjacent connections',()=>{
  const g=graph(),e=Atlas.edges(g,new Float32Array([1,1,1,0]),Atlas.coordinates(g).valid,new Uint8Array(4).fill(1),10,1);
  assert.deepEqual(e.map(v=>[v.source,v.target]).sort(),[[0,1],[1,2]]);
});
test('Atlas inspection does not change real V2/V3 neural state, genome or optimizer',()=>{
  for(const data of [Legacy.buildV2(source),Legacy.tagV3(source)]){
    const sim=new F.Simulation(data,{population:1}),car=sim.cars[0];for(let i=0;i<6;i++)sim.tick();
    const before={activity:car.brain.activity.slice(),genome:JSON.stringify(car.genome),history:JSON.stringify(sim.history),stats:JSON.stringify(sim.optimizer.metrics()),weights:sim.graph.csrWeights.slice()};
    const c=Atlas.coordinates(sim.graph),nodes=Atlas.sample(c.indices,6000,sim.graph.learning.nodes),e=Atlas.edges(sim.graph,car.brain.activity,c.valid,c.valid,220,-1,F.synapticGains(sim.graph,car.genome));
    assert.ok(nodes.length>0);assert.ok(e.every(v=>c.valid[v.source]&&c.valid[v.target]));
    assert.deepEqual(car.brain.activity,before.activity);assert.equal(JSON.stringify(car.genome),before.genome);assert.equal(JSON.stringify(sim.history),before.history);assert.equal(JSON.stringify(sim.optimizer.metrics()),before.stats);assert.deepEqual(sim.graph.csrWeights,before.weights);
  }
});
