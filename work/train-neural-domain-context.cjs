'use strict';
const fs=require('node:fs'),path=require('node:path'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads'),
  F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),B=require('./neural-context-bank.cjs'),
  O=require('./neural-domain-objective.cjs'),I=require('./neural-research-source-identity.cjs'),{updateDistribution}=require('./train-neural-context-cem.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  dataFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-domains-20261024-01/training-observations.private.json'),
  configFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-calibration-20261024-01/config.private.json'),
  calibrationFile=path.join(path.dirname(configFile),'report.json'),
  preflightFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-preflight-20261024-01/report.json'),
  data=JSON.parse(fs.readFileSync(dataFile,'utf8')),context=JSON.parse(fs.readFileSync(configFile,'utf8')),preflight=JSON.parse(fs.readFileSync(preflightFile,'utf8'));
const sources=()=>({...I.collect(['work/train-neural-domain-context.cjs']),trainingObservations:I.sha(fs.readFileSync(dataFile)),
  context:I.sha(fs.readFileSync(configFile)),calibration:I.sha(fs.readFileSync(calibrationFile)),preflight:I.sha(fs.readFileSync(preflightFile))});
function setup(){const calibration=JSON.parse(fs.readFileSync(calibrationFile,'utf8'));
  if(!data.passed||!preflight.passed||!calibration.passed||preflight.trainingDataSha256!==I.sha(fs.readFileSync(dataFile))||
    calibration.trainingObservationsSha256!==I.sha(fs.readFileSync(dataFile))||JSON.stringify(calibration.context)!==JSON.stringify(context))throw Error('Verified domain data required');return P.setup();}
function episode(sim,spec,headingOffsetRad){
  if(!data.trainingOffsets.includes(headingOffsetRad))throw Error('Held-out domains cannot be evaluated by this trainer');
  const base={...F,makeCar(...args){const car=F.makeCar(...args);car.heading+=headingOffsetRad;return car;}};
  return outcome(F,fullRollout(B.wrap(base,sim.graph,[...data.heads,spec]),sim.track,sim.graph,data.genome,{rewardRevision:data.revision}));
}
async function batch(tasks,identity,baseline,onResult){const workers=[],rows=[];
  try{await Promise.all([0,1].map(index=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{tasks:tasks.filter((_,i)=>i%2===index),identity,baseline}});workers.push(worker);let done=false;
    worker.on('message',m=>{if(m.kind==='error')reject(Error(m.error));else if(m.kind==='case'){rows.push(m);onResult?.(m,rows.length);}else if(m.kind==='done'){done=true;resolve();}});
    worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(Error('Domain worker ended '+code));});
  })));}finally{await Promise.all(workers.map(w=>w.terminate()));}
  if(rows.length!==tasks.length)throw Error('Incomplete physical domain batch');return tasks.map(t=>({...t,result:rows.find(r=>r.id===t.id).result}));
}
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/v3-neural-domain-cem-20261024-02');if(fs.existsSync(out))throw Error('Preserve domain training');
  const identity=sources(),started=Date.now(),sim=setup(),baseline=preflight.cases.map(c=>({headingOffsetRad:c.headingOffsetRad,result:c.zero.result})),
    zero={context,weights:[0,0],retention:.9},warm={context,weights:data.previousSecondHead.weights.slice(),retention:.9},
    baselineAggregate=O.aggregate(baseline.map(r=>r.result)),warmResults=preflight.cases.map(c=>({headingOffsetRad:c.headingOffsetRad,result:c.warm.result})),events=[],seed=241031,random=F.rng(seed),
    normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());
  for(const row of baseline)if(!P.same(episode(sim,zero,row.headingOffsetRad),row.result))throw Error('Domain baseline differs');
  let bestSafe={id:'zero',spec:zero,outcomes:baseline,aggregate:baselineAggregate},bestSearch={id:'warm',spec:warm,outcomes:warmResults,aggregate:O.aggregate(warmResults.map(r=>r.result))},
    distribution={mean:[0,0],cov:[[.35**2,0],[0,.5**2]]};
  if(O.researchScore(bestSafe.aggregate)>O.researchScore(bestSearch.aggregate))bestSearch=bestSafe;
  fs.mkdirSync(out);fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
  console.log('DOMAIN_TRAIN_START '+JSON.stringify({baseline:baselineAggregate,updates:4,population:16,domains:data.trainingOffsets,workers:2,device:'cpu',seed}));
  for(let update=0;update<4;update++){
    const proposals=[bestSearch.spec.weights.slice(),bestSafe.spec.weights.slice(),distribution.mean.slice(),warm.weights.slice()],l00=Math.sqrt(distribution.cov[0][0]),
      l10=distribution.cov[1][0]/l00,l11=Math.sqrt(Math.max(1e-12,distribution.cov[1][1]-l10*l10));
    for(let pair=0;pair<6;pair++){const z=[normal(),normal()],delta=[l00*z[0],l10*z[0]+l11*z[1]],
      center=pair%3===0?distribution.mean:pair%3===1?bestSafe.spec.weights:bestSearch.spec.weights;
      for(const sign of [1,-1])proposals.push(center.map((v,a)=>Math.max(-3,Math.min(3,v+sign*delta[a]))));}
    const candidates=proposals.map((weights,i)=>({id:`${update}:${i}`,spec:{context,weights,retention:.9}})),tasks=[];
    for(const c of candidates)for(const headingOffsetRad of data.trainingOffsets)tasks.push({id:`${c.id}:${headingOffsetRad}`,candidateId:c.id,spec:c.spec,headingOffsetRad});
    const rows=await batch(tasks,identity,baseline,(m,count)=>{if(count%8===0)console.log('DOMAIN_TRAIN_CASE '+JSON.stringify({update:update+1,completed:count,total:tasks.length,
      headingOffsetRad:m.headingOffsetRad,result:m.result,wallSeconds:(Date.now()-started)/1000}));}),evaluated=candidates.map(c=>{
      const outcomes=rows.filter(r=>r.candidateId===c.id).map(r=>({headingOffsetRad:r.headingOffsetRad,result:r.result}));
      return {...c,outcomes,aggregate:O.aggregate(outcomes.map(r=>r.result))};
    });
    for(const c of evaluated){if(c.aggregate.allSafe&&O.compareSafe(c.aggregate,bestSafe.aggregate)<0)bestSafe=c;
      if(O.researchScore(c.aggregate)>O.researchScore(bestSearch.aggregate))bestSearch=c;}
    const ranked=evaluated.slice().sort((a,b)=>O.researchScore(b.aggregate)-O.researchScore(a.aggregate)),unique=new Map();
    for(const c of ranked)if(!unique.has(JSON.stringify(c.spec.weights)))unique.set(JSON.stringify(c.spec.weights),c);
    const elite=[...unique.values()].slice(0,4),next=updateDistribution(distribution,elite),event={update:update+1,distributionBefore:distribution,
      distributionAfter:next,eliteIds:elite.map(c=>c.id),candidates:evaluated,bestSafe,bestSearch};events.push(event);distribution=next;
    if(JSON.stringify(sources())!==JSON.stringify(identity))throw Error('Domain sources changed');
    fs.writeFileSync(path.join(out,`update-${update+1}.json`),JSON.stringify(event,null,2),{flag:'wx'});
    const checkpoint={format:'private-neural-domain-cem-checkpoint-v1',nextUpdate:update+1,seed,genome:data.genome,heads:data.heads,
      context,revision:data.revision,trainingOffsets:data.trainingOffsets,heldOutOffsets:data.heldOutOffsets,bestSafe,bestSearch,distribution,sourceHashes:identity,
      boundary:'Private multi-domain decoder and objective revision. All-safe champion separate from possibly unsafe research distribution. Not a standard app save.'},pending=path.join(out,'checkpoint.private.json.pending');
    fs.writeFileSync(pending,JSON.stringify(checkpoint,null,2));fs.renameSync(pending,path.join(out,'checkpoint.private.json'));
    console.log('DOMAIN_TRAIN_UPDATE '+JSON.stringify({update:update+1,bestSafe:bestSafe.aggregate,bestWeights:bestSafe.spec.weights,bestSearch:bestSearch.aggregate,
      allSafeCandidates:evaluated.filter(c=>c.aggregate.allSafe).length,wallSeconds:(Date.now()-started)/1000}));
    if(bestSafe.aggregate.minimumLaps>=2)break;
  }
  const proofs=[];for(const row of bestSafe.outcomes){const r=episode(sim,bestSafe.spec,row.headingOffsetRad);if(!P.same(r,row.result))throw Error('Domain champion replay differs');proofs.push({headingOffsetRad:row.headingOffsetRad,result:r});}
  const saveHash=I.sha(fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')),report={format:'private-neural-domain-cem-training-v1',passed:true,
    created:new Date().toISOString(),appVersion:'5.6.0',learningSucceeded:bestSafe.aggregate.allSafe&&bestSafe.aggregate.minimumLaps>=2,
    singleStartImproved:bestSafe.aggregate.minimumProgress>baselineAggregate.minimumProgress+1,baseline,baselineAggregate,bestSafe,bestSearch,events,proofs,
    settings:{device:'cpu',workers:2,updates:4,population:16,trainingOffsets:data.trainingOffsets,heldOutOffsets:data.heldOutOffsets,seed,maxSimulatedTicks:null,
      selection:'Research worst native fitness plus 0.1 mean; all-safe champion ranked by minimum laps, minimum progress before two laps, then mean fitness. Gaussian proposals mix fitted/search/safe parents.'},
    sourceHashes:identity,originalSaveSha256:saveHash,wallSeconds:(Date.now()-started)/1000,
    boundary:'Two motor coefficients learned across three complete physical starts, no held-out trajectory evaluated by trainer, desired actions or route inputs. First head/genome unchanged; private format/revision not hidden.'};
  if(saveHash!=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'||JSON.stringify(sources())!==JSON.stringify(identity))throw Error('Domain preservation failed');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('DOMAIN_TRAIN_RESULT '+JSON.stringify({passed:true,learningSucceeded:report.learningSucceeded,singleStartImproved:report.singleStartImproved,
    bestSafe:bestSafe.aggregate,outcomes:bestSafe.outcomes,wallSeconds:report.wallSeconds,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
}
if(require.main===module){if(isMainThread)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});else{try{
  if(JSON.stringify(sources())!==JSON.stringify(workerData.identity))throw Error('Domain worker sources differ');const sim=setup(),zero={context,weights:[0,0],retention:.9};
  for(const row of workerData.baseline)if(!P.same(episode(sim,zero,row.headingOffsetRad),row.result))throw Error('Domain worker baseline differs');
  for(const task of workerData.tasks)parentPort.postMessage({kind:'case',id:task.id,headingOffsetRad:task.headingOffsetRad,result:episode(sim,task.spec,task.headingOffsetRad)});parentPort.postMessage({kind:'done'});
}catch(e){parentPort.postMessage({kind:'error',error:e.stack||String(e)});process.exitCode=1;}}}
