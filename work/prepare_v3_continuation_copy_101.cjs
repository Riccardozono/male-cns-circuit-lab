'use strict';
// Prepare a distinct, shareable five-worker experimental save from the
// completed continuation; the four other workers and both inputs stay intact.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const source=path.join(base,'progress7-trained-copy-20261027-93/SPERIMENTALE-solo-dev-v3-monza-gen80-worker0.malecns-save');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const run=path.join(base,'progress7-natural-continue-cuda-20261027-100'),out=path.join(base,'progress7-continuation-copy-20261027-101');
const P=require('../outputs/progress-save.js'),{DesktopEngine}=require('../desktop/engine.cjs');
const OldEngine=require('../dist-landscape-v560/win-unpacked/resources/app/desktop/engine.cjs').DesktopEngine;
const expected={source:'616f3040487aed072e09cb1961e3b9c135925156ad199d9b44609ec89eba5fbb',
 original:'29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3'};
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const check=(v,m)=>{if(!v)throw Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  check(!fs.existsSync(out)&&sha(source)===expected.source&&sha(original)===expected.original,'Output exists or input save differs');
  const reportFile=path.join(run,'report.json'),report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  check(report.passed&&!report.diagnosticGuardExceeded&&report.generationsCompleted>0&&report.inputSaveSha256===expected.source&&
    report.originalSaveSha256===expected.original&&report.gpu.gpuCalls>0&&report.gpu.cpuFallbacks===0,'Completed verified continuation required');
  check(report.runnerSha256===sha(path.join(root,'work/train_v3_progress7_continue_cuda_100.cjs')),'Training runner differs');
  for(const [f,h] of Object.entries(report.sourceHashes.before))check(report.sourceHashes.after[f]===h&&sha(path.join(root,f))===h,'Source differs: '+f);
  const candidates=report.checkpoints.map(({file,sha256})=>{check(path.dirname(path.resolve(file))===path.resolve(run)&&sha(file)===sha256,'Checkpoint identity differs');
    return {file,sha256,data:JSON.parse(fs.readFileSync(file,'utf8'))};}).sort((a,b)=>b.data.completedGenerations-a.data.completedGenerations);
  const latest=candidates[0],cp=latest.data;
  check(cp.format==='private-v3-progress7-continuation-checkpoint-v1'&&cp.workerIndex===0&&cp.completedGenerations===report.generationsCompleted&&
    cp.lastGeneration===report.rows.at(-1).generation&&cp.state.generation===cp.lastGeneration+1&&cp.state.rewardRevision==='progress-7-moving-pace'&&
    cp.inputSaveSha256===expected.source,'Checkpoint does not match continuation');
  const before=(await P.decode(fs.readFileSync(source,'utf8'),'5.6.0')).payload;
  check(before.modelId==='v3'&&before.circuitId==='monza'&&before.workers.length===5&&before.globalChampion===null,'Unexpected five-worker input');
  const payload=structuredClone(before);payload.workers[0].state=structuredClone(cp.state);
  check(payload.workers.slice(1).every((w,i)=>same(w,before.workers[i+1])),'Other worker state changed');
  const archive=cp.state.hallOfFame.slice().sort((a,b)=>b.bestProgress-a.bestProgress),frontier=archive[0];
  check(frontier&&frontier.bestProgress>=790.4610037005672-1e-8,'Previously verified safe frontier is not retained');
  const positions=cp.state.genomes.map((g,i)=>same(g,frontier.genome)?i:null).filter(i=>i!==null);
  const errors=[],engine=new DesktopEngine(path.join(root,'outputs'),()=>{},e=>errors.push(e.message));
  const oldRoot=path.join(root,'dist-landscape-v560/win-unpacked/resources/app'),oldEngine=new OldEngine(path.join(oldRoot,'outputs'),()=>{},()=>{});
  try{
    await engine.validateProgress(payload);let oldRejected=false;try{await oldEngine.validateProgress(payload);}catch(e){oldRejected=/ricompense incompatibile/i.test(e.message);}
    check(oldRejected,'Distributed 5.6.0 must reject the experimental revision');
    const encoded=await P.encode(payload,'5.6.0'),decoded=await P.decode(encoded,'5.6.0');await engine.restoreProgress(decoded.payload);
    await engine.command({type:'inspectAgent',value:0});await wait(500);const exported=await engine.exportProgress();
    check(engine.options.running===false&&engine.workers.length===5&&same(exported,payload)&&errors.length===0,'Paused inspected five-worker restore differs');
    check(sha(source)===expected.source&&sha(original)===expected.original,'Input save changed');
    fs.mkdirSync(out,{recursive:false});const filename='SPERIMENTALE-solo-dev-v3-monza-gen'+cp.state.generation+'-worker0.malecns-save';
    const destination=path.join(out,filename);fs.writeFileSync(destination,encoded,{encoding:'utf8',flag:'wx',mode:0o600});
    check(same((await P.decode(fs.readFileSync(destination,'utf8'),'5.6.0')).payload,payload),'Saved copy differs from payload');
    const result={passed:true,readyForRelease:false,appVersion:'5.6.0',model:'V3',circuit:'Monza',copyFile:filename,copySha256:sha(destination),
      originalSaveSha256:expected.original,sourceCopySha256:expected.source,trainingReportSha256:sha(reportFile),checkpointSha256:latest.sha256,
      generationsCompleted:report.generationsCompleted,worker0NextGeneration:cp.state.generation,otherWorkerGenerations:payload.workers.slice(1).map(w=>w.state.generation),
      populationPerWorker:40,allFiveWorkersPreserved:true,unchangedOtherWorkers:true,pausedInspectedDesktopRoundTrip:true,published560Rejects:true,
      archivedSafeFrontierM:frontier.bestProgress,frontierGenomesInStartingPopulation:positions,
      observedBestSafeProgressM:Math.max(...report.rows.map(r=>r.bestSafeProgressM??0)),observedMaxSafeLaps:Math.max(...report.rows.map(r=>r.maxSafeLaps)),
      runnerSha256:sha(__filename),boundary:'Experimental local source-app save, not compatible with the distributed 5.6.0. Only worker 0 evolved; four other workers are unchanged. A saved frontier is not proof of stable or generalized learning.'};
    const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('V3_CONTINUATION_SHAREABLE_COPY '+JSON.stringify({save:destination,sha256:result.copySha256,report:file,reportSha256:sha(file),
      worker0NextGeneration:cp.state.generation,archivedSafeFrontierM:result.archivedSafeFrontierM,frontierInPopulation:positions,
      observedBestSafeProgressM:result.observedBestSafeProgressM,observedMaxSafeLaps:result.observedMaxSafeLaps}));
  }finally{await engine.stop();await oldEngine.stop();}
}
main().catch(e=>{console.error('V3_CONTINUATION_SHAREABLE_COPY_FAILED '+(e.stack||e));process.exitCode=1;});
