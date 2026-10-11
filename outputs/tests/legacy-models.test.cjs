const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../simulation.js');
const Legacy=require('../legacy-models.js');
const source=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/connectome.json'),'utf8'));

function smoke(data,modelId){
  const graph=F.compileGraph(data),simulation=new F.Simulation(data,{modelId,population:4,speedMultiplier:1});
  simulation.advance(.25);
  return {graph,simulation};
}

test('V3 storico resta disponibile come grafo ridotto reale',()=>{
  const data=Legacy.tagV3(source),{graph,simulation}=smoke(data,'v3');
  assert.equal(data.nodes.length,7721);
  assert.equal(data.edges.length,242486);
  assert.equal(data.inputIndices.length,1200);
  assert.equal(graph.full,false);
  assert.equal(graph.modelId,'v3');
  assert.equal(simulation.modelId,'v3');
  assert.ok(simulation.cars.some(car=>car.distance>0));
});

test('V2 compatto ricostruito riduce davvero il carico del V3',()=>{
  const data=Legacy.buildV2(source),{graph,simulation}=smoke(data,'v2');
  assert.equal(data.nodes.length,1121);
  assert.equal(data.edges.length,32351);
  assert.equal(data.inputIndices.length,790);
  assert.equal(data.outputIndices.length,4);
  assert.equal(graph.full,false);
  assert.equal(graph.modelId,'v2');
  assert.equal(simulation.modelId,'v2');
  assert.ok(simulation.cars.some(car=>car.distance>0));
});
