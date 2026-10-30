'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),
  P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  sourceDir=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-domains-20261024-01'),dataFile=path.join(sourceDir,'training-observations.private.json'),
  diagnosticsFile=path.join(sourceDir,'report.json'),data=JSON.parse(fs.readFileSync(dataFile,'utf8')),diagnostics=JSON.parse(fs.readFileSync(diagnosticsFile,'utf8')),
  out=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-wide-observations-20261024-01');
if(fs.existsSync(out))throw Error('Preserve wide neural observations');assert.equal(diagnostics.passed,true);
const sim=P.setup(),nodes=Array.from({length:sim.graph.n},(_,n)=>n).filter(n=>sim.graph.classNames[sim.graph.classCodes[n]]==='descending_neuron'),training=[],validation=[];
assert.equal(nodes.length,251);assert.ok(Array.from(sim.graph.learning.nodes).every(n=>nodes.includes(n)));assert.equal(nodes.some(n=>sim.graph.inputs.includes(n)),false);
for(const headingOffsetRad of [...data.trainingOffsets,...data.heldOutOffsets]){
  const rows=[],base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}},
    r=fullRollout(M.wrap(base,sim.graph,data.heads[0]),sim.track,sim.graph,data.genome,{rewardRevision:data.revision,onControl(car,tick){
      rows.push({control:rows.length,tick,features:nodes.map(n=>Math.tanh(8*car.brain.activity[n])),oldFeatures:Array.from(car.brain.policyFeatures),progressM:car.bestProgress});
    }}),result=outcome(F,r),previous=diagnostics.records.find(r=>r.headingOffsetRad===headingOffsetRad).parent.outcome;
  assert.deepEqual(result,previous);const row={headingOffsetRad,result,observations:rows};
  (data.trainingOffsets.includes(headingOffsetRad)?training:validation).push(row);
  console.log('WIDE_NEURAL_CASE '+JSON.stringify({headingOffsetRad,controls:rows.length,result,features:nodes.length}));
}
const common={format:'private-wide-neural-domain-observations-v1',passed:true,created:new Date().toISOString(),nodes,bodyIds:nodes.map(n=>String(sim.graph.bodyIds[n])),
  originalReadoutNodes:Array.from(sim.graph.learning.nodes),anatomicalNeurons:sim.graph.n,anatomicalEdges:sim.graph.edgeCount,
  trainingOffsets:data.trainingOffsets,validationOffsets:data.heldOutOffsets,sourceHashes:I.collect(['work/collect-wide-neural-domains.cjs']),
  parentDataSha256:I.sha(fs.readFileSync(dataFile)),parentDiagnosticsSha256:I.sha(fs.readFileSync(diagnosticsFile)),
  boundary:'Existing real descending-neuron activity only; no anatomical neurons, sensory shortcut or driving actions added. Domain split preserved. Validation rows must be read only after the contrast is fixed from training rows.'};
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'training.private.json'),JSON.stringify({...common,domains:training},null,2),{flag:'wx'});
fs.writeFileSync(path.join(out,'validation.private.json'),JSON.stringify({...common,domains:validation},null,2),{flag:'wx'});
const report={...common,trainingControls:training.map(d=>({headingOffsetRad:d.headingOffsetRad,controls:d.observations.length})),validationControls:validation.map(d=>({headingOffsetRad:d.headingOffsetRad,controls:d.observations.length})),
  trainingSha256:I.sha(fs.readFileSync(path.join(out,'training.private.json'))),validationSha256:I.sha(fs.readFileSync(path.join(out,'validation.private.json')))};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log('WIDE_NEURAL_RESULT '+JSON.stringify({passed:true,anatomicalNeurons:sim.graph.n,currentMotorReadout:sim.graph.learning.nodes.length,observedDescending:nodes.length,
  report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
