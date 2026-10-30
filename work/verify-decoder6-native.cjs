'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),appRoot=path.join(root,'dist-decoder6-dev-560/win-unpacked/resources/app');
const output=path.join(root,'.impeccable/review/decoder6/native'),original='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save',
  migrated=path.join(root,'.impeccable/review/decoder6/migration/Circuit-Lab-5.6.0-v3-decoder6-monza-gen64.malecns-save');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(!process.versions.electron){
  fs.mkdirSync(output,{recursive:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'malecns-decoder6-native-'));
  const child=require('node:child_process').spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[__filename,'--model-benchmark','--user-data-dir='+profile],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(fs.createWriteStream(path.join(output,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(output,'stderr.log')));child.stdout.on('data',b=>process.stdout.write(b));
  const guard=setTimeout(()=>{console.error('Only disposable decoder6 native check reached its wall guard');child.kill();},240000);
  child.once('error',e=>{clearTimeout(guard);console.error(e.stack);process.exitCode=1;});child.once('exit',code=>{clearTimeout(guard);console.log('NATIVE_DECODER6_EXIT '+code);process.exitCode=code===0?0:1;});
}else{
  const {app}=require('electron'),sourceHash=hash(original),migratedHash=hash(migrated),proofs=new Map();
  const profile=process.argv.find(a=>a.startsWith('--user-data-dir='))?.slice(16);if(!profile)throw Error('Disposable profile required');app.setAppPath(appRoot);app.setPath('userData',profile);
  // A script entry point reports Electron's version by default. The real
  // packaged executable gets its application version from this exact file.
  app.setVersion(JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8')).version);
  const threads=require('node:worker_threads'),OriginalWorker=threads.Worker;
  threads.Worker=class extends OriginalWorker{
    constructor(file,options){
      const own=options?.workerData&&path.resolve(file)===path.join(appRoot,'desktop/worker.cjs');
      super(own?path.join(__dirname,'learning-native-observer.cjs'):file,own?{...options,workerData:{...options.workerData,nativeLearningOriginalWorker:file}}:options);
      if(own)this.on('message',m=>{if(m.type==='learning-cache-proof')proofs.set(m.modelId+':'+m.workerIndex,m);});
    }
  };
  const moduleEngine=require(path.join(appRoot,'desktop/engine.cjs')),OriginalEngine=moduleEngine.DesktopEngine,instances=[];
  moduleEngine.DesktopEngine=class extends OriginalEngine{
    constructor(...args){super(...args);instances.push(this);}
    start(options,request){return super.start({...options,workerCount:1,running:false},request);}
  };
  require(path.join(appRoot,'desktop/model-benchmark.cjs')).run=async window=>{
    const wc=window.webContents,js=code=>wc.executeJavaScript(code,true),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],errors=[];
    const check=(name,passed,detail=null)=>{checks.push({name,passed:!!passed,detail});if(!passed)throw Error(name+' '+JSON.stringify(detail));};
    const until=async(fn,label)=>{const start=performance.now();while(!await fn()){if(performance.now()-start>55000)throw Error('Timeout '+label);await wait(80);}};
    wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
    await until(()=>js('Boolean(globalThis.circuitLab?.sim?.engine&&!document.querySelector("main").inert)'),'startup');
    const engine=instances[0],F=require(path.join(appRoot,'outputs/simulation.js')),P=require(path.join(appRoot,'outputs/progress-save.js'));
    check('App version remains 5.6.0',await js('circuitLab.version')==='5.6.0');
    check('Starts paused on experimental V3 and Monza',await js('circuitLab.sim.modelId==="v3"&&circuitLab.sim.circuitId==="monza"&&!circuitLab.sim.running'));
    check('Experimental warning is present and linked to the selector',await js('document.getElementById("experimental-decoder-note").textContent.includes("Miglioramento non ancora dimostrato")&&document.getElementById("controller-select").getAttribute("aria-describedby").includes("experimental-decoder-note")'));
    const graph=await engine.progressGraph('v3');
    check('Native V3 is decoder6 with the unchanged real anatomy',graph.learning.version===6&&graph.learning.length===394&&graph.learning.nodes.length===64&&graph.n===7721&&graph.edgeCount===242486);
    const before=await engine.exportProgress(),oldFile=await P.decode(fs.readFileSync(original,'utf8'),'5.6.0');
    const refusal=await js('(async()=>{try{await importProgress('+JSON.stringify(oldFile)+',"original-read-only");return "accepted";}catch(e){return e.message;}})()');
    check('Normal V3 save is rejected explicitly',refusal.includes('incompatibili'),refusal);
    check('Rejected original import cannot replace the current trial',JSON.stringify(await engine.exportProgress())===JSON.stringify(before));
    const newFile=await P.decode(fs.readFileSync(migrated,'utf8'),'5.6.0');
    await js('importProgress('+JSON.stringify(newFile)+','+JSON.stringify(path.basename(migrated))+')');
    const restored=await engine.exportProgress();
    check('Migrated save restores all five real workers',restored.workers.length===5);
    check('Migrated training restores exactly except the documented episode-time reset',restored.workers.every((w,i)=>JSON.stringify({...w.state,elapsedAtSave:0})===JSON.stringify({...newFile.payload.workers[i].state,elapsedAtSave:0})));
    check('History alone is clear; learned episode/update counters remain',restored.workers.every((w,i)=>w.state.history.length===0&&w.state.generation===newFile.payload.workers[i].state.generation&&w.state.optimizer.updates===newFile.payload.workers[i].state.optimizer.updates&&w.state.optimizer.episodes===newFile.payload.workers[i].state.optimizer.episodes));
    check('New filename distinguishes the incompatible decoder',P.filename(restored,'5.6.0').includes('-v3-decoder6-monza-'));
    const text=await P.encode(restored,'5.6.0'),roundtrip=await P.decode(text,'5.6.0');P.validatePayload(roundtrip.payload,{graph,circuits:(await engine.loadBundle('v3')).circuits});
    check('Strict shareable-save round trip is exact',JSON.stringify(restored)===JSON.stringify(roundtrip.payload));
    const oldP=require('../outputs/progress-save.js'),oldF=require('../outputs/simulation.js'),oldLegacy=require('../outputs/legacy-models.js'),oldGraph=oldF.compileGraph(oldLegacy.tagV3(require('../outputs/data/connectome.json')));
    let oldReject=false;try{oldP.validatePayload(roundtrip.payload,{graph:oldGraph,circuits:(await engine.loadBundle('v3')).circuits});}catch(e){oldReject=e.message.includes('incompatibili');}
    check('Normal app refuses experimental output saves',oldReject);
    const stateBeforeVisual=await engine.exportProgress();
    window.setSize(1440,1000);await wait(450);await wc.capturePage().then(img=>fs.writeFileSync(path.join(output,'desktop-light.png'),img.toPNG()));
    await js('document.getElementById("theme-toggle").click()');window.setSize(960,800);await wait(450);await wc.capturePage().then(img=>fs.writeFileSync(path.join(output,'narrow-dark.png'),img.toPNG()));
    check('Labels reflow without page overflow',await js('document.documentElement.scrollWidth<=innerWidth+2'));
    check('Theme and resizing do not advance training or change saved state',JSON.stringify(stateBeforeVisual)===JSON.stringify(await engine.exportProgress()));
    const cases=[];
    for(const modelId of ['v3','v2','v4','v5']){
      if(await js('circuitLab.sim.modelId')!==modelId){await js('document.getElementById("controller-select").value='+JSON.stringify(modelId)+';document.getElementById("controller-select").dispatchEvent(new Event("change",{bubbles:true}))');await until(()=>js('circuitLab.sim.modelId==='+JSON.stringify(modelId)+'&&!document.getElementById("controller-select").disabled'),'model '+modelId);}
      await engine.start({modelId,circuitId:'monza',population:4,mutation:0,speedMultiplier:30,mode:'connectome',running:false,rendererToken:engine.options.rendererToken});await js('circuitLab.sim.reconnect()');
      await js('circuitLab.sim.running=true');await engine.command({type:'pause',value:true});await wait(1500);await engine.command({type:'pause',value:false});await js('circuitLab.sim.running=false');
      engine.workers[0].postMessage({type:'observe-learning-cache'});await until(()=>proofs.has(modelId+':0'),'observed activity '+modelId);
      const proof=proofs.get(modelId+':0'),g=await engine.progressGraph(modelId),p=F.ensureLearning(g),brain={activity:new Float32Array(g.n)};brain.activity[p.nodes[0]]=.1;
      const commands=bias=>{const weights=p.mean.slice();weights[weights.length-1]=bias;return F.neuralOutputsFromBrain(g,brain,{adapterVersion:p.version,policyWeights:weights});};
      const gas=commands(1.5),brake=commands(-1.5);check(modelId+' actual observed neural control and exclusive finite pedals',proof.observedAgents>0&&proof.finite&&!proof.overlap,proof);
      check(modelId+' gas and brake are correctly separated',gas[1]>.9&&gas[2]===0&&brake[1]===0&&brake[2]>.9);
      brain.activity.fill(0);check(modelId+' silent anatomical activity cannot drive',commands(1.5).every(v=>v===0));
      if(['v4','v5'].includes(modelId))check(modelId+' actual GPU is active',engine.gpu.state==='active',engine.gpu);
      cases.push({modelId,parameters:p.length,policyVersion:p.version,proof,gpu:{...engine.gpu},decoderFixture:{gas,brake}});
    }
    check('Original save is unchanged',hash(original)===sourceHash);check('Migrated copy is unchanged',hash(migrated)===migratedHash);check('No renderer console errors',!errors.length,errors);
    const report={passed:checks.every(c=>c.passed),checks,cases,sourceSha256:sourceHash,migratedSha256:migratedHash,appVersion:'5.6.0',electronVersion:process.versions.electron,appRoot,profile,consoleErrors:errors,
      boundary:'Isolated native renderer and worker integration using the packaged development app code with the exact packaged Electron runtime. Real five-worker migration import/strict round trip and real CPU/GPU control; decoder fixtures are separate. UI photographs are actual paused training state. No general convergence, faster learning, FPS or validated biological/vehicle claims. Original profile/save/release are not touched.'};
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log('NATIVE_DECODER6_DONE '+JSON.stringify({passed:report.passed,checks:checks.length,cases:cases.map(c=>({model:c.modelId,policy:c.policyVersion,gpu:c.gpu.state})),errors}));return report;
  };
  require(path.join(appRoot,'desktop/main.cjs'));
}
