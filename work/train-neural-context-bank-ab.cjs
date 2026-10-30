'use strict';
const fs=require('node:fs'),path=require('node:path'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads'),
  F=require('../.impeccable/experimental-progress-continuity-20261024/outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),B=require('./neural-context-bank.cjs'),
  I=require('./neural-research-source-identity.cjs'),{updateDistribution}=require('./train-neural-context-cem.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),
  root=path.resolve(__dirname,'..'),observationsFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-observations-20261024-01/observations.private.json'),
  configFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-calibration-20261024-01/config.private.json'),
  calibrationFile=path.join(path.dirname(configFile),'report.json'),observations=JSON.parse(fs.readFileSync(observationsFile,'utf8')),
  context=JSON.parse(fs.readFileSync(configFile,'utf8'));
const sources=()=>({...I.collect(['work/train-neural-context-bank-ab.cjs']),observations:I.sha(fs.readFileSync(observationsFile)),
  context:I.sha(fs.readFileSync(configFile)),calibration:I.sha(fs.readFileSync(calibrationFile))});
function setup(){const c=JSON.parse(fs.readFileSync(calibrationFile,'utf8'));if(!observations.passed||!c.passed||c.observationsSha256!==I.sha(fs.readFileSync(observationsFile)))throw Error('Verified neuronal calibration required');return P.setup();}
function episode(sim,spec){return outcome(F,fullRollout(B.wrap(F,sim.graph,[...observations.heads,spec]),sim.track,sim.graph,observations.genome,{rewardRevision:F.Rewards.PRIVATE_CONTINUITY_REVISION}));}
async function batch(tasks,identity,baseline,onResult){const workers=[],cases=[];
  try{await Promise.all([0,1].map(index=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{tasks:tasks.filter((_,i)=>i%2===index),identity,baseline}});workers.push(worker);let done=false;
    worker.on('message',m=>{if(m.kind==='error')reject(Error(m.error));else if(m.kind==='case'){cases.push(m);onResult?.(m,cases.length);}else if(m.kind==='done'){done=true;resolve();}});
    worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(Error('Bank worker ended '+code));});
  })));}finally{await Promise.all(workers.map(w=>w.terminate()));}
  if(cases.length!==tasks.length)throw Error('Incomplete bank batch');return tasks.map(t=>({...t,outcome:cases.find(c=>c.id===t.id).result}));
}
function compareSafe(a,b){return F.compareOptimizerAgents(a.outcome,b.outcome);}
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-bank-cem-ab-20261024-01');if(fs.existsSync(out))throw Error('Preserve bank training');
  const identity=sources(),started=Date.now(),sim=setup(),zero={context,weights:[0,0],retention:.9},baseline=episode(sim,zero),events=[],seed=241030,random=F.rng(seed),
    normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random());
  if(!P.same(baseline,observations.baseline))throw Error('Zero bank head changed physical baseline');
  const arms=['reward','safe'].map(name=>({name,distribution:{mean:[0,0],cov:[[.5**2,0],[0,.7**2]]},bestSearch:{spec:zero,outcome:baseline},bestSafe:{spec:zero,outcome:baseline}}));
  fs.mkdirSync(out);fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
  console.log('BANK_START '+JSON.stringify({baseline,workers:2,device:'cpu',updates:4,candidatesPerArm:16,seed}));
  for(let update=0;update<4;update++){
    const normals=Array.from({length:7},()=>[normal(),normal()]),tasks=[];
    for(const arm of arms){const d=arm.distribution,l00=Math.sqrt(d.cov[0][0]),l10=d.cov[1][0]/l00,l11=Math.sqrt(Math.max(1e-12,d.cov[1][1]-l10*l10)),
      proposals=[arm.bestSearch.spec.weights.slice(),d.mean.slice()];
      for(const z of normals){const delta=[l00*z[0],l10*z[0]+l11*z[1]];for(const sign of [1,-1])proposals.push(d.mean.map((v,a)=>Math.max(-3,Math.min(3,v+sign*delta[a]))));}
      proposals.forEach((weights,i)=>tasks.push({id:`${update}:${arm.name}:${i}`,arm:arm.name,spec:{context,weights,retention:.9}}));
    }
    const cases=await batch(tasks,identity,baseline,(m,count)=>{if(count%8===0)console.log('BANK_CASE '+JSON.stringify({update:update+1,completed:count,total:tasks.length,
      arm:m.arm,result:m.result,wallSeconds:(Date.now()-started)/1000}));}),updates=[];
    for(const arm of arms){const rows=cases.filter(c=>c.arm===arm.name),safe=rows.filter(c=>c.outcome.safe);
      for(const c of rows){if(c.outcome.censored)throw Error('No censored bank learner terminal');
        if(c.outcome.safe&&compareSafe(c,arm.bestSafe)<0)arm.bestSafe=c;
        if(arm.name==='reward'?c.outcome.fitness>arm.bestSearch.outcome.fitness:compareSafe(c,arm.bestSearch)<0)arm.bestSearch=c;}
      const ranked=arm.name==='reward'?rows.slice().sort((a,b)=>b.outcome.fitness-a.outcome.fitness):[arm.bestSafe,...safe].sort(compareSafe),
        unique=new Map();for(const c of ranked)if(!unique.has(JSON.stringify(c.spec.weights)))unique.set(JSON.stringify(c.spec.weights),c);
      const elite=[...unique.values()].slice(0,4),before=arm.distribution;arm.distribution=updateDistribution(before,elite);
      updates.push({arm:arm.name,distributionBefore:before,distributionAfter:arm.distribution,eliteIds:elite.map(c=>c.id??'retained-parent'),cases:rows,bestSearch:arm.bestSearch,bestSafe:arm.bestSafe});
    }
    if(JSON.stringify(sources())!==JSON.stringify(identity))throw Error('Bank training sources changed');
    const event={update:update+1,arms:updates};events.push(event);fs.writeFileSync(path.join(out,`update-${update+1}.json`),JSON.stringify(event,null,2),{flag:'wx'});
    const checkpoint={format:'private-neural-context-bank-cem-checkpoint-v1',nextUpdate:update+1,seed,arms,genome:observations.genome,heads:observations.heads,
      revision:F.Rewards.PRIVATE_CONTINUITY_REVISION,sourceHashes:identity,boundary:'Private two-head decoder and distinct reward revision, not a standard app save.'},pending=path.join(out,'checkpoint.private.json.pending');
    fs.writeFileSync(pending,JSON.stringify(checkpoint,null,2));fs.renameSync(pending,path.join(out,'checkpoint.private.json'));
    console.log('BANK_UPDATE '+JSON.stringify({update:update+1,arms:updates.map(a=>({arm:a.arm,safeInBatch:a.cases.filter(c=>c.outcome.safe).length,
      bestSafe:a.bestSafe.outcome,bestSearch:a.bestSearch.outcome})),wallSeconds:(Date.now()-started)/1000}));
    if(arms.some(a=>a.bestSafe.outcome.laps>=2))break;
  }
  const proofs=[];for(const arm of arms)for(let i=0;i<2;i++){const r=episode(sim,arm.bestSafe.spec);if(!P.same(r,arm.bestSafe.outcome))throw Error('Bank final replay differs');proofs.push({arm:arm.name,result:r});}
  const saveHash=I.sha(fs.readFileSync('C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save')),
    report={format:'private-neural-context-bank-cem-ab-v1',passed:true,created:new Date().toISOString(),appVersion:'5.6.0',
      learningSucceeded:arms.some(a=>a.bestSafe.outcome.safe&&a.bestSafe.outcome.laps>=2),singleStartImproved:arms.some(a=>a.bestSafe.outcome.bestProgress>baseline.bestProgress+1),
      baseline,settings:{device:'cpu',workers:2,updates:4,candidatesPerArm:16,seed,newLearnedCoefficients:2,retention:.9,
        revision:F.Rewards.PRIVATE_CONTINUITY_REVISION,maxSimulatedTicks:null,comparison:'Identical initialization and Gaussian innovations, scalar native R3 fitness versus safety-first selection/fit.'},
      arms,events,proofs,sourceHashes:identity,originalSaveSha256:saveHash,wallSeconds:(Date.now()-started)/1000,
      boundary:'Only new motor coefficients learned from actual complete outcomes. Actual neural history supplies context, no route/clock/labels. Frozen first head and original anatomy/genome retained. Private incompatibility not hidden; no app or distribution update.'};
  if(saveHash!=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'||JSON.stringify(sources())!==JSON.stringify(identity))throw Error('Bank preservation failed');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('BANK_RESULT '+JSON.stringify({passed:true,learningSucceeded:report.learningSucceeded,singleStartImproved:report.singleStartImproved,
    arms:arms.map(a=>({name:a.name,bestSafe:a.bestSafe.outcome})),wallSeconds:report.wallSeconds,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
}
if(require.main===module){if(isMainThread)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});else{try{
  if(JSON.stringify(sources())!==JSON.stringify(workerData.identity))throw Error('Bank worker sources differ');const sim=setup();
  const zero={context,weights:[0,0],retention:.9};if(!P.same(episode(sim,zero),workerData.baseline))throw Error('Bank worker baseline differs');
  for(const task of workerData.tasks)parentPort.postMessage({kind:'case',id:task.id,arm:task.arm,result:episode(sim,task.spec)});parentPort.postMessage({kind:'done'});
}catch(e){parentPort.postMessage({kind:'error',error:e.stack||String(e)});process.exitCode=1;}}}
