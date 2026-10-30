'use strict';
// Private, incompatible readout experiment. The search uses actual episodic R3
// fitness, including its penalties; unsafe research policies never become the
// separately retained safe candidate. No target actions enter this optimizer.
const fs=require('node:fs'),path=require('node:path'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads'),
  F=require('../outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),
  I=require('./neural-research-source-identity.cjs'),{fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..');
const parentFile=path.join(root,'.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/zero-only.private.json'),
  parentReport=path.join(path.dirname(parentFile),'report.json'),
  probeFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-motor-probe-20261024-01/report.json'),
  original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',
  originalHash='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const sources=()=>({...I.collect(['work/train-neural-context-cem.cjs']),parentFile:I.sha(fs.readFileSync(parentFile)),
  parentReport:I.sha(fs.readFileSync(parentReport)),probeReport:I.sha(fs.readFileSync(probeFile))});
function setup(){
  const genome=JSON.parse(fs.readFileSync(parentFile,'utf8')).genome,report=JSON.parse(fs.readFileSync(parentReport,'utf8')),
    expected=report.final.find(r=>r.arm==='zero-only').best;
  if(!report.passed||I.sha(JSON.stringify(genome))!==expected.genomeSha256)throw Error('Verified private parent required');
  return {sim:P.setup(),genome,expected:expected.zero};
}
function episode(frame,spec){return outcome(F,fullRollout(spec?M.wrap(F,frame.sim.graph,spec):F,frame.sim.track,frame.sim.graph,frame.genome,{rewardRevision:'progress-3'}));}
function updateDistribution(previous,elite){
  const weights=elite.map((_,i)=>Math.log(elite.length+.5)-Math.log(i+1)),sum=weights.reduce((a,b)=>a+b,0),mean=[0,0],cov=[[0,0],[0,0]];
  for(let i=0;i<elite.length;i++)for(let a=0;a<2;a++)mean[a]+=weights[i]/sum*elite[i].spec.weights[a];
  for(let i=0;i<elite.length;i++)for(let a=0;a<2;a++)for(let b=0;b<2;b++)cov[a][b]+=weights[i]/sum*(elite[i].spec.weights[a]-mean[a])*(elite[i].spec.weights[b]-mean[b]);
  const next={mean:mean.map((v,a)=>.6*v+.4*previous.mean[a]),cov:cov.map((row,a)=>row.map((v,b)=>.6*v+.4*previous.cov[a][b]+(a===b?.02**2:0)))};
  if(next.mean.some(v=>!Number.isFinite(v)||Math.abs(v)>3)||next.cov.flat().some(v=>!Number.isFinite(v))||
    next.cov[0][0]<=0||next.cov[1][1]<=0||next.cov[0][0]*next.cov[1][1]-next.cov[0][1]**2<=0)throw Error('Invalid fitted CEM distribution');
  return next;
}
async function batch(tasks,identity,baseline){
  const results=[],workers=[];
  try{await Promise.all([0,1].map(index=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{tasks:tasks.filter((_,i)=>i%2===index),identity,baseline}});workers.push(worker);let done=false;
    worker.on('message',m=>{if(m.kind==='error')reject(Error(m.error));else if(m.kind==='case')results.push(m);else if(m.kind==='done'){done=true;resolve();}});
    worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(Error('Early CEM worker exit '+code));});
  })));}finally{await Promise.all(workers.map(w=>w.terminate()));}
  if(results.length!==tasks.length)throw Error('Incomplete CEM physical batch');
  return tasks.map(t=>({...t,outcome:results.find(r=>r.id===t.id).result}));
}
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-cem-20261024-01');if(fs.existsSync(out))throw Error('Preserve existing training');
  const started=Date.now(),identity=sources(),frame=setup(),baseline=episode(frame,null),probe=JSON.parse(fs.readFileSync(probeFile,'utf8'));
  if(!P.same(baseline,frame.expected)||!P.same(baseline,probe.baseline)||!probe.passed||I.sha(fs.readFileSync(original))!==originalHash)throw Error('Training baseline integrity failed');
  const seedCase=probe.cases.slice().sort((a,b)=>b.outcome.fitness-a.outcome.fitness)[0],context=seedCase.spec.context,retention=seedCase.spec.retention,
    random=F.rng(241027),normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random()),events=[];
  let distribution={mean:seedCase.spec.weights.slice(),cov:[[.25**2,0],[0,.35**2]]},bestResearch={spec:seedCase.spec,outcome:seedCase.outcome},
    bestSafe={spec:{context,weights:[0,0],retention},outcome:baseline};
  if(!P.same(episode(frame,seedCase.spec),seedCase.outcome))throw Error('Seed research policy replay differs');
  fs.mkdirSync(out);fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));
  console.log('CEM_START '+JSON.stringify({baseline,seed:bestResearch,workers:2,updates:6,population:16}));
  for(let update=0;update<6;update++){
    const candidates=[bestResearch.spec.weights.slice(),distribution.mean.slice()],l00=Math.sqrt(distribution.cov[0][0]),l10=distribution.cov[1][0]/l00,
      l11=Math.sqrt(Math.max(1e-12,distribution.cov[1][1]-l10*l10));
    for(let pair=0;pair<7;pair++){const z=[normal(),normal()],delta=[l00*z[0],l10*z[0]+l11*z[1]];
      for(const sign of [1,-1])candidates.push(distribution.mean.map((v,a)=>Math.max(-3,Math.min(3,v+sign*delta[a]))));}
    const tasks=candidates.map((weights,i)=>({id:`${update}:${i}`,spec:{context,weights,retention}})),cases=await batch(tasks,identity,baseline),
      ranked=cases.slice().sort((a,b)=>b.outcome.fitness-a.outcome.fitness);
    for(const c of cases){if(c.outcome.censored)throw Error('No censored learning result');
      if(c.outcome.fitness>bestResearch.outcome.fitness)bestResearch=c;
      if(c.outcome.safe&&(c.outcome.laps>bestSafe.outcome.laps||c.outcome.laps===bestSafe.outcome.laps&&c.outcome.bestProgress>bestSafe.outcome.bestProgress))bestSafe=c;}
    const fitted=updateDistribution(distribution,ranked.slice(0,4)),event={update:update+1,distributionBefore:distribution,distributionAfter:fitted,
      eliteIds:ranked.slice(0,4).map(c=>c.id),cases,bestResearch,bestSafe};events.push(event);distribution=fitted;
    if(JSON.stringify(identity)!==JSON.stringify(sources()))throw Error('Training sources changed');
    const checkpoint={format:'private-context-cem-checkpoint-v1',nextUpdate:update+1,seed:241027,sourceHashes:identity,genome:frame.genome,
      distribution,bestResearch,bestSafe,boundary:'Private nonlinear readout, not a standard app save; unsafe research policy is not a champion.'},
      temporary=path.join(out,'checkpoint.private.json.pending');
    fs.writeFileSync(temporary,JSON.stringify(checkpoint,null,2));fs.renameSync(temporary,path.join(out,'checkpoint.private.json'));
    fs.writeFileSync(path.join(out,`update-${update+1}.json`),JSON.stringify(event,null,2),{flag:'wx'});
    console.log('CEM_UPDATE '+JSON.stringify({update:update+1,bestResearch:bestResearch.outcome,bestSafe:bestSafe.outcome,
      safeInBatch:cases.filter(c=>c.outcome.safe).length,distribution,wallSeconds:(Date.now()-started)/1000}));
    if(bestSafe.outcome.laps>=2)break;
  }
  const proofs=[];for(const [kind,candidate] of [['safe',bestSafe],['research',bestResearch]])for(let repeat=0;repeat<2;repeat++){
    const result=episode(frame,candidate.spec);if(!P.same(result,candidate.outcome))throw Error('Independent final outcome differs');proofs.push({kind,result});}
  const report={format:'private-context-cem-training-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:true,
    learningSucceeded:bestSafe.outcome.safe&&bestSafe.outcome.laps>=2,singleStartImproved:bestSafe.outcome.bestProgress>baseline.bestProgress+1,
    baseline,settings:{workers:2,device:'cpu',seed:241027,population:16,updates:6,elite:4,fitFraction:.6,covarianceFloor:.02**2,
      fittedParameters:2,retention,rewardRevision:'progress-3',extraUnsafeTrainingCost:0,maxSimulatedTicks:null},
    bestResearch,bestSafe,events,proofs,sourceHashes:identity,originalSaveSha256:I.sha(fs.readFileSync(original)),wallSeconds:(Date.now()-started)/1000,
    method:'Full covariance CEM on two neural-context motor coefficients. Gaussian proposals fitted to actual full-episode R3 fitness, including native penalties. Antithetic pairs, independent complete physical episodes from zero body/brain at the line. Research distribution may fit unsafe candidates; separately retained safe outcome is never replaced by one.',
    boundary:'Research-only nonlinear readout and memory, no new biological neurons. A crash can outrank a stall under legacy R3 fitness; therefore numerical fitness progress is not driving success. No coordinates, clock, desired actions, route driver, gifted progress, save bypass or app deployment.'};
  if(report.originalSaveSha256!==originalHash||JSON.stringify(identity)!==JSON.stringify(sources()))throw Error('Final source/save integrity failed');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log('CEM_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,singleStartImproved:report.singleStartImproved,
    bestSafe:bestSafe.outcome,bestResearch:bestResearch.outcome,wallSeconds:report.wallSeconds,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
}
if(require.main===module){if(isMainThread)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
else{try{if(JSON.stringify(sources())!==JSON.stringify(workerData.identity))throw Error('Worker source differs');const frame=setup();
  if(!P.same(episode(frame,null),workerData.baseline))throw Error('Worker baseline differs');
  for(const task of workerData.tasks)parentPort.postMessage({kind:'case',id:task.id,result:episode(frame,task.spec)});parentPort.postMessage({kind:'done'});
}catch(e){parentPort.postMessage({kind:'error',error:e.stack||String(e)});process.exitCode=1;}}}
module.exports={updateDistribution};
