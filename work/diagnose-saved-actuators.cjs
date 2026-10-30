'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),appRoot=path.join(root,'dist-first-person-dev-560/win-unpacked/resources/app');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const output=path.join(root,'.impeccable/review/actuators-v3-save-gen64');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const protectedNames=['outputs/simulation.js','outputs/neural-learning.js','outputs/rewards.js','outputs/vehicle-992.js','outputs/progress-save.js','outputs/desktop-runtime.js','outputs/desktop-state.js','outputs/app.js','outputs/model-profiles.js','outputs/legacy-models.js','outputs/data/connectome-full.bin','outputs/data/connectome-full.json','outputs/data/connectome.json','outputs/data/circuits.json','desktop/engine.cjs','desktop/worker.cjs','desktop/main.cjs','package.json'];
const files=[savePath,...protectedNames.flatMap(file=>[path.join(root,file),path.join(appRoot,file)])];
if(!process.versions.electron){
  fs.mkdirSync(output,{recursive:true});const {spawn}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'malecns-saved-actuator-diagnostic-'));
  const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[__filename,'--model-benchmark','--user-data-dir='+profile],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(fs.createWriteStream(path.join(output,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(output,'stderr.log')));
  child.stdout.on('data',b=>process.stdout.write(b));
  const guard=setTimeout(()=>{console.error('Disposable saved-policy diagnostic reached wall guard');child.kill();},240000);
  child.once('error',e=>{clearTimeout(guard);console.error(e);process.exitCode=1;});
  child.once('exit',code=>{clearTimeout(guard);console.log('SAVED_ACTUATOR_EXIT '+code);process.exitCode=code===0?0:1;});
}else{
  const {app}=require('electron'),before=Object.fromEntries(files.map(f=>[f,hash(f)]));
  const profile=process.argv.find(x=>x.startsWith('--user-data-dir='))?.slice(16);if(!profile)throw Error('Disposable profile required');
  app.setAppPath(appRoot);app.setPath('userData',profile);
  const reports=new Map(),threads=require('node:worker_threads'),OriginalWorker=threads.Worker;
  threads.Worker=class extends OriginalWorker{
    constructor(file,options){
      const saved=options?.workerData?.progressState,own=saved&&path.resolve(file)===path.join(appRoot,'desktop/worker.cjs');
      super(own?path.join(__dirname,'saved-actuator-probe-worker.cjs'):file,own?{...options,workerData:{...options.workerData,savedDiagnosticOriginalWorker:file}}:options);
      if(own)this.on('message',m=>{if(m.type==='saved-actuator-report'){reports.set(m.workerIndex,m);fs.writeFileSync(path.join(output,'worker-'+m.workerIndex+'.json'),JSON.stringify(m,null,2));}});
    }
  };
  const engineModule=require(path.join(appRoot,'desktop/engine.cjs')),OriginalEngine=engineModule.DesktopEngine,instances=[];
  engineModule.DesktopEngine=class extends OriginalEngine{constructor(...args){super(...args);instances.push(this);}start(options,restored){return super.start({...options,workerCount:1,running:false},restored);}};
  const harness=require(path.join(appRoot,'desktop/model-benchmark.cjs'));
  harness.run=async window=>{
    const wc=window.webContents,errors=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),js=code=>wc.executeJavaScript(code,true);
    wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
    const until=async(fn,label,limit=45000)=>{const start=performance.now();while(!await fn()){if(performance.now()-start>limit)throw Error('Diagnostic timeout '+label);await wait(80);}};
    await until(()=>js('Boolean(globalThis.circuitLab?.sim?.engine&&!document.querySelector("main").inert)'),'startup');
    const Progress=require(path.join(appRoot,'outputs/progress-save.js')),file=await Progress.decode(fs.readFileSync(savePath,'utf8'),'5.6.0'),engine=instances[0];
    await engine.validateProgress(file.payload);
    const summary={appVersion:file.appVersion,modelId:file.payload.modelId,circuitId:file.payload.circuitId,graph:file.payload.graph,vehicleRevision:file.payload.vehicleRevision,
      fileSha256:before[savePath],globalChampion:file.payload.globalChampion?.stats,globalChampionWorker:file.payload.globalChampion?.workerIndex,
      workers:file.payload.workers.map(w=>({index:w.index,generation:w.state.generation,elapsedAtSave:w.state.elapsedAtSave,population:w.state.population,
        mutation:w.state.mutation,speedMultiplier:w.state.speedMultiplier,seed:w.state.seed,stagnation:w.state.stagnation,learningFrontier:w.state.learningFrontier,
        championStats:w.state.championStats,updates:w.state.optimizer.updates,episodes:w.state.optimizer.episodes,
        history:w.state.history.map(h=>({generation:h.generation,best:h.best,baseBest:h.baseBest,bestProgress:h.bestProgress,meanProgress:h.meanProgress,laps:h.laps,maxLaps:h.maxLaps,bestLapTime:h.bestLapTime,stagnation:h.stagnation}))}))};
    fs.writeFileSync(path.join(output,'save-summary.json'),JSON.stringify(summary,null,2));
    console.log('SAVE_VALIDATED '+JSON.stringify({model:summary.modelId,workers:summary.workers.map(w=>({index:w.index,generation:w.generation,population:w.population,stagnation:w.stagnation})),fileSha256:summary.fileSha256}));
    await js('document.getElementById("circuit-view").hidden=true;document.getElementById("brain-view").hidden=true');
    await js('document.getElementById("controller-select").value="v3";document.getElementById("controller-select").dispatchEvent(new Event("change",{bubbles:true}))');
    await until(()=>js('circuitLab.sim.modelId==="v3"&&!document.getElementById("controller-select").disabled'),'V3 model');
    await engine.restoreProgress(file.payload,engine.options.rendererToken);await js('circuitLab.sim.reconnect()');
    const initial=await engine.exportProgress();
    const exactRestore=initial.workers.every((w,i)=>{
      const a={...w.state,elapsedAtSave:0},b={...file.payload.workers[i].state,elapsedAtSave:0};return JSON.stringify(a)===JSON.stringify(b);
    });
    if(!exactRestore)throw Error('Restored training state is not identical excluding documented elapsed reset');
    const started=performance.now();await js('circuitLab.sim.running=true');await engine.command({type:'pause',value:true});
    let lastLog=started;
    while(performance.now()-started<180000){
      if(reports.size===file.payload.workers.length&&[...reports.values()].every(r=>r.complete))break;
      if(performance.now()-lastLog>12000){lastLog=performance.now();console.log('SAVED_ROLLOUT_PROGRESS '+JSON.stringify([...reports.values()].map(r=>({index:r.workerIndex,elapsed:r.elapsed,complete:r.complete,...r.stats}))));}
      await wait(200);
    }
    await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});
    for(const worker of engine.workers)worker.postMessage({type:'saved-actuator-flush'});await wait(350);
    const cases=[...reports.values()].sort((a,b)=>a.workerIndex-b.workerIndex);
    const unchanged=files.every(f=>hash(f)===before[f]);
    const report={passed:unchanged&&exactRestore&&!errors.length&&cases.length===file.payload.workers.length&&cases.every(c=>c.complete&&c.optimizerUnchanged&&c.genomesUnchanged&&c.stats.overlapTicks===0),
      bundle:appRoot,wallSeconds:(performance.now()-started)/1000,configuration:{restoredSettings:true,workerCount:file.payload.workers.length,maxWallSeconds:180},
      summary,exactRestoreExcludingElapsed:true,cases,sourceAndSaveUnchanged:unchanged,sourceSha256:before,consoleErrors:errors,
      boundary:'The actual Windows development bundle restores all saved workers using unchanged native decode/validate/restore. Same saved genomes, random states, optimizer and settings. Replays start at the start line with reset physical/neural states, as a normal import does; they do not reproduce the saved onscreen instant. Each saved generation is observed per physics tick, then the isolated worker stops before creating or learning another generation. No user profile, original save, distributed build, physics, rewards or anatomy changed. Reports contain no genome weights.'};
    fs.writeFileSync(path.join(output,'diagnosis.json'),JSON.stringify(report,null,2));
    console.log('SAVED_ACTUATOR_DONE '+JSON.stringify({passed:report.passed,unchanged,exactRestore,wallSeconds:report.wallSeconds,
      cases:cases.map(c=>({index:c.workerIndex,generation:c.generation,complete:c.complete,...c.stats,optimizerUnchanged:c.optimizerUnchanged,genomesUnchanged:c.genomesUnchanged}))}));
    return report;
  };
  require(path.join(appRoot,'desktop/main.cjs'));
}
