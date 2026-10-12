'use strict';
// Natural-generation GPU/CPU integration check in a disposable Electron profile.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),arg=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const appRoot=path.resolve(root,arg('source-root','.')),tag=arg('tag','hybrid-candidate');
if(!/^[a-z0-9-]+$/.test(tag))throw Error('Invalid diagnostic tag');
const output=path.join(root,'.impeccable/review/learning-ml',tag);
if(!process.versions.electron){
  if(fs.existsSync(output))throw Error('Refusing to overwrite diagnostic');fs.mkdirSync(output,{recursive:true});
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const {spawn}=require('node:child_process'),profile=path.join(output,'profile');
  const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),[__filename,'--source-root='+appRoot,'--tag='+tag,'--model-benchmark','--user-data-dir='+profile],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(fs.createWriteStream(path.join(output,'stdout.log')));child.stderr.pipe(fs.createWriteStream(path.join(output,'stderr.log')));
  child.stdout.on('data',b=>process.stdout.write(b));
  const guard=setTimeout(()=>child.kill(),600000);
  child.on('error',e=>{clearTimeout(guard);console.error(e);process.exitCode=1;});
  child.on('exit',code=>{clearTimeout(guard);process.exitCode=code===0?0:1;});
}else{
  const {app}=require('electron');app.setAppPath(appRoot);
  const profile=process.argv.find(a=>a.startsWith('--user-data-dir='))?.slice(16);
  if(!profile||!path.resolve(profile).startsWith(output+path.sep))throw Error('Isolated profile required');app.setPath('userData',profile);
  const engineModule=require(path.join(appRoot,'desktop/engine.cjs')),Original=engineModule.DesktopEngine,instances=[];
  engineModule.DesktopEngine=class extends Original{constructor(...args){super(...args);instances.push(this);}};
  const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const sourceSha256=Object.fromEntries(['simulation.js','neural-learning.js','rewards.js'].map(f=>[f,hash(path.join(appRoot,'outputs',f))]));
  require(path.join(appRoot,'desktop/model-benchmark.cjs')).run=async(window)=>{
    const wc=window.webContents,errors=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),js=code=>wc.executeJavaScript(code,true);
    wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
    const until=async(code)=>{const start=Date.now();while(!await js(code)){if(Date.now()-start>45000)throw Error('Hybrid wait timeout: '+code);await wait(100);}};
    await until('Boolean(globalThis.circuitLab?.sim?.engine?.sessionId)');const engine=instances[0];
    const cases=[];
    for(const modelId of ['v4','v5']){
      await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});
      if(await js('circuitLab.sim.modelId')!==modelId){
        await js(`document.getElementById('controller-select').value=${JSON.stringify(modelId)};document.getElementById('controller-select').dispatchEvent(new Event('change',{bubbles:true}));`);
        await until(`circuitLab.sim.modelId===${JSON.stringify(modelId)}&&!document.getElementById('controller-select').disabled`);
      }
      await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});
      await engine.command({type:'setWorkerCount',value:1});await js('circuitLab.sim.reconnect()');
      await engine.command({type:'setCircuit',value:'monza'});await engine.command({type:'setMutation',value:.16});
      await engine.command({type:'setPopulation',value:16});await engine.command({type:'setSpeed',value:30});await engine.command({type:'reset'});
      await until("circuitLab.sim.generation===1&&circuitLab.sim.population===16&&!circuitLab.sim.running&&circuitLab.sim.circuitId==='monza'");
      const before=await engine.exportProgress(),initial=before.workers[0].state,started=performance.now();
      await js('circuitLab.sim.running=true');
      while((engine.states[0]?.generation??1)<=20&&performance.now()-started<120000)await wait(100);
      await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});
      const after=await engine.exportProgress(),state=after.workers[0].state,history=state.history.filter(h=>h.generation<=20);
      const ppm=await js('circuitLab.sim.track.pixelsPerMeter'),median=values=>{const v=values.slice().sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2:null;};
      const item={modelId,circuitId:'monza',seed:initial.seed,population:16,requestedGenerations:20,completedGenerations:history.length,censored:history.length<20,
        elapsedSeconds:(performance.now()-started)/1000,backend:engine.gpu,firstMedianMeters:median(history.slice(0,5).map(h=>h.bestProgress/ppm)),lastMedianMeters:median(history.slice(-5).map(h=>h.bestProgress/ppm)),
        maxMeters:Math.max(0,...history.map(h=>h.bestProgress/ppm)),maxLaps:Math.max(0,...history.map(h=>h.maxLaps??h.laps)),
        meanDeltaRms:Math.sqrt(state.optimizer.mean.reduce((s,v,i)=>s+(v-initial.optimizer.mean[i])**2,0)/state.optimizer.mean.length),history};
      cases.push(item);fs.writeFileSync(path.join(output,modelId+'.json'),JSON.stringify(item,null,2));console.log('HYBRID_CASE '+JSON.stringify({...item,history:undefined}));
    }
    const unchanged=Object.entries(sourceSha256).every(([f,h])=>hash(path.join(appRoot,'outputs',f))===h);
    const result={passed:unchanged&&!errors.length,sourceSha256,source:appRoot,cases,errors,settings:{seed:7717,circuit:'monza',population:16,mutation:.16,generations:20,wallGuardSeconds:120},boundary:'Natural cold-start hybrid episodes, isolated profile, no imported user saves. Censored cases are not convergence evidence. CPU/headless outcomes need not equal GPU sparse outcomes.'};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));return result;
  };
  require(path.join(appRoot,'desktop/main.cjs'));
}
