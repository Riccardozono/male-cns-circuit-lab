'use strict';
// Follow-up from the retained safe candidate, using the app's actual safety
// comparator rather than the legacy scalar score alone. Separate experiment.
const fs=require('node:fs'),path=require('node:path'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads'),
  F=require('../outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),
  I=require('./neural-research-source-identity.cjs'),{updateDistribution}=require('./train-neural-context-cem.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..'),
  parentPath=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-cem-20261024-01/checkpoint.private.json'),
  input=fs.readFileSync(parentPath),parent=JSON.parse(input),
  savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const sources=()=>({...I.collect(['work/train-neural-context-safe-cem.cjs']),parentCheckpoint:I.sha(fs.readFileSync(parentPath))}),
  compare=(a,b)=>F.compareOptimizerAgents(a.outcome,b.outcome);
function episode(sim,spec){return outcome(F,fullRollout(spec?M.wrap(F,sim.graph,spec):F,sim.track,sim.graph,parent.genome,{rewardRevision:'progress-3'}));}
async function batch(tasks,identity,baseline){const workers=[],cases=[];
  try{await Promise.all([0,1].map(index=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{tasks:tasks.filter((_,i)=>i%2===index),identity,baseline}});workers.push(worker);let done=false;
    worker.on('message',m=>{if(m.kind==='error')reject(Error(m.error));else if(m.kind==='case')cases.push(m);else if(m.kind==='done'){done=true;resolve();}});
    worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(Error('Safe CEM worker ended '+code));});
  })));}finally{await Promise.all(workers.map(w=>w.terminate()));}
  if(cases.length!==tasks.length)throw Error('Incomplete constrained batch');
  return tasks.map(t=>({...t,outcome:cases.find(c=>c.id===t.id).result}));
}
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-safe-cem-20261024-01');if(fs.existsSync(out))throw Error('Preserve constrained CEM');
  const identity=sources(),started=Date.now(),sim=P.setup(),baseline=episode(sim,null),initial=episode(sim,parent.bestSafe.spec),seed=241028,random=F.rng(seed),
    normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random()),events=[];
  if(!P.same(initial,parent.bestSafe.outcome)||!initial.safe)throw Error('Verified safe seed required');
  let best={spec:parent.bestSafe.spec,outcome:initial},distribution={mean:best.spec.weights.slice(),cov:[[.06**2,0],[0,.06**2]]};
  fs.mkdirSync(out);fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
  for(let update=0;update<4;update++){
    const proposals=[best.spec.weights.slice(),distribution.mean.slice()],l00=Math.sqrt(distribution.cov[0][0]),l10=distribution.cov[1][0]/l00,
      l11=Math.sqrt(Math.max(1e-12,distribution.cov[1][1]-l10*l10));
    for(let pair=0;pair<7;pair++){const z=[normal(),normal()],delta=[l00*z[0],l10*z[0]+l11*z[1]];
      for(const sign of [1,-1])proposals.push(distribution.mean.map((v,a)=>Math.max(-3,Math.min(3,v+sign*delta[a]))));}
    const tasks=proposals.map((weights,i)=>({id:`${update}:${i}`,spec:{...best.spec,weights}})),cases=await batch(tasks,identity,baseline),ranked=cases.slice().sort(compare);
    for(const c of cases){if(c.outcome.censored)throw Error('No censored optimizer result');if(c.outcome.safe&&compare(c,best)<0)best=c;}
    // Fit only safe observations when any exist. Include the retained parent,
    // so an all-crash proposal batch cannot redirect the distribution to crashes.
    const distinct=new Map();for(const c of [best,...ranked.filter(c=>c.outcome.safe)])distinct.set(JSON.stringify(c.spec.weights),c);
    const elite=[...distinct.values()].sort(compare).slice(0,4),fitted=updateDistribution(distribution,elite),
      event={update:update+1,distributionBefore:distribution,distributionAfter:fitted,cases,eliteIds:elite.map(c=>c.id??'retained-parent'),best};
    events.push(event);distribution=fitted;
    if(JSON.stringify(sources())!==JSON.stringify(identity))throw Error('Constrained sources changed');
    const checkpoint={format:'private-context-safe-cem-checkpoint-v1',nextUpdate:update+1,seed,genome:parent.genome,best,distribution,sourceHashes:identity,
      boundary:'Private readout, not a standard app save; no app compatibility check is bypassed.'},pending=path.join(out,'checkpoint.private.json.pending');
    fs.writeFileSync(pending,JSON.stringify(checkpoint,null,2));fs.renameSync(pending,path.join(out,'checkpoint.private.json'));
    fs.writeFileSync(path.join(out,`update-${update+1}.json`),JSON.stringify(event,null,2),{flag:'wx'});
    console.log('SAFE_CEM_UPDATE '+JSON.stringify({update:update+1,best:best.outcome,weights:best.spec.weights,safe:cases.filter(c=>c.outcome.safe).length,wallSeconds:(Date.now()-started)/1000}));
    if(best.outcome.laps>=2)break;
  }
  const proofs=[];for(let i=0;i<2;i++){const r=episode(sim,best.spec);if(!P.same(r,best.outcome))throw Error('Safe CEM repeat differs');proofs.push(r);}
  const report={format:'private-context-safe-cem-training-v1',passed:true,created:new Date().toISOString(),appVersion:'5.6.0',
    learningSucceeded:best.outcome.safe&&best.outcome.laps>=2,singleStartImproved:best.outcome.bestProgress>initial.bestProgress+1,baseline,initial,best,events,proofs,
    settings:{device:'cpu',workers:2,updates:4,population:16,seed,fittedParameters:2,rewardRevision:'progress-3',maxSimulatedTicks:null,
      ranking:'Unmodified app compareOptimizerAgents; Gaussian fit restricted to safe observations including retained parent.'},
    sourceHashes:identity,originalSaveSha256:I.sha(fs.readFileSync(savePath)),wallSeconds:(Date.now()-started)/1000,
    boundary:'Sequential follow-up initialized from previous safe candidate, not a paired A/B or cold start. Retains nonlinear decoder incompatibility; no app deployment. No desired controls, route coordinates, gifted progress or runtime clock.'};
  if(report.originalSaveSha256!=='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'||JSON.stringify(sources())!==JSON.stringify(identity))throw Error('Constrained preservation failed');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('SAFE_CEM_RESULT '+JSON.stringify({passed:true,learningSucceeded:report.learningSucceeded,singleStartImproved:report.singleStartImproved,
    initial,best:best.outcome,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json'))),wallSeconds:report.wallSeconds}));
}
if(require.main===module){if(isMainThread)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
else{try{if(JSON.stringify(sources())!==JSON.stringify(workerData.identity))throw Error('Worker source differs');const sim=P.setup();
  if(!P.same(episode(sim,null),workerData.baseline))throw Error('Worker parent differs');
  for(const task of workerData.tasks)parentPort.postMessage({kind:'case',id:task.id,result:episode(sim,task.spec)});parentPort.postMessage({kind:'done'});
}catch(e){parentPort.postMessage({kind:'error',error:e.stack||String(e)});process.exitCode=1;}}}
