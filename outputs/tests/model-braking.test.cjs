'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const FlySim=require('../simulation.js');
const Legacy=require('../legacy-models.js');
const Profiles=require('../model-profiles.js');
const source=require('../data/connectome.json');
const metadata=require('../data/connectome-full.json');

function fullBundle(){
  const bytes=fs.readFileSync(path.join(__dirname,'../data',metadata.binary));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const types={float64:Float64Array,float32:Float32Array,int32:Int32Array,uint32:Uint32Array,uint8:Uint8Array,int8:Int8Array};
  const data={...metadata,compact:true};
  for(const [name,descriptor] of Object.entries(metadata.arrays))data[name]=new types[descriptor.dtype](buffer,descriptor.offset,descriptor.length);
  return data;
}

const full=fullBundle();
const graphs=new Map([
  ['v2',FlySim.compileGraph(Legacy.buildV2(source))],
  ['v3',FlySim.compileGraph(Legacy.tagV3(source))],
  ['v4',FlySim.compileGraph(full)],
  ['v5',FlySim.compileGraph(Profiles.buildV5(full))]
]);
const track=FlySim.makeTrack();

function assertPhysicalBrake(modelId,graph){
  const brain=FlySim.makeBrain(graph);
  let genome,commands;
  if(modelId==='v5'){
    const policy=FlySim.ensureLearning(graph);
    brain.activity[policy.nodes[0]]=1;
    const policyWeights=Array(policy.length).fill(0);
    policyWeights[policyWeights.length-1]=-1;
    genome={adapterVersion:policy.version,policyWeights};
    commands=FlySim.neuralOutputsFromBrain(graph,brain,genome);
  }else{
    const output=graph.outputs[2];
    brain.activity[output]=1;
    const readout=new Float64Array(graph.outputs.length*3);
    readout[2*3+2]=1;
    genome={readout};
    commands=FlySim.neuralOutputsFromBrain(graph,brain,genome);
  }
  assert.equal(commands[1],0,`${modelId} must not energize throttle while braking`);
  assert.ok(commands[2]>.05,`${modelId} must produce positive braking force`);
  const actuator=FlySim.normalizeDriveCommands(commands);
  assert.equal(actuator[1],0,`${modelId} actuator must keep throttle and brake exclusive`);
  assert.ok(actuator[2]>.05,`${modelId} actuator must preserve the brake command`);
  const car=FlySim.makeCar(track);
  car.speed=90;
  FlySim.drive(track,car,actuator);
  assert.ok(car.speed<90,`${modelId} brake must reduce physical speed`);
}

for(const modelId of ['v2','v3','v4','v5'])test(`${modelId.toUpperCase()} neural brake reaches the Porsche 992 physical actuator`,()=>{
  assertPhysicalBrake(modelId,graphs.get(modelId));
});
