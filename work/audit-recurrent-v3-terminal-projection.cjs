'use strict';
const fs=require('node:fs'),path=require('node:path'),F=require('../outputs/simulation.js'),Pool=require('./physical-rollout-pool.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),I=require('./neural-research-source-identity.cjs'),root=path.resolve(__dirname,'..'),
  dir=path.join(root,'.impeccable/review/learning-ml/v3-recurrent-reward-gradient-fine-cuda-20261024-01'),
  report=JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8')),meta=JSON.parse(fs.readFileSync(path.join(dir,'metadata.private.json'),'utf8')),
  candidates=JSON.parse(fs.readFileSync(path.join(dir,'candidates.private.json'),'utf8')),
  out=path.join(root,'.impeccable/review/learning-ml/v3-recurrent-terminal-projection-20261024-01');
if(!report.passed||fs.existsSync(out))throw Error('Verified new audit directory required');
const sources=I.collect(['work/audit-recurrent-v3-terminal-projection.cjs']),sim=Pool.setup(),cases=[];
for(const choice of [{id:'parent',weights:meta.genome.policyWeights,expected:report.baseline},
  ...['readout-only:0.003','all202:0.003'].map(id=>{const c=candidates.find(c=>c.id===id);return {id,weights:c.weights,expected:c.outcome};})]){
  const genome=F.cloneGenome(meta.genome);genome.policyWeights=choice.weights;const rows=[];
  const run=fullRollout(F,sim.track,sim.graph,genome,{rewardRevision:'progress-3',maxTicks:60000,onControl:(car,tick)=>{
    if(car.bestProgress<700)return;const p=F.locate(sim.track,car.x,car.y);
    rows.push({tick,seconds:tick*F.DT,x:car.x,y:car.y,heading:car.heading,speedMps:car.speed/(sim.track.pixelsPerMeter||1),
      bestProgress:car.bestProgress,projectionAlong:p.along,projectionT:p.t,centrelineDistance:p.distance,
      commands:car.slowOutputs.slice(),physicalDistance:car.distance,frontClearance:F.raycast(sim.track,car.x,car.y,car.heading)});
  }}),actual=outcome(F,run);
  if(!Pool.same(actual,choice.expected))throw Error('Terminal audit replay differs');
  const first=rows.findIndex(r=>r.bestProgress===actual.bestProgress),last=rows.at(-1),start=first>=0?rows[first]:last,
    vertex=sim.track.segments.map((s,index)=>({index,start:s.start,difference:Math.abs(s.start-actual.bestProgress)})).sort((a,b)=>a.difference-b.difference)[0];
  cases.push({id:choice.id,outcome:actual,nearestCentrelineVertex:vertex,lastMovingControl:last,
    terminalPlateauObservedSeconds:last.seconds-start.seconds,physicalDistanceDuringObservedPlateau:last.physicalDistance-start.physicalDistance,
    plateauFirstControl:start,terminalRows:rows.slice(-80)});
  console.log('RECURRENT_TERMINAL '+JSON.stringify({...cases.at(-1),terminalRows:undefined}));
}
const result={format:'v3-recurrent-terminal-projection-v1',passed:JSON.stringify(sources)===JSON.stringify(I.collect(['work/audit-recurrent-v3-terminal-projection.cjs'])),
  learningSucceeded:false,created:new Date().toISOString(),cases,sourceHashes:sources,
  boundary:'Three exact full native replays with telemetry only. Identical progress at a centreline vertex is not by itself a scoring bug or proof that reward shaping will improve learning. Geometry/heading in this diagnostic never enters motor commands.'};
if(!result.passed)throw Error('Terminal audit source drift');fs.mkdirSync(out);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2),{flag:'wx'});
fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));console.log('RECURRENT_TERMINAL_REPORT '+JSON.stringify({report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
