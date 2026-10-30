'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Readout=require('./neural-self-readout.cjs'),Runtime=require('./current-physics-runtime.cjs');
const {fixture}=require('../outputs/tests/fixtures/reward-rollout.cjs');

function model(){
  const weights=Array(514*2).fill(0);weights[0]=.4;weights[513]=.2;weights[514]=-.3;
  return {format:'male-cns-neural-self-readout-v1',status:'research-unverified',inputSize:514,outputSize:2,
    observerSpec:{},sourceSha256:{},mean:Array(514).fill(.2),scale:Array(514).fill(.5),
    layers:[{input:514,output:2,weights,bias:[.1,-.2]}]};
}
function encode(data){const payloadJson=JSON.stringify(data);return JSON.stringify({format:'male-cns-neural-self-readout-envelope-v1',payloadJson,sha256:Readout.sha(payloadJson)});}

test('Research models reject corrupted payloads and rechecksummed invalid architecture',()=>{
  const valid=encode(model());assert.equal(Readout.parse(valid).layers.length,1);
  const bad=JSON.parse(valid);bad.payloadJson+=' ';assert.throws(()=>Readout.parse(JSON.stringify(bad)),/checksum/);
  const shape=model();shape.layers[0].weights.pop();assert.throws(()=>Readout.parse(encode(shape)),/layer/);
  const normalization=model();normalization.scale[2]=0;assert.throws(()=>Readout.parse(encode(normalization)),/normalization/);
});

test('The readout applies fixed normalization and signed pedal arbitration',()=>{
  const data=Readout.parse(encode(model())),input=Array(514).fill(.2);input[0]=.7;input[513]=-.3;
  const actual=Readout.action(data,input);
  assert.ok(Math.abs(actual[0]-Math.tanh(.3))<1e-14);
  assert.equal(actual[1],0);assert.ok(Math.abs(actual[2]-Math.tanh(.5))<1e-14);
  data.layers[0].bias[1]=2;
  const throttle=Readout.action(data,input);assert.ok(throttle[1]>0);assert.equal(throttle[2],0);
  assert.deepEqual(Readout.action(data,input,false),[0,0,0]);
  assert.deepEqual(Readout.action(data,input,true,false),[0,0,0]);
});

test('Parity rejects empty, incomplete, nonfinite and mismatching evidence',()=>{
  const data=model(),input=Array(514).fill(.2),expectedSignedOutputs=[Math.tanh(.1),Math.tanh(-.2)];
  assert.equal(Readout.parityError(data,[{input,expectedSignedOutputs}]),0);
  for(const probes of [[],[{input,expectedSignedOutputs:[0]}],[{input,expectedSignedOutputs:[NaN,0]}],
    [{input,expectedSignedOutputs:[0,0]}],[{input:input.slice(1),expectedSignedOutputs}]]){
    assert.throws(()=>Readout.parityError(data,probes),/parity/);
  }
});

test('Actual V3 descending-neuron frames reset deterministically and retain only two previous commands',()=>{
  const F=Runtime.create().F;
  const sim=new F.Simulation(require('../outputs/legacy-models.js').tagV3(require('../outputs/data/connectome.json')),
    {modelId:'v3',population:1,circuitId:'monza',circuits:require('../outputs/data/circuits.json')});
  const {graph,track}=sim,readoutIndices=[];
  for(let i=0;i<graph.n&&readoutIndices.length<128;i++)if(graph.classNames[graph.classCodes[i]]==='descending_neuron')readoutIndices.push(i);
  const spec={history:4,previousActions:2,baseGenome:F.cloneGenome(sim.cars[0].genome),readoutIndices,readoutBodyIds:readoutIndices.map(i=>graph.bodyIds[i])};
  const observation=Readout.observer(F,graph,track,spec),car=sim.cars[0],before=JSON.stringify(car);
  const first=observation.observe(car,[.25,-.1]);assert.equal(first.length,514);assert.ok(first.every(Number.isFinite));
  assert.deepEqual(first.slice(-2),[.25,-.1]);assert.equal(JSON.stringify(car),before,'observing must not drive the body');
  observation.reset();assert.deepEqual(observation.observe(car,[.25,-.1]),first);
  const wrong=structuredClone(spec);wrong.readoutBodyIds[0]='unverified';
  assert.throws(()=>Readout.observer(F,graph,track,wrong),/descending-neuron/);
});

function crawl(rewards){
  const {track,car}=fixture({referenceMps:35});rewards.initialise(track,car);
  for(let i=1;i<=180&&car.alive;i++){
    car.x=i*.1;car.lifetime=i*.1;car.vehicle.speedMps=1;
    rewards.step(track,car,{along:car.x,onRoad:true,dt:.1});
  }
  return {track,car};
}

test('The pace prototype is isolated: strict still stops, continuation still charges and collisions still terminate',()=>{
  const before=Runtime.sourceHashes(),strict=Runtime.create(),moving=Runtime.create('first-lap-moving');
  assert.equal(strict.rewardOverlaySha256,before['outputs/rewards.js']);
  assert.notEqual(moving.rewardOverlaySha256,strict.rewardOverlaySha256);
  const a=crawl(strict.F.Rewards),b=crawl(moving.F.Rewards);
  assert.equal(a.car.alive,false);assert.equal(a.car.reason,'troppo lenta / senza progresso');
  assert.equal(b.car.alive,true);assert.ok(b.car.researchPaceContinuations>0);
  assert.ok(b.car.rewardBreakdown.penalties.slowProgress>0);
  moving.F.Rewards.step(b.track,b.car,{along:b.car.x,onRoad:true,collision:true,dt:.1});
  assert.equal(b.car.alive,false);assert.equal(b.car.reason,'urto');
  assert.deepEqual(Runtime.sourceHashes(),before);
  assert.throws(()=>Runtime.create('silent-relaxation'),/mode/);
});
