'use strict';
// Observation only. No diagnostic fields below feed the motor decoder.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../outputs/simulation.js'),
  P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  source=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-safe-cem-20261024-01/checkpoint.private.json'),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-terminal-20261024-01');
if(fs.existsSync(out))throw Error('Preserve terminal trace');
const bytes=fs.readFileSync(source),checkpoint=JSON.parse(bytes),sim=P.setup(),tail=[],p=sim.graph.learning,w=checkpoint.genome.policyWeights,
  result=fullRollout(M.wrap(F,sim.graph,checkpoint.best.spec),sim.track,sim.graph,checkpoint.genome,{rewardRevision:'progress-3',onControl(car,tick){
    const base=[0,0],features=car.brain.policyFeatures;
    for(let j=0;j<p.nodes.length;j++)for(let a=0;a<2;a++)base[a]+=features[j]*w[p.readoutOffset+j*2+a]/Math.sqrt(p.nodes.length);
    for(let a=0;a<2;a++)base[a]+=w[w.length-2+a];
    tail.push({tick,seconds:car.lifetime,bestProgress:car.bestProgress,speedMps:car.vehicle.speedMps,
      gate:car.brain.contextMotorGate,memory:car.brain.contextMotorMemory,baseLogits:base,
      residualLogits:checkpoint.best.spec.weights.map(v=>v*car.brain.contextMotorMemory),commands:car.slowOutputs.slice(),
      activeReadoutNeurons:p.nodes.reduce((count,n)=>count+(Math.abs(car.brain.activity[n])>=1e-7),0)});
    if(tail.length>64)tail.shift();
  }}),r=outcome(F,result);assert.deepEqual(r,checkpoint.best.outcome);
const range=values=>({min:Math.min(...values),max:Math.max(...values)}),report={format:'private-context-terminal-observation-v1',passed:true,created:new Date().toISOString(),outcome:r,
  summary:{controls:tail.length,speedMps:range(tail.map(x=>x.speedMps)),gate:range(tail.map(x=>x.gate)),memory:range(tail.map(x=>x.memory)),
    baseLongitudinalLogit:range(tail.map(x=>x.baseLogits[1])),residualLongitudinalLogit:range(tail.map(x=>x.residualLogits[1])),
    throttle:range(tail.map(x=>x.commands[1])),brake:range(tail.map(x=>x.commands[2])),minimumActiveReadoutNeurons:Math.min(...tail.map(x=>x.activeReadoutNeurons))},
  tail,checkpointSha256:I.sha(bytes),sourceHashes:I.collect(['work/trace-neural-context-terminal.cjs']),
  boundary:'Dense final observations establish what the decoder commands at the terminal, not a causal diagnosis of all dynamics or a successful lap. Progress/clock are recorded only and never used for control.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({passed:true,outcome:r,summary:report.summary,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
