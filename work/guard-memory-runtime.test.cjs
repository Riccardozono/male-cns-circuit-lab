'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),G=require('./guard-memory-runtime.cjs');
test('Historical controller validates against original archived implementation without accepting new scores as compatible',()=>{
  const saved=JSON.parse(fs.readFileSync(path.join(G.root,'.impeccable/review/neural-local-rbf/memory-narrow-098/checkpoint.json'),'utf8')),result=G.validateHistorical(saved);
  assert.equal(result.sim.graph.n,7721);assert.equal(result.sim.graph.edgeCount,242486);assert.equal(result.sim.cars[0].rewardRevision,'progress-4-guard-experiment');assert.notEqual(result.sim.cars[0].rewardRevision,'progress-3');
  assert.match(result.verifiedSources['work/neural-memory-rbf.cjs'].verifiedAt,/source/);assert.throws(()=>G.validateHistorical({...saved,decay:.1}),/checkpoint/);
});
test('Objective-specific warm start is a genuinely new episode with no old points or laps',()=>{
  const s=G.create(),genome=s.cars[0].genome,result=G.replay(s,genome,[],[],{maxTicks:1});assert.equal(result.result.laps,0);assert.equal(result.result.complete,false);assert.equal(result.result.simulationSeconds,G.F.DT);assert.ok(Math.abs(result.result.fitness)<1);assert.equal(result.result.reason,'evaluation censored');
});
