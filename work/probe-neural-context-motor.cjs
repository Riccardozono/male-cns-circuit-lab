'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads'),
  F=require('../outputs/simulation.js'),P=require('./physical-rollout-pool.cjs'),M=require('./neural-context-motor.cjs'),I=require('./neural-research-source-identity.cjs'),
  {fullRollout,outcome}=require('./practice-full-rollout.cjs'),root=path.resolve(__dirname,'..');
const input=path.join(root,'.impeccable/review/learning-ml/saved-v3-multistart-learning-ab-20261024-01/zero-only.private.json'),
  configFile=path.join(root,'.impeccable/review/learning-ml/v3-neural-exploration-late-calibration-20261024-01/config.private.json');
const sources=()=>({...I.collect(['work/probe-neural-context-motor.cjs']),parentPrivateFile:I.sha(fs.readFileSync(input)),contextPrivateFile:I.sha(fs.readFileSync(configFile))});
function setup(){return {sim:P.setup(),genome:JSON.parse(fs.readFileSync(input,'utf8')).genome,context:JSON.parse(fs.readFileSync(configFile,'utf8'))};}
function episode(frame,spec,onControl=null){const api=spec?M.wrap(F,frame.sim.graph,spec):F;
  const r=fullRollout(api,frame.sim.track,frame.sim.graph,frame.genome,{rewardRevision:'progress-3',onControl});return outcome(F,r);}
function trace(hash,car,tick){
  hash.update(JSON.stringify([tick,car.x,car.y,car.heading,car.speed,car.bestProgress,car.fitness,car.vehicle,car.slowOutputs,car.sensorVector])+'\n');
  hash.update(new Uint8Array(car.brain.activity.buffer,car.brain.activity.byteOffset,car.brain.activity.byteLength));
}
async function main(){
  const out=path.join(root,'.impeccable/review/learning-ml/v3-neural-context-motor-probe-20261024-01');if(fs.existsSync(out))throw Error('Preserve prior context probe');
  const frame=setup(),before=sources(),start=Date.now(),baseHash=crypto.createHash('sha256'),baseline=episode(frame,null,(car,tick)=>trace(baseHash,car,tick)),
    baselineTrace=baseHash.digest('hex'),identity=[];
  for(const retention of [0,.98]){const hash=crypto.createHash('sha256'),result=episode(frame,{context:frame.context,weights:[0,0],retention},(car,tick)=>trace(hash,car,tick)),digest=hash.digest('hex');
    if(!P.same(result,baseline)||digest!==baselineTrace)throw Error('Zero-head physical/neural identity failed');identity.push({retention,result,traceSha256:digest});}
  fs.mkdirSync(out);console.log('CONTEXT_IDENTITY '+JSON.stringify({baseline,baselineTrace,identity:identity.map(x=>({retention:x.retention,exact:true}))}));
  const random=F.rng(241026),normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-12,random())))*Math.cos(2*Math.PI*random()),tasks=[];
  for(let pair=0;pair<8;pair++){const direction=[normal()*.7,normal()*.9].map(v=>Math.max(-3,Math.min(3,v)));
    for(const retention of [0,.9,.98])for(const sign of [1,-1])tasks.push({id:`${pair}:${retention}:${sign}`,pair,retention,sign,
      spec:{context:frame.context,weights:direction.map(v=>v*sign),retention}});}
  const results=[],handles=[];
  try{await Promise.all([0,1].map(index=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{tasks:tasks.filter((_,i)=>i%2===index),sourceHashes:before,baseline}});handles.push(worker);let done=false;
    worker.on('message',m=>{if(m.kind==='error')reject(Error(m.error));if(m.kind==='case'){results.push(m);if(results.length%6===0||m.result.bestProgress>baseline.bestProgress+1)
      console.log('CONTEXT_CASE '+JSON.stringify({completed:results.length,total:tasks.length,...m}));}if(m.kind==='done'){done=true;resolve();}});
    worker.once('error',reject);worker.once('exit',code=>{if(!done)reject(Error('Early context worker exit '+code));});
  })));}finally{await Promise.all(handles.map(w=>w.terminate()));}
  if(results.length!==tasks.length||JSON.stringify(before)!==JSON.stringify(sources()))throw Error('Context probe integrity failed');
  const cases=tasks.map(t=>({...t,outcome:results.find(r=>r.id===t.id).result})),safe=cases.filter(c=>c.outcome.safe).sort((a,b)=>b.outcome.laps-a.outcome.laps||b.outcome.bestProgress-a.outcome.bestProgress),
    best=safe[0],confirmations=[];
  if(best)for(let i=0;i<2;i++){const r=episode(frame,best.spec);if(!P.same(r,best.outcome))throw Error('Context candidate replay differs');confirmations.push(r);}
  const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',saveUnchanged=I.sha(fs.readFileSync(savePath))==='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3',
    report={format:'private-neural-context-motor-probe-v1',created:new Date().toISOString(),appVersion:'5.6.0',passed:saveUnchanged,
      learningSucceeded:Boolean(best&&best.outcome.safe&&best.outcome.laps>=2),singleStartImproved:Boolean(best&&best.outcome.bestProgress>baseline.bestProgress+1),
      baseline,baselineTraceSha256:baselineTrace,identity,sourceHashes:before,saveUnchanged,cases,bestSafe:best,confirmations,wallSeconds:(Date.now()-start)/1000,
      method:'Same actual V3 parent and fixed anatomy, nonlinear neural-context feature with2bounded output coefficients and leaky neuronal-history memory. Eight seeded Gaussian coefficient pairs with opposite signs, each tested at3retentions. Full natural from-line episodes, no inherited progress or simulated-time cap. Parameter probes only, not generations or a teacher policy.',
      boundary:'Two artificial motor coefficients and decoder memory are not additional anatomical neurons. This experimental readout is not encoded by the standard app save schema. No app source/save check is bypassed and no new app/version/release is installed. A successful candidate needs further learning/generalization validation.'};
  if(!report.passed)throw Error('Original save preservation failed');fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  fs.copyFileSync(__filename,path.join(out,'runner-at-run.cjs'));fs.copyFileSync(path.join(root,'work/neural-context-motor.cjs'),path.join(out,'context-runtime-at-run.cjs'));
  if(best)fs.writeFileSync(path.join(out,'best.private.json'),JSON.stringify({format:'private-neural-context-motor-v1',genome:frame.genome,spec:best.spec,outcome:best.outcome,sourceReport:'report.json'},null,2),{flag:'wx'});
  console.log('CONTEXT_RESULT '+JSON.stringify({passed:report.passed,learningSucceeded:report.learningSucceeded,singleStartImproved:report.singleStartImproved,safe:safe.length,baseline,bestSafe:best,confirmations,wallSeconds:report.wallSeconds,report:path.join(out,'report.json'),sha256:I.sha(fs.readFileSync(path.join(out,'report.json')))}));
}
if(isMainThread)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
else{try{if(JSON.stringify(sources())!==JSON.stringify(workerData.sourceHashes))throw Error('Context worker sources differ');const frame=setup();
  if(!P.same(episode(frame,null),workerData.baseline))throw Error('Context worker baseline differs');
  for(const task of workerData.tasks)parentPort.postMessage({kind:'case',id:task.id,result:episode(frame,task.spec)});parentPort.postMessage({kind:'done'});
}catch(e){parentPort.postMessage({kind:'error',error:e.stack||String(e)});process.exitCode=1;}}
