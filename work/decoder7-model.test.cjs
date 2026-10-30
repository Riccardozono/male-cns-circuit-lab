'use strict';

const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const D6=require('./decoder6-model.cjs'),D7=require('./decoder7-model.cjs');
const {F,P,L}=D6,source=require(path.join(D6.runtime,'outputs/data/connectome.json'));

test('Decoder 6 to 7 migration preserves the exact initial steering, throttle and brake function',()=>{
  const oldSim=new F.Simulation(D6.model(source),{population:1}),oldPolicy=oldSim.graph.learning;
  const oldCommands=L.commands,uninstall=D7.install(L);
  try{
    const newSim=new F.Simulation(D7.model(source),{population:1}),newPolicy=newSim.graph.learning;
    assert.equal(oldPolicy.length,394);assert.equal(newPolicy.length,523);assert.deepEqual(Array.from(newPolicy.nodes),Array.from(oldPolicy.nodes));
    let seed=7717;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const oldGenome=F.cloneGenome(oldSim.cars[0].genome);
    oldGenome.policyWeights=oldGenome.policyWeights.map(()=>random()*1.2-.6);
    const newGenome=D7.genome(oldGenome,oldPolicy,newPolicy);
    for(let trial=0;trial<100;trial++){
      const a=F.makeBrain(oldSim.graph),b=F.makeBrain(newSim.graph);
      for(const node of oldPolicy.nodes){const value=random()*.8-.4;a.activity[node]=value;b.activity[node]=value;}
      const expected=oldCommands(oldSim.graph,a,oldGenome),actual=L.commands(newSim.graph,b,newGenome);
      assert.ok(actual.every((value,i)=>Math.abs(value-expected[i])<1e-10),`trial ${trial}: ${expected} != ${actual}`);
    }
  }finally{uninstall();}
});

test('Decoder 7 gas and brake heads can activate separately; physical actuator arbitration remains exclusive',()=>{
  const uninstall=D7.install(L);
  try{
    const sim=new F.Simulation(D7.model(source),{population:1}),{graph}=sim,p=graph.learning,genome=sim.cars[0].genome,brain=F.makeBrain(graph);
    genome.policyWeights.fill(0);brain.activity[p.nodes[0]]=.2;
    genome.policyWeights[p.biasOffset+1]=1;genome.policyWeights[p.biasOffset+2]=1;
    const actions=L.commands(graph,brain,genome);
    assert.ok(actions[1]>0&&actions[2]>0,'separate readout heads produce distinct gas and brake proposals');
    const physical=F.normalizeDriveCommands(actions);
    assert.equal(physical[1]>0&&physical[2]>0,false,'the actuator still resolves opposing pedals before applying force');
  }finally{uninstall();}
});

test('Decoder 6 save migration preserves optimizer tensors and resets only copied generation history',async()=>{
  const oldSim=new F.Simulation(D6.model(source),{population:4}),payload=P.fromSimulation(oldSim),oldPolicy=oldSim.graph.learning;
  const uninstall=D7.install(L);
  try{
    const newSim=new F.Simulation(D7.model(source),{population:4}),newPolicy=newSim.graph.learning;
    const migrated=D7.migrate(payload,oldPolicy,newPolicy,newSim.graph,P);
    P.validatePayload(migrated,{graph:newSim.graph,circuits:newSim.circuits});
    assert.equal(migrated.workers[0].state.generation,oldSim.generation);
    assert.equal(migrated.workers[0].state.history.length,0);
    assert.equal(migrated.workers[0].state.optimizer.mean.length,newPolicy.length);
    assert.equal(migrated.workers[0].state.genomes[0].adapterVersion,7);
    P.restore(newSim,migrated.workers[0].state);
    const roundTrip=await P.decode(await P.encode(P.fromSimulation(newSim),'5.6.0'),'5.6.0');
    P.validatePayload(roundTrip.payload,{graph:newSim.graph,circuits:newSim.circuits});
    assert.equal(roundTrip.payload.workers[0].state.genomes[0].adapterVersion,7);
  }finally{uninstall();}
});
