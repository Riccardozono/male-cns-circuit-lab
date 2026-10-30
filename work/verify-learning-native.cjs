'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),appRoot=path.join(root,'dist-learning-actuators-dev-560/win-unpacked/resources/app');
const output=path.join(root,'.impeccable/review/learning-actuators-560/native');
const savePath='C:/Users/utente/Downloads/Circuit-Lab-5.6.0-v3-monza-gen64.malecns-save';
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(!process.versions.electron){
  fs.mkdirSync(output,{recursive:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'malecns-learning-native-'));
  const child=require('node:child_process').spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[__filename,'--model-benchmark','--user-data-dir='+profile],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(fs.createWriteStream(path.join(output,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(output,'stderr.log')));child.stdout.on('data',b=>process.stdout.write(b));
  const guard=setTimeout(()=>{console.error('Only native learning test reached its wall guard');child.kill();},180000);
  child.on('error',e=>{clearTimeout(guard);console.error(e);process.exitCode=1;});child.on('exit',code=>{clearTimeout(guard);console.log('NATIVE_LEARNING_EXIT '+code);process.exitCode=code===0?0:1;});
}else{
  const {app}=require('electron'),before=hash(savePath),proofs=new Map(),threads=require('node:worker_threads'),OriginalWorker=threads.Worker;
  const profile=process.argv.find(a=>a.startsWith('--user-data-dir='))?.slice(16);if(!profile)throw Error('Disposable profile required');app.setAppPath(appRoot);app.setPath('userData',profile);
  threads.Worker=class extends OriginalWorker{
    constructor(file,options){const own=options?.workerData&&path.resolve(file)===path.join(appRoot,'desktop/worker.cjs');
      super(own?path.join(__dirname,'learning-native-observer.cjs'):file,own?{...options,workerData:{...options.workerData,nativeLearningOriginalWorker:file}}:options);
      if(own)this.on('message',m=>{if(m.type==='learning-cache-proof')proofs.set(m.modelId+':'+m.workerIndex,m);});
    }
  };
  const mod=require(path.join(appRoot,'desktop/engine.cjs')),OriginalEngine=mod.DesktopEngine,instances=[];
  mod.DesktopEngine=class extends OriginalEngine{constructor(...args){super(...args);instances.push(this);}start(o,r){return super.start({...o,workerCount:1,running:false},r);}};
  require(path.join(appRoot,'desktop/model-benchmark.cjs')).run=async window=>{
    const wc=window.webContents,js=code=>wc.executeJavaScript(code,true),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],errors=[];
    const check=(name,passed,detail=null)=>{checks.push({name,passed:!!passed,detail});if(!passed)throw Error(name+' '+JSON.stringify(detail));};
    const until=async(fn,label)=>{const start=performance.now();while(!await fn()){if(performance.now()-start>45000)throw Error('Timeout '+label);await wait(80);}};
    wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
    await until(()=>js('Boolean(globalThis.circuitLab?.sim?.engine&&!document.querySelector("main").inert)'),'startup');
    check('Version remains 5.6.0',await js('circuitLab.version')==='5.6.0');
    await js('document.getElementById("circuit-view").hidden=true;document.getElementById("brain-view").hidden=true');
    const engine=instances[0],F=require(path.join(appRoot,'outputs/simulation.js')),P=require(path.join(appRoot,'outputs/progress-save.js')),cases=[];
    for(const modelId of ['v2','v3','v4','v5']){
      if(await js('circuitLab.sim.modelId')!==modelId){await js('document.getElementById("controller-select").value='+JSON.stringify(modelId)+';document.getElementById("controller-select").dispatchEvent(new Event("change",{bubbles:true}))');await until(()=>js('circuitLab.sim.modelId==='+JSON.stringify(modelId)+'&&!document.getElementById("controller-select").disabled'),'model '+modelId);}
      await engine.start({modelId,circuitId:'monza',population:4,mutation:0,speedMultiplier:30,mode:'connectome',running:false,rendererToken:engine.options.rendererToken});await js('circuitLab.sim.reconnect()');
      await js('circuitLab.sim.running=true');await engine.command({type:'pause',value:true});await wait(2000);await engine.command({type:'pause',value:false});await js('circuitLab.sim.running=false');
      engine.workers[0].postMessage({type:'observe-learning-cache'});await until(()=>proofs.has(modelId+':0'),'cache '+modelId);
      const proof=proofs.get(modelId+':0');check(modelId+' records real control activity',proof.observedAgents>0&&proof.maxCentres<=12,proof);check(modelId+' finite exclusive pedals',proof.finite&&!proof.overlap);
      const graph=await engine.progressGraph(modelId),policy=F.ensureLearning(graph),brain={activity:new Float32Array(graph.n)};brain.activity[policy.nodes[0]]=.1;
      const commands=bias=>{const weights=policy.mean.slice();weights[weights.length-1]=bias;return F.neuralOutputsFromBrain(graph,brain,{adapterVersion:policy.version,policyWeights:weights});};
      const gas=commands(1.5),brake=commands(-1.5);check(modelId+' decoder gas/brake identities',gas[1]>.9&&gas[2]===0&&brake[1]===0&&brake[2]>.9);
      brain.activity.fill(0);check(modelId+' silent anatomical state cannot drive',commands(1.5).every(v=>v===0));
      if(['v4','v5'].includes(modelId))check(modelId+' actual GPU remains active',engine.gpu.state==='active',engine.gpu);
      cases.push({modelId,proof,gpu:{...engine.gpu},syntheticDecoder:{gas,brake}});
    }
    const verified=await P.decode(fs.readFileSync(savePath,'utf8'),'5.6.0');await engine.restoreProgress(verified.payload,engine.options.rendererToken);
    const restored=await engine.exportProgress();check('Original save restores all five workers',restored.workers.length===5);
    check('Original saved training is exact excluding documented elapsed reset',restored.workers.every((w,i)=>JSON.stringify({...w.state,elapsedAtSave:0})===JSON.stringify({...verified.payload.workers[i].state,elapsedAtSave:0})));
    check('Original file preserved',hash(savePath)===before);check('Renderer has no console errors',!errors.length,errors);
    const report={passed:checks.every(c=>c.passed),version:'5.6.0',bundle:appRoot,checks,cases,saveSha256:before,consoleErrors:errors,
      boundary:'Actual isolated Windows bundle, all four real neural models with CPU/active GPU, native saved-state validation. Decoder fixtures are separate from population. Short cold cases validate integration and exclusivity, not learned braking at every corner or convergence. Original profile/save/release are not modified.'};
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log('NATIVE_LEARNING_DONE '+JSON.stringify({passed:report.passed,checks:checks.length,models:cases.map(c=>({model:c.modelId,gpu:c.gpu.state,observedAgents:c.proof.observedAgents})),errors}));return report;
  };
  require(path.join(appRoot,'desktop/main.cjs'));
}
