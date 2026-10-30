'use strict';
// Build a shareable, explicitly experimental five-worker COPY, replacing
// only worker zero with a verified completed research checkpoint. No source
// save, packaged app, distributed release, tag or version is altered.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const copy=path.join(base,'saved-v3-moving-pace-copy-20261027-85/SPERIMENTALE-solo-dev-v3-monza-progress7-copia.malecns-save');
const run=path.join(base,'progress7-natural-training-cuda-20261027-92'),out=path.join(base,'progress7-trained-copy-20261027-93');
const P=require('../outputs/progress-save.js'),{DesktopEngine}=require('../desktop/engine.cjs');
const OldEngine=require('../dist-landscape-v560/win-unpacked/resources/app/desktop/engine.cjs').DesktopEngine;
const expectedOriginal='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const expectedCopy='9ec19c8ea77f45327a863c935a0ea8774db435166bc26447870fe4dc96893bd2';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function main(){
  check(!fs.existsSync(out)&&sha(original)===expectedOriginal&&sha(copy)===expectedCopy,'Output exists or source save changed');
  const reportFile=path.join(run,'report.json'),report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  check(report.passed&&report.generationsCompleted>0&&!report.diagnosticGuardExceeded&&report.settings.worker===0&&
    report.experimentalSaveSha256===expectedCopy&&report.originalSaveSha256===expectedOriginal&&report.gpu.gpuCalls>0&&report.gpu.cpuFallbacks===0,
    'A completed, verified research run is required');
  check(report.runnerSha256===sha(path.join(root,'work/train_v3_progress7_natural_cuda_92.cjs')),'Research runner differs');
  for(const [f,h] of Object.entries(report.sourceHashes.before))check(report.sourceHashes.after[f]===h&&sha(path.join(root,f))===h,'App source differs: '+f);
  const candidates=report.checkpoints.map(({file,sha256})=>{check(sha(file)===sha256,'Checkpoint hash differs');return {file,sha256,data:JSON.parse(fs.readFileSync(file,'utf8'))};})
    .sort((a,b)=>b.data.completedGenerations-a.data.completedGenerations),latest=candidates[0];
  const cp=latest.data;check(cp.format==='private-v3-progress7-natural-checkpoint-v1'&&cp.workerIndex===0&&
    cp.completedGenerations===report.generationsCompleted&&cp.lastGeneration===report.rows.at(-1).generation&&cp.nextGeneration===cp.lastGeneration+1&&
    cp.state.generation===cp.nextGeneration&&cp.state.rewardRevision==='progress-7-moving-pace'&&cp.experimentalSaveSha256===expectedCopy,
    'Latest checkpoint does not correspond to the completed run');
  const source=(await P.decode(fs.readFileSync(copy,'utf8'),'5.6.0')).payload;
  check(source.modelId==='v3'&&source.circuitId==='monza'&&source.workers.length===5&&source.globalChampion===null,'Unexpected source payload');
  const payload=structuredClone(source);payload.workers[0].state=structuredClone(cp.state);
  check(payload.workers.slice(1).every((w,i)=>same(w,source.workers[i+1])),'Other workers changed');
  const errors=[],engine=new DesktopEngine(path.join(root,'outputs'),()=>{},error=>errors.push(error.message));
  const oldRoot=path.join(root,'dist-landscape-v560/win-unpacked/resources/app'),oldEngine=new OldEngine(path.join(oldRoot,'outputs'),()=>{},()=>{});
  try{
    await engine.validateProgress(payload);
    let oldRejected=false;try{await oldEngine.validateProgress(payload);}catch(e){oldRejected=/ricompense incompatibile/i.test(e.message);}
    check(oldRejected,'Distributed 5.6.0 should reject this experimental revision');
    const encoded=await P.encode(payload,'5.6.0'),decoded=await P.decode(encoded,'5.6.0');
    await engine.restoreProgress(decoded.payload);const exported=await engine.exportProgress();
    check(engine.options.running===false&&engine.workers.length===5&&same(exported,payload)&&errors.length===0,'Paused desktop worker round-trip failed');
    check(sha(original)===expectedOriginal&&sha(copy)===expectedCopy,'Source save changed during verification');
    fs.mkdirSync(out,{recursive:false});const filename='SPERIMENTALE-solo-dev-v3-monza-gen'+cp.nextGeneration+'-worker0.malecns-save';
    const destination=path.join(out,filename);fs.writeFileSync(destination,encoded,{encoding:'utf8',flag:'wx',mode:0o600});
    const reread=await P.decode(fs.readFileSync(destination,'utf8'),'5.6.0');check(same(reread.payload,payload),'Export readback differs');
    const summary={passed:true,readyForRelease:false,appVersion:'5.6.0',model:'V3',circuit:'Monza',copyFile:filename,copySha256:sha(destination),
      originalSaveSha256:expectedOriginal,sourceCopySha256:expectedCopy,researchReportSha256:sha(reportFile),checkpointSha256:latest.sha256,
      generationsCompleted:report.generationsCompleted,worker0NextGeneration:cp.nextGeneration,otherWorkerGenerations:payload.workers.slice(1).map(w=>w.state.generation),
      populationPerWorker:cp.state.population,allFiveWorkersPreserved:true,unchangedOtherWorkers:true,pausedDesktopWorkerRoundTrip:true,published560Rejects:true,
      researchBestSafeProgressM:Math.max(...report.rows.map(r=>r.bestSafeProgressM??0)),researchMaxSafeLaps:Math.max(...report.rows.map(r=>r.maxSafeLaps)),
      runnerSha256:sha(__filename),boundary:'Experimental local source-app save, not a distributed 5.6.0 save. One worker evolved; other four are unchanged. Engine round-trip is not a native GUI test or proof of generalized learning.'};
    const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
    console.log('V3_NATURAL_SHAREABLE_COPY '+JSON.stringify({save:destination,sha256:summary.copySha256,report:file,reportSha256:sha(file),
      worker0NextGeneration:cp.nextGeneration,otherWorkerGenerations:summary.otherWorkerGenerations,bestSafeProgressM:summary.researchBestSafeProgressM,
      maxSafeLaps:summary.researchMaxSafeLaps,pausedDesktopWorkerRoundTrip:true,published560Rejects:true}));
  }finally{await engine.stop();await oldEngine.stop();}
}
main().catch(error=>{console.error('V3_NATURAL_SHAREABLE_COPY_FAILED '+(error.stack||error));process.exitCode=1;});
