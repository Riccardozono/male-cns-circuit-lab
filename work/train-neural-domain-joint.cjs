'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads'),
  F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),B=require('./neural-context-bank.cjs'),
  O=require('./neural-domain-objective.cjs'),G=require('./neural-gaussian-search.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  parentDir=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-proof-20261024-01'),parentFile=path.join(parentDir,'checkpoint-snapshot.private.json'),
  parentBytes=fs.readFileSync(parentFile),parent=JSON.parse(parentBytes),parentProofFile=path.join(parentDir,'report.json'),parentProof=JSON.parse(fs.readFileSync(parentProofFile,'utf8')),
  dataFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-domains-20261024-01/training-observations.private.json'),data=JSON.parse(fs.readFileSync(dataFile,'utf8'));
const sources=()=>({...I.collect(['work/train-neural-domain-joint.cjs']),parentCheckpoint:I.sha(fs.readFileSync(parentFile)),parentProof:I.sha(fs.readFileSync(parentProofFile)),trainingData:I.sha(fs.readFileSync(dataFile))});
const fullWeights=spec=>[...parent.heads[0].weights,...spec.weights],originalWeights=[...parent.heads[0].weights,0,0],testOffsets=[-.00125,.00125];
function setup(){assert.equal(parentProof.passed,true);assert.equal(I.sha(parentBytes),parentProof.checkpointSha256);assert.equal(I.sha(fs.readFileSync(dataFile)),parentProof.sourceHashes.trainingObservations);
  assert.deepEqual(parent.genome,data.genome);assert.deepEqual(parent.heads,data.heads);return P.setup();}
function heads(weights){if(!Array.isArray(weights)||weights.length!==4||weights.some(v=>!Number.isFinite(v)||Math.abs(v)>3))throw Error('Four bounded neural motor coefficients required');
  return [{...parent.heads[0],weights:weights.slice(0,2)},{context:parent.context,weights:weights.slice(2),retention:.9}];}
function episode(sim,task){if(!parent.trainingOffsets.includes(task.headingOffsetRad))throw Error('Explicit training offset required');
  const base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=task.headingOffsetRad;return car;}};
  return outcome(F,fullRollout(B.wrap(base,sim.graph,heads(task.weights)),sim.track,sim.graph,parent.genome,{rewardRevision:parent.revision}));}
async function batch(tasks,identity,baseline,onResult){const workers=[],results=[];
  try{await Promise.all([0,1].map(index=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{tasks:tasks.filter((_,i)=>i%2===index),identity,baseline}});workers.push(worker);let done=false;
    worker.on('message',m=>{if(m.kind==='error')reject(Error(m.error));else if(m.kind==='case'){results.push(m);onResult?.(m,results.length);}else if(m.kind==='done'){done=true;resolve();}});
    worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(Error('Joint worker ended '+code));});
  })));}finally{await Promise.all(workers.map(w=>w.terminate()));}
  if(results.length!==tasks.length)throw Error('Incomplete joint batch');return tasks.map(t=>({...t,result:results.find(r=>r.id===t.id).result}));
}
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-joint-cem-20261024-01');if(fs.existsSync(out))throw Error('Preserve joint training');
  const identity=sources(),started=Date.now(),sim=setup(),seed=241101,random=F.rng(seed),normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random()),events=[],
    baseline=parent.bestSafe.outcomes,baselineWeights=fullWeights(parent.bestSafe.spec),baselineAggregate=O.aggregate(baseline.map(r=>r.result));
  for(const row of baseline)assert.deepEqual(episode(sim,{weights:baselineWeights,headingOffsetRad:row.headingOffsetRad}),row.result);
  let bestSafe={id:'parent-safe',weights:baselineWeights,outcomes:baseline,aggregate:baselineAggregate},
    bestSearch={id:'parent-search',weights:fullWeights(parent.bestSearch.spec),outcomes:parent.bestSearch.outcomes,aggregate:parent.bestSearch.aggregate},
    distribution={mean:baselineWeights.slice(),cov:[.08,.1,.2,.3].map((v,i)=>Array.from({length:4},(_,j)=>i===j?v*v:0))};
  fs.mkdirSync(out);fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
  console.log('JOINT_START '+JSON.stringify({baseline:baselineAggregate,updates:4,population:20,domains:parent.trainingOffsets,workers:2,device:'cpu',seed}));
  for(let update=0;update<4;update++){
    const proposals=[bestSearch.weights.slice(),bestSafe.weights.slice(),distribution.mean.slice(),originalWeights.slice()];
    for(let pair=0;pair<8;pair++){const delta=G.transform(distribution.cov,Array.from({length:4},normal)),center=pair%3===0?distribution.mean:pair%3===1?bestSafe.weights:bestSearch.weights;
      for(const sign of [1,-1])proposals.push(center.map((v,a)=>Math.max(-3,Math.min(3,v+sign*delta[a]))));}
    const candidates=proposals.map((weights,i)=>({id:`${update}:${i}`,weights})),tasks=[];
    for(const c of candidates)for(const headingOffsetRad of parent.trainingOffsets)tasks.push({...c,id:`${c.id}:${headingOffsetRad}`,candidateId:c.id,headingOffsetRad});
    const rows=await batch(tasks,identity,baseline,(m,count)=>{if(count%10===0)console.log('JOINT_CASE '+JSON.stringify({update:update+1,completed:count,total:tasks.length,
      headingOffsetRad:m.headingOffsetRad,result:m.result,wallSeconds:(Date.now()-started)/1000}));}),evaluated=candidates.map(c=>{
      const outcomes=rows.filter(r=>r.candidateId===c.id).map(r=>({headingOffsetRad:r.headingOffsetRad,result:r.result}));return {...c,outcomes,aggregate:O.aggregate(outcomes.map(r=>r.result))};
    });
    for(const c of evaluated){if(c.aggregate.allSafe&&O.compareSafe(c.aggregate,bestSafe.aggregate)<0)bestSafe=c;if(O.researchScore(c.aggregate)>O.researchScore(bestSearch.aggregate))bestSearch=c;}
    const ranked=evaluated.slice().sort((a,b)=>O.researchScore(b.aggregate)-O.researchScore(a.aggregate)),unique=new Map();
    for(const c of ranked)if(!unique.has(JSON.stringify(c.weights)))unique.set(JSON.stringify(c.weights),c);
    const elite=[...unique.values()].slice(0,5),next=G.update(distribution,elite.map(c=>c.weights)),event={update:update+1,distributionBefore:distribution,
      distributionAfter:next,eliteIds:elite.map(c=>c.id),candidates:evaluated,bestSafe,bestSearch};events.push(event);distribution=next;
    assert.deepEqual(sources(),identity);fs.writeFileSync(path.join(out,`update-${update+1}.json`),JSON.stringify(event,null,2),{flag:'wx'});
    const checkpoint={format:'private-neural-domain-joint-checkpoint-v1',nextUpdate:update+1,seed,genome:parent.genome,firstHead:parent.heads[0],context:parent.context,
      revision:parent.revision,trainingOffsets:parent.trainingOffsets,heldOutOffsets:parent.heldOutOffsets,testOffsets,bestSafe,bestSearch,distribution,sourceHashes:identity,
      boundary:'Both neural-context motor heads jointly learned; no new anatomical neurons. Private objective/decoder, not a standard app save.'},pending=path.join(out,'checkpoint.private.json.pending');
    fs.writeFileSync(pending,JSON.stringify(checkpoint,null,2));fs.renameSync(pending,path.join(out,'checkpoint.private.json'));
    console.log('JOINT_UPDATE '+JSON.stringify({update:update+1,bestSafe:bestSafe.aggregate,bestWeights:bestSafe.weights,bestSearch:bestSearch.aggregate,
      allSafeCandidates:evaluated.filter(c=>c.aggregate.allSafe).length,wallSeconds:(Date.now()-started)/1000}));if(bestSafe.aggregate.minimumLaps>=2)break;
  }
  const proofs=[];for(const row of bestSafe.outcomes){const r=episode(sim,{weights:bestSafe.weights,headingOffsetRad:row.headingOffsetRad});assert.deepEqual(r,row.result);proofs.push({headingOffsetRad:row.headingOffsetRad,result:r});}
  const saveHash=I.sha(fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')),report={format:'private-neural-domain-joint-training-v1',passed:true,
    created:new Date().toISOString(),appVersion:'5.6.0',learningSucceeded:bestSafe.aggregate.allSafe&&bestSafe.aggregate.minimumLaps>=2,
    singleStartImproved:bestSafe.aggregate.minimumProgress>baselineAggregate.minimumProgress+1,baseline,baselineAggregate,baselineWeights,bestSafe,bestSearch,events,proofs,
    settings:{device:'cpu',workers:2,updates:4,population:20,learnedMotorCoefficients:4,trainingOffsets:parent.trainingOffsets,heldOutOffsets:parent.heldOutOffsets,testOffsets,
      seed,maxSimulatedTicks:null,selection:'Worst native fitness plus0.1mean research; all-domain safe champion retained, ranked by minimum laps/progress.'},
    sourceHashes:identity,originalSaveSha256:saveHash,wallSeconds:(Date.now()-started)/1000,
    boundary:'Actual full from-line episodes only, both heads trained jointly; gate features and original connectome/genome unchanged. No teacher actions, route/time inputs or held-out episodes in training. No app deployment.'};
  assert.equal(saveHash,'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3');assert.deepEqual(sources(),identity);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('JOINT_RESULT '+JSON.stringify({passed:true,learningSucceeded:report.learningSucceeded,singleStartImproved:report.singleStartImproved,bestSafe:bestSafe.aggregate,
    outcomes:bestSafe.outcomes,wallSeconds:report.wallSeconds,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
}
if(require.main===module){if(isMainThread)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});else{try{
  assert.deepEqual(sources(),workerData.identity);const sim=setup(),weights=fullWeights(parent.bestSafe.spec);
  for(const row of workerData.baseline)assert.deepEqual(episode(sim,{weights,headingOffsetRad:row.headingOffsetRad}),row.result);
  for(const task of workerData.tasks)parentPort.postMessage({kind:'case',id:task.id,headingOffsetRad:task.headingOffsetRad,result:episode(sim,task)});parentPort.postMessage({kind:'done'});
}catch(e){parentPort.postMessage({kind:'error',error:e.stack||String(e)});process.exitCode=1;}}}
