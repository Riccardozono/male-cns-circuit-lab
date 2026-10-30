'use strict';
// Exercise a real five-worker save while a shared champion is waiting behind
// a previously saved migrant. Save/reload is in memory; source file is read only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base=path.join(root,'.impeccable/review/learning-ml');
const file=path.join(base,'progress7-trained-copy-20261027-93/SPERIMENTALE-solo-dev-v3-monza-gen80-worker0.malecns-save');
const out=path.join(base,'progress7-pending-champion-roundtrip-20261027-99');
const P=require('../outputs/progress-save.js'),{DesktopEngine}=require('../desktop/engine.cjs');
const expected='616f3040487aed072e09cb1961e3b9c135925156ad199d9b44609ec89eba5fbb';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(x,m)=>{if(!x)throw Error(m);};
const normalized=p=>{const a=structuredClone(p);for(const w of a.workers)w.state.elapsedAtSave=0;return a;};
async function main(){
  check(!fs.existsSync(out)&&sha(file)===expected,'New output and exact saved session required');
  const source=(await P.decode(fs.readFileSync(file,'utf8'),'5.6.0')).payload;
  check(source.workers.length===5&&source.globalChampion===null,'Unexpected input state');
  const files=['desktop/engine.cjs','desktop/worker.cjs','outputs/simulation.js','outputs/progress-save.js'],hashes=()=>Object.fromEntries(files.map(f=>[f,sha(path.join(root,f))]));
  const before=hashes(),errors=[],engine=new DesktopEngine(path.join(root,'outputs'),()=>{},e=>errors.push(e.message));
  try{
    await engine.restoreProgress(source);await engine.command({type:'pause',value:true});let saved=null;
    for(let i=0;i<40;i++){await wait(50);saved=await engine.exportProgress();if(saved.globalChampion)break;}
    check(Boolean(saved?.globalChampion),'Global champion was not established');
    await engine.command({type:'pause',value:false});await wait(200);saved=await engine.exportProgress();
    check(saved.globalChampion&&saved.workers.slice(1).every((w,i)=>hash(w.state.externalChampion)===hash(source.workers[i+1].state.externalChampion)),
      'Saved migrants changed before round-trip');
    const wire=await P.encode(saved,'5.6.0'),decoded=await P.decode(wire,'5.6.0');await engine.restoreProgress(decoded.payload);
    await engine.command({type:'inspectAgent',value:0});await wait(400);const inspected=await engine.exportProgress();
    check(hash(normalized(inspected))===hash(normalized(saved)),'Paused observation changed reloaded save');
    await engine.command({type:'pause',value:true});await wait(200);await engine.command({type:'pause',value:false});await wait(200);
    const resumed=await engine.exportProgress();check(Boolean(resumed.globalChampion),'Global champion vanished on resume');
    const retained=resumed.workers.map((w,i)=>!source.workers[i].state.externalChampion||
      hash(w.state.externalChampion)===hash(source.workers[i].state.externalChampion));
    check(retained.every(Boolean),'A saved migrant was overwritten during queued-champion reconstruction');
    const starts=resumed.workers.map(w=>w.state.generation);await engine.command({type:'evolve'});let advanced=null;
    for(let i=0;i<80;i++){await wait(50);advanced=await engine.exportProgress();if(advanced.workers.every((w,j)=>w.state.generation===starts[j]+1))break;}
    check(advanced?.workers.every((w,j)=>w.state.generation===starts[j]+1),'Forced preservation generation did not finish');
    const evaluated=advanced.workers.map((w,i)=>!source.workers[i].state.externalChampion||
      w.state.genomes.some(g=>hash(g)===hash(source.workers[i].state.externalChampion)));
    check(evaluated.every(Boolean),'A previously saved migrant missed the next population');
    check(errors.length===0&&sha(file)===expected&&JSON.stringify(before)===JSON.stringify(hashes()),'Save/source changed or worker error');
    const result={passed:true,appVersion:'5.6.0',experimentalSaveSha256:expected,runnerSha256:sha(__filename),sourceHashes:{before,after:hashes()},
      workers:5,globalChampionSurvivesWireRoundtrip:true,pausedInspectionUnchanged:true,originalMigrantsRetainedAfterReload:retained,
      originalMigrantsInNextPopulation:evaluated,beforeGenerations:starts,afterGenerations:advanced.workers.map(w=>w.state.generation),
      boundary:'Real desktop workers, one actual experimental save and an in-memory encode/decode round-trip. Forced evolution verifies state preservation, not lap learning or a packaged release.'};
    fs.mkdirSync(out,{recursive:false});const report=path.join(out,'report.json');fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log('PENDING_CHAMPION_ROUNDTRIP '+JSON.stringify({report,sha256:sha(report),retained,evaluated,beforeGenerations:starts,afterGenerations:result.afterGenerations}));
  }finally{await engine.stop();}
}
main().catch(error=>{console.error('PENDING_CHAMPION_ROUNDTRIP_FAILED '+(error.stack||error));process.exitCode=1;});
