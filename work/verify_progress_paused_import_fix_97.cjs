'use strict';
// Verify the actual saved five-worker session through real desktop workers:
// inspect while paused, resume briefly, then force one local generation to
// demonstrate that previously saved migrant genotypes are not discarded.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const file=path.join(base,'progress7-trained-copy-20261027-93/SPERIMENTALE-solo-dev-v3-monza-gen80-worker0.malecns-save');
const oldAudit=path.join(base,'progress7-paused-import-audit-20261027-96/report.json');
const out=path.join(base,'progress7-paused-import-fixed-20261027-97');
const P=require('../outputs/progress-save.js'),{DesktopEngine}=require('../desktop/engine.cjs');
const expected='616f3040487aed072e09cb1961e3b9c135925156ad199d9b44609ec89eba5fbb';
const auditHash='a6aa62122c29e83ca5f5d5c6adab1bf9b3411f0f48a901ebd35079ed7eb5edcc';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(x,m)=>{if(!x)throw Error(m);};
const hasGenome=(state,g)=>!g||state.genomes.some(v=>JSON.stringify(v)===JSON.stringify(g))||
  state.hallOfFame.some(v=>JSON.stringify(v.genome)===JSON.stringify(g))||
  (state.champion&&JSON.stringify(state.champion)===JSON.stringify(g))||
  (state.externalChampion&&JSON.stringify(state.externalChampion)===JSON.stringify(g));
async function main(){
  check(!fs.existsSync(out)&&sha(file)===expected&&sha(oldAudit)===auditHash,'Output or prior evidence mismatch');
  const previous=JSON.parse(fs.readFileSync(oldAudit,'utf8')),source=(await P.decode(fs.readFileSync(file,'utf8'),'5.6.0')).payload;
  check(previous.results.afterPausedInspect.workersWithUnretainedExternal.join(',')==='2,3,4','Expected reproduced regression');
  const paths=['desktop/engine.cjs','desktop/worker.cjs','outputs/simulation.js','outputs/progress-save.js'],hashes=()=>Object.fromEntries(paths.map(f=>[f,sha(path.join(root,f))]));
  const before=hashes(),errors=[],engine=new DesktopEngine(path.join(root,'outputs'),()=>{},e=>errors.push(e.message));
  try{
    await engine.restoreProgress(source);const immediate=await engine.exportProgress();check(hash(immediate)===hash(source),'Initial restore differs');
    await engine.command({type:'inspectAgent',value:0});await wait(500);const inspected=await engine.exportProgress();
    check(engine.options.running===false&&hash(inspected)===hash(source),'Paused inspection still changes the save state');
    await engine.command({type:'pause',value:true});let during=null;
    for(let i=0;i<30;i++){await wait(50);during=await engine.exportProgress();if(during.globalChampion)break;}
    check(Boolean(during?.globalChampion),'No global champion was discovered after resume');
    await engine.command({type:'pause',value:false});await wait(150);const paused=await engine.exportProgress();
    const retainedAfterResume=source.workers.map((w,i)=>hasGenome(paused.workers[i].state,w.state.externalChampion));
    check(retainedAfterResume.every(Boolean),'An original worker migrant disappeared on resume');
    const starts=paused.workers.map(w=>w.state.generation);await engine.command({type:'evolve'});let advanced=null;
    for(let i=0;i<80;i++){await wait(50);advanced=await engine.exportProgress();if(advanced.workers.every((w,j)=>w.state.generation===starts[j]+1))break;}
    check(advanced?.workers.every((w,j)=>w.state.generation===starts[j]+1),'Explicit one-generation check did not finish');
    const originalMigrantsInNewPopulation=source.workers.map((w,i)=>!w.state.externalChampion||
      advanced.workers[i].state.genomes.some(g=>JSON.stringify(g)===JSON.stringify(w.state.externalChampion)));
    check(originalMigrantsInNewPopulation.every(Boolean),'A saved migrant was not evaluated in the next population');
    check(errors.length===0&&sha(file)===expected&&JSON.stringify(before)===JSON.stringify(hashes()),'Save/source changed or worker error');
    const report={passed:true,appVersion:'5.6.0',experimentalSaveSha256:expected,priorAuditSha256:auditHash,runnerSha256:sha(__filename),
      sourceHashes:{before,after:hashes()},workers:source.workers.length,pausedInspectPreservedAllWorkerState:true,
      resumedGlobalChampionDiscovered:Boolean(during.globalChampion),retainedAfterResume,originalMigrantsInNewPopulation,
      beforeGenerations:starts,afterGenerations:advanced.workers.map(w=>w.state.generation),workerErrors:errors,
      boundary:'Real local desktop workers, one supplied experimental save. A short resume and a deliberately forced generation check preservation, not learning or full laps. Original file is read only. GUI and packages need separate verification.'};
    fs.mkdirSync(out,{recursive:false});const result=path.join(out,'report.json');fs.writeFileSync(result,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('PAUSED_IMPORT_FIX_VERIFIED '+JSON.stringify({report:result,sha256:sha(result),workers:report.workers,
      pausedInspectPreservedAllWorkerState:true,retainedAfterResume,originalMigrantsInNewPopulation,beforeGenerations:starts,afterGenerations:report.afterGenerations}));
  }finally{await engine.stop();}
}
main().catch(error=>{console.error('PAUSED_IMPORT_FIX_VERIFY_FAILED '+(error.stack||error));process.exitCode=1;});
