'use strict';
// The original historical save is read only. Confirm an actual paused
// five-worker restore plus inspection preserves every saved worker and record.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const out=path.join(root,'.impeccable/review/learning-ml/progress3-paused-inspection-20261027-102');
const P=require('../outputs/progress-save.js'),{DesktopEngine}=require('../desktop/engine.cjs');
const expected='29ef7627ffdc4971b0a7a0bb11d65f4fe771d93541a48e7e41f0fbcb015943e3';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const normalize=p=>{const copy=structuredClone(p);for(const w of copy.workers)w.state.elapsedAtSave=0;return copy;};
async function main(){
  if(fs.existsSync(out)||sha(file)!==expected)throw Error('New output and exact original save required');
  const input=(await P.decode(fs.readFileSync(file,'utf8'),'5.6.0')).payload;
  if(input.modelId!=='v3'||input.circuitId!=='monza'||input.workers.length!==5||!input.workers.every(w=>w.state.rewardRevision==='progress-3'))throw Error('Unexpected original payload');
  const files=['desktop/engine.cjs','desktop/worker.cjs','outputs/simulation.js','outputs/progress-save.js'],hashes=()=>Object.fromEntries(files.map(f=>[f,sha(path.join(root,f))]));
  const before=hashes(),errors=[],engine=new DesktopEngine(path.join(root,'outputs'),()=>{},e=>errors.push(e.message));
  try{
    await engine.restoreProgress(input);await engine.command({type:'inspectAgent',value:0});await wait(500);const result=await engine.exportProgress();
    if(engine.options.running!==false||hash(normalize(result))!==hash(normalize(input))||errors.length||sha(file)!==expected||JSON.stringify(before)!==JSON.stringify(hashes()))
      throw Error('Historical paused restore/inspection did not preserve state');
    const report={passed:true,appVersion:'5.6.0',originalSaveSha256:expected,runnerSha256:sha(__filename),sourceHashes:{before,after:hashes()},
      model:'V3',circuit:'Monza',rewardRevision:'progress-3',workers:5,paused:true,allWorkerStatesAndGlobalRecordPreserved:true,
      generations:input.workers.map(w=>w.state.generation),workerErrors:errors,
      boundary:'Real paused desktop workers and inspection of the original save, not a GUI run, training replay or release verification. The source file is read only.'};
    fs.mkdirSync(out,{recursive:false});const resultFile=path.join(out,'report.json');fs.writeFileSync(resultFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('LEGACY_PAUSED_SAVE_VERIFIED '+JSON.stringify({report:resultFile,sha256:sha(resultFile),workers:5,generations:report.generations,paused:true}));
  }finally{await engine.stop();}
}
main().catch(e=>{console.error('LEGACY_PAUSED_SAVE_VERIFY_FAILED '+(e.stack||e));process.exitCode=1;});
