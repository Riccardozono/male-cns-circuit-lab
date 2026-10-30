'use strict';
// Isolated benchmark of the shipped state-head archive mutation strategy.
// The verified parent/save stay read-only; unsafe frontier parents may only
// seed exploratory offspring and can never replace the clean champion.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Model=require('./neural-statehead-cuda-model.cjs');
const {Coordinator}=require('./neural-statehead-cuda-coordinator.cjs');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'');
const generations=Number(process.argv.find(a=>a.startsWith('--generations='))?.slice(14)||'3');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function hashFile(file){return sha(await fs.readFile(path.join(root,file)));}
async function main(){
  if(process.versions.node!=='24.19.0')throw Error('Pinned Node 24.19.0 runtime required');
  if(!output||await fs.stat(output).then(()=>true,()=>false)||!Number.isInteger(generations)||generations<1||generations>6)throw Error('New output path and 1–6 complete generations required');
  const sourceFiles=['work/benchmark-statehead-archive-frontier.cjs','work/neural-statehead-cuda-coordinator.cjs','work/neural-statehead-cuda-archive.cjs','work/neural-statehead-cuda-arena.cjs','work/neural-statehead-cuda-worker.cjs'];
  const sourceHashesAtStart=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,await hashFile(file)])));
  const selected=Model.defaultChoice(),loaded=Model.load(selected.file),modelSha=sha(await fs.readFile(selected.file)),saveFile='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',saveSha=await fs.readFile(saveFile).then(sha,()=>null);
  if(modelSha!==selected.modelSha256)throw Error('Protected clean parent checksum mismatch');
  const coordinator=new Coordinator({modelFile:selected.file,population:16,mutation:.16,speedMultiplier:30,workers:4});
  const records=[];let timer=null,reason='error',error=null,resolving=false;
  const done=new Promise((resolve,reject)=>{
    coordinator.on('error',e=>{if(!resolving){resolving=true;reject(e);}});
    coordinator.on('snapshot',()=>{
      while(!resolving&&coordinator.history.length>records.length){
        const h=coordinator.history[records.length],results=coordinator.lastCompletedResults;
        if(!results||results.length!==16||results.some(r=>!r.complete||r.censored||r.overlap)){resolving=true;reject(Error('Coordinator published incomplete or unsafe-by-format generation'));return;}
        const resultRows=structuredClone(results),clean=resultRows.filter(r=>!['urto','fuori pista','progresso non valido'].includes(r.reason));
        const archive=coordinator.archive.snapshot(),champion=archive.champion;
        records.push({history:structuredClone(h),results:resultRows,archive:{evaluations:archive.evaluations,cells:archive.cells.length,cleanCells:archive.cells.filter(r=>!['urto','fuori pista','progresso non valido'].includes(r.reason)).length,unsafeCells:archive.cells.filter(r=>['urto','fuori pista','progresso non valido'].includes(r.reason)).length,champion:structuredClone(champion)},generationStats:{cleanCount:clean.length,unsafeCounts:resultRows.reduce((a,r)=>(a[r.reason]=(a[r.reason]||0)+1,a),{}),furthest:resultRows.slice().sort((a,b)=>b.progress-a.progress).slice(0,5).map(r=>({id:r.id,progress:r.progress,laps:r.laps,reason:r.reason,fitness:r.fitness}))}});
        console.log('STATEHEAD_ARCHIVE_GENERATION '+JSON.stringify({generation:h.generation,bestProgress:h.bestProgress,meanProgress:h.meanProgress,maxLaps:h.maxLaps,championProgress:champion.progress,championLaps:champion.laps,cells:archive.cells.length,cleanCells:records.at(-1).archive.cleanCells,unsafeCells:records.at(-1).archive.unsafeCells,unsafeCounts:records.at(-1).generationStats.unsafeCounts,furthest:records.at(-1).generationStats.furthest}));
        if(records.length>=generations){resolving=true;resolve('completed');}
      }
    });
  });
  const wallGuard=new Promise(resolve=>{timer=setTimeout(()=>{if(!resolving){resolving=true;resolve('wall-guard-censored');}},18*60*1000);});
  try{await coordinator.start();await coordinator.pause(true);reason=await Promise.race([done,wallGuard]);}
  catch(e){reason='error';error=e.stack||String(e);}
  finally{clearTimeout(timer);if(coordinator.running)await coordinator.pause(false).catch(()=>{});}
  const final=coordinator.snapshot(),cuda=coordinator.workers.reduce((a,w)=>({workers:a.workers+1,gpuCalls:a.gpuCalls+(w.cuda?.gpuCalls||0),cpuFallbacks:a.cpuFallbacks+(w.cuda?.cpuFallbacks||0)}),{workers:0,gpuCalls:0,cpuFallbacks:0});
  const archive=coordinator.archive.snapshot(),modelUnchanged=sha(await fs.readFile(selected.file))===modelSha,saveUnchanged=saveSha===null?null:sha(await fs.readFile(saveFile))===saveSha;
  const sourceHashesAtEnd=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,await hashFile(file)])));
  const report={format:'male-cns-statehead-archive-frontier-benchmark-v1',appVersion:'5.6.0',settings:{model:'verified V3 state-head / Monza',modelFile:selected.file,modelSha256:modelSha,population:16,mutation:.16,speedMultiplier:30,workers:4,requestedGenerations:generations,optimizer:'existing archive with clean champion protection and up to 25% antithetic mutations from unsafe frontier'},method:'Every candidate begins naturally from the start line under the connectome policy and real vehicle physics. Archive records safe/unsafe outcomes separately; collision candidates can parent exploratory mutations but cannot be the protected champion. No route, teacher action, user save, model file, app version or release is modified.',baseline:selected.expected,reason,error,complete:reason==='completed'&&records.length===generations,generations:records,final:{history:final.history,generation:final.generation,updates:final.learningStats.updates,episodes:final.learningStats.episodes,archiveCells:final.experiment.archiveCells,gpu:cuda},archive,modelUnchanged,userSave:{path:saveFile,sha256:saveSha,unchanged:saveUnchanged},sourceHashesAtStart,sourceHashesAtEnd,boundary:'A short single-seed search can identify an archive-learning signal, not establish two-lap convergence or generalization. Any candidate still requires independent exact replay before promotion.'};
  await fs.mkdir(output,{recursive:false});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  await coordinator.close();Model.closeCuda();
  console.log('STATEHEAD_ARCHIVE_REPORT '+JSON.stringify({complete:report.complete,reason,generations:records.length,champion:{progress:archive.champion.progress,laps:archive.champion.laps,reason:archive.champion.reason},archiveCells:archive.cells.length,modelUnchanged,saveUnchanged,gpu:cuda,output:path.join(output,'report.json')}));
  if(!report.complete)process.exitCode=2;
}
main().catch(error=>{console.error(error.stack||String(error));Model.closeCuda();process.exitCode=1;});
