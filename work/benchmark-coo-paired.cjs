'use strict';
const fs=require('node:fs'),path=require('node:path'),G=require('./guard-memory-runtime.cjs'),H=require('./guard-memory-checkpoint.cjs'),D=require('./exact-dense.cjs'),COO=require('./exact-coo.cjs');
const {saved,sim}=H.load(path.join(G.root,'.impeccable/review/neural-local-rbf/coverage-guard4/checkpoint.json')),bank=[];
const recorder={...G.F,neuralStep(...args){bank.push(Array.from(args[3]));return G.F.neuralStep(...args);}};
G.M.replay(sim.track,sim.graph,saved.baseGenome,saved.centres,saved.championWeights,{decay:saved.decay,runtime:recorder});
const fast=D.wrap(G.F,COO.pass),pairs=[];
for(let round=0;round<3;round++){
  const a=G.F.makeBrain(sim.graph),b=G.F.makeBrain(sim.graph);for(const row of bank.slice(0,24)){G.F.neuralStep(sim.graph,a,saved.baseGenome,row);fast.neuralStep(sim.graph,b,saved.baseGenome,row);}
  for(let start=0,block=0;start<bank.length;start+=96,block++){
    const rows=bank.slice(start,start+96),run=(runtime,brain)=>{const time=performance.now();for(const row of rows)runtime.neuralStep(sim.graph,brain,saved.baseGenome,row);return performance.now()-time;};let oldMs,newMs;
    if((round+block)%2){newMs=run(fast,b);oldMs=run(G.F,a);}else{oldMs=run(G.F,a);newMs=run(fast,b);}
    if(!a.activity.every((v,j)=>Object.is(v,b.activity[j])))throw Error('Paired real-input neural state differs');pairs.push({round,block,frames:rows.length,originalMs:oldMs,optimizedMs:newMs,speedup:oldMs/newMs});
  }
}
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)],speedup=median(pairs.map(p=>p.speedup)),report={passed:true,exactNeuralStates:true,realSensorFrames:bank.length,pairedBlocks:pairs.length,alternatingOrder:true,medianPairedSpeedup:speedup,pairs,boundary:'Short adjacent same-input timing pairs, alternating order, to reduce observed CPU-load/frequency drift. Median of paired ratios, not unrelated medians. This measures only the CPU neural pass, not whole-app FPS or learning quality.'};
const output=path.join(G.root,'.impeccable/review/exact-coo');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'paired-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,pairs:undefined},null,2));
