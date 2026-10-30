'use strict';
const fs=require('node:fs'),path=require('node:path'),F=require('../outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),I=require('./neural-research-source-identity.cjs'),root=path.resolve(__dirname,'..'),
  dir=path.join(root,'.impeccable/review/learning-ml/v3-neural-ar1-natural-cuda-4update-20261024-01'),
  bytes=fs.readFileSync(path.join(dir,'checkpoint.private.json')),checkpoint=JSON.parse(bytes),
  out=path.join(root,`.impeccable/review/learning-ml/v3-neural-ar1-checkpoint-update${checkpoint.nextUpdate}-20261024-01`);
if(fs.existsSync(out)||checkpoint.format!=='private-v3-ar1-rl-checkpoint-v1')throw Error('New valid checkpoint verification required');
for(const [file,hash]of Object.entries(checkpoint.sourceHashes))if(I.sha(fs.readFileSync(path.join(root,file)))!==hash)throw Error('Checkpoint source identity differs');
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'checkpoint-snapshot.private.json'),bytes,{flag:'wx'});
const sim=P.setup(),best=outcome(F,fullRollout(F,sim.track,sim.graph,checkpoint.bestSafeGenome,{rewardRevision:'progress-3'}));
if(JSON.stringify(best)!==JSON.stringify(checkpoint.bestSafeOutcome))throw Error('Restored champion differs');
const event=JSON.parse(fs.readFileSync(path.join(dir,`update-${String(checkpoint.nextUpdate).padStart(2,'0')}.json`),'utf8')),
  current=outcome(F,fullRollout(F,sim.track,sim.graph,checkpoint.genome,{rewardRevision:'progress-3'})),
  accepted=event.candidates.find(c=>c.step===event.acceptedStep);
if(accepted&&JSON.stringify(current)!==JSON.stringify(accepted.outcome))throw Error('Restored current research policy differs');
const report={passed:true,learningSucceeded:false,completedUpdate:checkpoint.nextUpdate,best,current,currentResearchPolicySafe:current.safe,
  checkpointSnapshotSha256:I.sha(bytes),sourceSha256:I.sha(fs.readFileSync(__filename)),
  boundary:'Fresh independent native process replays stored champion and accepted current policy from zero physical/neural state, without a simulated-time cap. This is a private research checkpoint, not an app save or proof of exact future optimizer replay, generalization or learned two laps.'};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
console.log('AR1_CHECKPOINT '+JSON.stringify({...report,report:path.join(out,'report.json')}));
