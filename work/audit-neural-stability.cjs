'use strict';
// Tiny state perturbation is a diagnostic fixture only. No invented training
// examples, vehicle controls, body placements or rewards are created here.
const fs=require('node:fs'),path=require('node:path'),Live=require('./neural-context-live.cjs'),Head=require('./neural-json-head.cjs');
const root=path.resolve(__dirname,'..'),env=Live.create(path.join(root,'.impeccable/review/neural-sacl/context-stack-3/model.malecns-neural-context.json')),
  F=env.runtime,g=env.graph,genome=env.model.head.causalModel.baseGenome,sensors=env.state().car.sensorVector.slice(),gains=F.synapticGains(g,genome);
const rowNorm=new Float64Array(g.n);for(let e=0;e<g.from.length;e++)rowNorm[g.to[e]]+=.9*Math.abs(g.weights[e])*gains[g.learning.groups[g.from[e]]];
const a=F.makeBrain(g),b=F.makeBrain(g);a.activity.set(env.state().car.brain.activity);b.activity.set(a.activity);
const node=g.inputs[0],epsilon=1e-12;b.activity[node]+=epsilon;const rows=[];
for(let i=0;i<100;i++){
  F.neuralStep(g,a,genome,sensors);F.neuralStep(g,b,genome,sensors);
  let max=0,sum=0;for(let j=0;j<g.n;j++){const d=Math.abs(a.activity[j]-b.activity[j]);max=Math.max(max,d);sum+=d*d;}
  rows.push({controlStep:i+1,maxDifference:max,rmsDifference:Math.sqrt(sum/g.n)});
}
const report={perturbation:{node,bodyId:g.bodyIds[node],epsilon},fixedSensorVector:sensors,
  maxRecurrentAbsoluteRowSum:Math.max(...rowNorm),rateLipschitzUpperBound:.45+.55*Math.max(...rowNorm),
  maximumObservedDifference:Math.max(...rows.map(r=>r.maxDifference)),finalDifference:rows.at(-1),rows,
  graph:{neurons:g.n,edges:g.edgeCount},modelSha256:env.modelSha256,sourceSha256:Head.sha(fs.readFileSync(__filename,'utf8')),
  boundary:'Same actual fixed sensory observation and existing neural weights, no physics advancement. Row-sum upper bound above one alone does not prove instability; measured perturbation amplification is separate evidence. No diagnostic observation or action is used for training.'};
const out=path.join(root,'.impeccable/review/neural-sacl/neural-stability-audit');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log('NEURAL_STABILITY_AUDIT '+JSON.stringify({...report,rows:undefined,fixedSensorVector:undefined}));
