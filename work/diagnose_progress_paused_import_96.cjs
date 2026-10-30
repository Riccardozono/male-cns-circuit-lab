'use strict';
// Isolate the UI's paused inspect command after restoring the experimental
// five-worker save. Record structural differences without printing genomes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const file=path.join(base,'progress7-trained-copy-20261027-93/SPERIMENTALE-solo-dev-v3-monza-gen80-worker0.malecns-save');
const out=path.join(base,'progress7-paused-import-audit-20261027-96');
const P=require('../outputs/progress-save.js'),{DesktopEngine}=require('../desktop/engine.cjs');
const expected='616f3040487aed072e09cb1961e3b9c135925156ad199d9b44609ec89eba5fbb';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),shaObj=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),check=(x,m)=>{if(!x)throw Error(m);};
function summary(expectedState,observed){
  const workers=expectedState.workers.map((w,i)=>{
    const actual=observed.workers[i].state,prior=w.state,external=prior.externalChampion,key=external&&JSON.stringify(external);
    const retained=!external||actual.genomes.some(g=>JSON.stringify(g)===key)||actual.hallOfFame.some(a=>JSON.stringify(a.genome)===key)||
      (actual.champion&&JSON.stringify(actual.champion)===key)||(actual.externalChampion&&JSON.stringify(actual.externalChampion)===key);
    return {index:i,generationBefore:prior.generation,generationAfter:actual.generation,
      genomePopulationUnchanged:shaObj(prior.genomes)===shaObj(actual.genomes),optimizerUnchanged:shaObj(prior.optimizer)===shaObj(actual.optimizer),
      historyUnchanged:shaObj(prior.history)===shaObj(actual.history),externalPresentBefore:Boolean(external),
      externalChanged:shaObj(prior.externalChampion)!==shaObj(actual.externalChampion),originalExternalRetainedInWorker:Boolean(retained)};
  });
  return {payloadMatches:shaObj(expectedState)===shaObj(observed),globalChampionBefore:expectedState.globalChampion!==null,
    globalChampionAfter:observed.globalChampion!==null,workers,workersWithUnretainedExternal:workers.filter(w=>!w.originalExternalRetainedInWorker).map(w=>w.index)};
}
async function main(){
  check(!fs.existsSync(out)&&sha(file)===expected,'New output and exact experimental save required');
  const payload=(await P.decode(fs.readFileSync(file,'utf8'),'5.6.0')).payload,errors=[];
  const files=['desktop/engine.cjs','desktop/worker.cjs','outputs/simulation.js','outputs/progress-save.js'],before=Object.fromEntries(files.map(p=>[p,sha(path.join(root,p))]));
  const engine=new DesktopEngine(path.join(root,'outputs'),()=>{},e=>errors.push(e.message));
  try{
    await engine.restoreProgress(payload);const immediate=await engine.exportProgress();
    await engine.command({type:'inspectAgent',value:0});await wait(500);const inspected=await engine.exportProgress();
    await wait(500);const settled=await engine.exportProgress();
    const after=Object.fromEntries(files.map(p=>[p,sha(path.join(root,p))]));
    check(sha(file)===expected&&JSON.stringify(before)===JSON.stringify(after)&&errors.length===0,'Save, sources or worker errors changed');
    const results={immediate:summary(payload,immediate),afterPausedInspect:summary(payload,inspected),settled:summary(payload,settled)};
    const report={passed:true,appVersion:'5.6.0',experimentalSaveSha256:expected,runnerSha256:sha(__filename),sourceHashes:{before,after},
      paused:engine.options.running===false,workerCount:engine.workers.length,results,
      boundary:'Separate paused source desktop-engine instance and real worker messages; no save is written. This diagnostic isolates the inspect command but does not itself fix or prove all UI paths.'};
    fs.mkdirSync(out,{recursive:false});const destination=path.join(out,'report.json');fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('PAUSED_IMPORT_AUDIT '+JSON.stringify({report:destination,sha256:sha(destination),paused:report.paused,results}));
  }finally{await engine.stop();}
}
main().catch(error=>{console.error('PAUSED_IMPORT_AUDIT_FAILED '+(error.stack||error));process.exitCode=1;});
