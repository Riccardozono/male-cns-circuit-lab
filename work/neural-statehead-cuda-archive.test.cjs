'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Archive}=require('./neural-statehead-cuda-archive.cjs');

test('ordinary state-head mutations keep the protected champion and clean frontier safe',()=>{
  const archive=new Archive({dimensions:18,population:16,maxProgress:12000});
  const safe={weights:Array(18).fill(0),fitness:500,baseFitness:500,progress:6584,laps:1,lapTimes:[742.55],reason:'troppo lenta / senza progresso',censored:false,overlap:0};
  const crash={...safe,weights:Array(18).fill(.1),fitness:1000,baseFitness:1000,progress:6791,reason:'urto'};
  archive.offer(safe);archive.offer(crash);
  assert.equal(archive.champion.reason,safe.reason,'crash candidates cannot displace the safe champion');
  const proposals=archive.ask(()=>.99,{strength:1});
  assert.equal(proposals.length,16);
  for(const child of proposals.slice(1))assert.deepEqual(child.parentWeights,safe.weights,'ordinary mutations descend from the clean champion/frontier');
});
test('a bounded exploratory branch can mutate an unsafe frontier without promoting it',()=>{
  const archive=new Archive({dimensions:18,population:16,maxProgress:12000});
  const safe={weights:Array(18).fill(0),fitness:500,baseFitness:500,progress:6584,laps:1,lapTimes:[742.55],reason:'troppo lenta / senza progresso',censored:false,overlap:0};
  const crash={...safe,weights:Array(18).fill(.1),fitness:1000,baseFitness:1000,progress:6591,reason:'urto'};
  archive.offer(safe);archive.offer(crash);
  const proposals=archive.ask(()=>.1,{strength:1});
  assert.equal(proposals.slice(1).filter(child=>child.parentWeights?.every(value=>value===.1)).length,4,'exactly 25% of a 16-agent generation explores the collision frontier');
  assert.equal(archive.champion.reason,safe.reason,'an unsafe parent is never eligible to become the protected champion');
  assert.deepEqual(archive.champion.weights,safe.weights);
});

test('a higher-fitness candidate can replace the champion within its 25 m progress band',()=>{
  const archive=new Archive({dimensions:18,population:16,maxProgress:12000});
  const baseline={weights:Array(18).fill(0),fitness:3187.91,baseFitness:3187.91,progress:6590.79,
    laps:1,lapTimes:[742.55],reason:'troppo lenta / senza progresso',censored:false,overlap:0};
  archive.offer(baseline);
  const lowerLock={...baseline,weights:Array(18).fill(.01),fitness:4054.29,baseFitness:4054.29,progress:6587.37};
  const promoted=archive.offer(lowerLock);
  assert.equal(promoted.promoted,true,'fitness gains are eligible when the lap count is preserved and progress stays in the same archive band');
  assert.equal(archive.champion.fitness,lowerLock.fitness);
  assert.equal(archive.champion.progress,lowerLock.progress);

  const lowerBand={...lowerLock,weights:Array(18).fill(.02),fitness:9000,progress:6574.99};
  assert.equal(archive.offer(lowerBand).promoted,false,'large progress regressions cannot replace the protected champion');
  const fewerLaps={...lowerLock,weights:Array(18).fill(.03),fitness:9500,progress:6599,laps:0,lapTimes:[]};
  assert.equal(archive.offer(fewerLaps).promoted,false,'a higher score cannot trade away a completed lap');
});

test('motor-family mutations touch only their real interleaved state-head coefficients',()=>{
  const archive=new Archive({dimensions:18,population:16,maxProgress:12000});
  const safe={weights:Array(18).fill(0),fitness:500,baseFitness:500,progress:6584,laps:1,lapTimes:[742.55],reason:'troppo lenta / senza progresso',censored:false,overlap:0};
  archive.offer(safe);
  const proposals=archive.ask(()=>.99,{strength:1});
  const checkFamily=(block,mutatedParity)=>{
    const children=proposals.filter(child=>child.block===block);
    assert.ok(children.length>=2,`${block} candidates are present`);
    for(const child of children){
      for(let i=0;i<18;i++){
        if(i%2===mutatedParity)assert.notEqual(child.weights[i],child.parentWeights[i],`${block} changes coefficient ${i}`);
        else assert.equal(child.weights[i],child.parentWeights[i],`${block} leaves coefficient ${i} unchanged`);
      }
    }
  };
  // neural-statehead.cjs maps even coefficients to steering (motor 0) and odd
  // coefficients to longitudinal control (motor 1).
  checkFamily('steering',0);
  checkFamily('longitudinal',1);
});
