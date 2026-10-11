'use strict';
// Bounded native verification, not a claim of model convergence. All work is
// inside a disposable profile supplied by the runner, never the user's app.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function reportDialog(output){return{showSaveDialog:async()=>({canceled:false,filePath:path.join(output,'exported-report.json')})};}
async function run(window,{output,engine,version,forceCpuFallback,capture}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,checks=[],errors=[];
  wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
  const js=async code=>{try{return await wc.executeJavaScript(code,true);}catch(error){throw Error(error.message+' · probe '+code+' · console '+JSON.stringify(errors));}},hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' '+JSON.stringify(detail));};
  const until=async code=>{const begin=Date.now();while(!await js(code)){if(Date.now()-begin>120000)throw Error('Native test timeout: '+code);await wait(50);}};
  const capturePage=async name=>{
    await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    if(!wc.debugger.isAttached())wc.debugger.attach('1.3');
    const shot=await wc.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
    await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
  };
  await until('Boolean(globalThis.circuitLab?.tests&&circuitLab.sim.engine?.sessionId&&circuitLab.sim.elapsed>.3)');
  await js('circuitLab.sim.running=false');await engine.exportProgress();await wait(300);
  check('Test disclosure starts closed',await js("!document.getElementById('model-test-panel').open"));
  check('Requested champion/rules box is removed, file save/load remain',await js("!document.getElementById('load-champion')&&!document.getElementById('storage-status')&&!document.querySelector('.training-details')&&Boolean(document.getElementById('save-progress')&&document.getElementById('load-progress'))"));
  check('Labeled test entry is ready in the top bar',await js("(()=>{const b=document.getElementById('open-model-test');return b&&!b.disabled&&b.closest('header')&&b.textContent==='Apri test modelli'&&b.getAttribute('aria-expanded')==='false';})()"));
  if(capture){
    for(const [name,width,height]of [['desktop-entry',1540,980],['mobile-entry',390,1100]]){
      window.setSize(width,height);await js('window.scrollTo(0,0)');await wait(300);
      check(name+': test entry is in first viewport without document overflow',await js("(()=>{const r=document.getElementById('open-model-test').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth+1;})()"));
      await capturePage(name);
    }
    window.setSize(1540,980);await wait(300);
  }
  await js("document.getElementById('open-model-test').click()");
  check('Header opens/scrolls/focuses test without starting or resetting training',await js("document.getElementById('model-test-panel').open&&document.getElementById('open-model-test').getAttribute('aria-expanded')==='true'&&document.activeElement.id==='model-test-start'&&!circuitLab.tests.busy&&!circuitLab.tests.suite&&!circuitLab.sim.running"));
  await js("document.querySelector('#model-test-panel > summary').click()");await until("document.getElementById('open-model-test').getAttribute('aria-expanded')==='false'");
  check('Native disclosure close updates the header accessible state',await js("!document.getElementById('model-test-panel').open"));
  await engine.command({type:'setWorkerCount',value:1});await js('circuitLab.sim.reconnect()');
  await engine.command({type:'setPopulation',value:4});await until('circuitLab.sim.cars.length===4&&!circuitLab.sim.running');
  await js("localStorage.setItem('test-preserve-sentinel','unchanged');globalThis.normalTestSim=circuitLab.sim;void 0");
  const original=await engine.exportProgress(),originalHash=hash(original),session=engine.sessionId;
  const motion=()=>js('JSON.stringify([normalTestSim.elapsed,normalTestSim.generation,normalTestSim.cars.map(c=>[c.x,c.y,c.heading,c.lifetime,c.inputs,c.physicsInputs,c.outputs,c.fitness,c.vehicle])])');
  const motionBefore=await motion(),storage=await js('JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))');
  await js('globalThis.testRunPromise=circuitLab.tests.run({limitSeconds:2,population:4,speedMultiplier:30});void 0');
  await until('circuitLab.tests.busy&&circuitLab.tests.suite.cases.some(c=>c.status===\'running\')');
  check('Settings/persistence/manual evolution are locked during comparison',await js("['controller-select','population-range','mutation-range','speed-range','circuit-select','save-progress','load-progress','next-generation','vehicle-gearbox'].every(id=>document.getElementById(id).disabled)"));
  await js("document.getElementById('open-model-test').click()");
  check('Header remains available during test and focuses the stop command',await js("!document.getElementById('open-model-test').disabled&&document.activeElement.id==='model-test-stop'&&document.getElementById('model-test-panel').open"));
  const initial=await js('({generation:circuitLab.sim.generation,model:circuitLab.sim.modelId,workerCount:circuitLab.sim.engine.workerCount,optimizer:circuitLab.sim.learningStats})');
  check('First trial is V2, one independent worker and a cold optimizer',initial.model==='v2'&&initial.workerCount===1&&initial.optimizer?.warmStart===false,initial);
  check('Normal engine/worker session retained separately',engine.sessionId===session&&engine.options.modelId===original.modelId);
  const zoomed=await js("(()=>{document.getElementById('view-circuit').click();const z=circuitLab.trackCamera.zoom;document.getElementById('track-zoom-in').click();document.getElementById('view-split').click();return circuitLab.trackCamera.zoom>z&&Boolean(circuitLab.atlas);})()");
  check('Map zoom and 3D atlas work while testing',zoomed);
  const report=await js('testRunPromise');
  check('All four actual models ran in order',JSON.stringify(report.cases.map(c=>c.modelId))===JSON.stringify(['v2','v3','v4','v5']),report.cases);
  check('Same circuit/population/mutation/speed/seed/worker settings',report.settings.population===4&&report.settings.speedMultiplier===30&&report.settings.seed===7717&&report.settings.workerCount===1&&report.execution==='sequential-cold-start',report.settings);
  for(const item of report.cases){
    check(item.modelId+': terminal result is measured, not pending/error',item.status==='limit'||item.status==='completed',item);
    check(item.modelId+': real clock and actual fixed physics ticks recorded',item.wallSeconds>0&&item.simSeconds>0&&Math.abs(item.simSeconds*60-Math.round(item.simSeconds*60))<1e-6,item);
    check(item.modelId+': no fabricated two-lap success',item.status!=='completed'||(item.hit?.lapTimes.length===2&&item.hit.lapTimes.every(t=>t>0)&&item.maxLaps===2&&item.generations>0),item);
    check(item.modelId+': correct real backend',item.modelId==='v2'||item.modelId==='v3'?item.backend==='CPU':item.backend===(forceCpuFallback?'CPU':'WebGPU + CPU'),item.backend);
  }
  const after=await engine.exportProgress(),motionAfter=await motion(),isolation={sameTraining:hash(after)===originalHash,sameSession:engine.sessionId===session,sameMotion:motionAfter===motionBefore};
  if(!Object.values(isolation).every(Boolean))await fs.writeFile(path.join(output,'isolation-diff.json'),JSON.stringify({before:original,after,motionBefore:JSON.parse(motionBefore),motionAfter:JSON.parse(motionAfter)},null,2));
  check('Exact normal training state, original session and physical state preserved',Object.values(isolation).every(Boolean),isolation);
  check('Original simulation object restored, paused as before',await js('circuitLab.sim===normalTestSim&&!circuitLab.sim.running&&!circuitLab.tests.busy'));
  check('All local preferences/champions preserved',await js('JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))')===storage);
  check('Four result rows without duplicates and export enabled',await js("document.querySelectorAll('#model-test-results tr').length===4&&!document.getElementById('model-test-export').disabled"));
  const saved=await js('desktopTest.saveReport(circuitLab.tests.suite.report())'),exported=JSON.parse(await fs.readFile(path.join(output,'exported-report.json'),'utf8'));
  check('Native JSON export writes the exact measured report',!saved.canceled&&JSON.stringify(exported)===JSON.stringify(report));
  await js('globalThis.stopRunPromise=circuitLab.tests.run({limitSeconds:0,population:4});void 0');
  await until('circuitLab.tests.suite.active&&circuitLab.tests.suite.cases[0].status===\'running\'');
  await js("document.getElementById('model-test-stop').click()");const stopped=await js('stopRunPromise');
  check('Unlimited test can be stopped and untested models are marked honestly',stopped.settings.limitSeconds===0&&stopped.cases[0].status==='stopped'&&stopped.cases.slice(1).every(c=>c.status==='not-run'),stopped.cases);
  check('Stop path preserves all training/physical state',hash(await engine.exportProgress())===originalHash&&await motion()===motionBefore);
  // Restore the full four-model report for the actual UI capture, not demo data.
  await js('circuitLab.tests.suite.cases='+JSON.stringify(report.cases)+';circuitLab.tests.suite.settings=Object.freeze('+JSON.stringify(report.settings)+');circuitLab.tests.suite.stopRequested=false;document.getElementById("model-test-panel").open=true;void 0');
  await js('updateModelTestResults(circuitLab.tests.suite)');
  if(capture){
    for(const [name,width,height]of [['desktop',1540,980],['mobile',390,1100]]){
      window.setSize(width,height);await js('window.scrollTo(0,0)');await wait(300);
      await until('!circuitLab.tests.busy&&circuitLab.sim===normalTestSim&&document.getElementById("model-test-status").textContent.startsWith("Test concluso")');
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      check(name+': no document overflow or duplicate IDs',await js('document.documentElement.scrollWidth<=innerWidth+1&&new Set(Array.from(document.querySelectorAll("[id]")).map(e=>e.id)).size===document.querySelectorAll("[id]").length'));
      await capturePage(name);
    }
  }
  await js('normalTestSim.running=true');await until('normalTestSim.elapsed>.1');await js('normalTestSim.running=false');await engine.exportProgress();
  check('Original backend resumes after tests without a model restart',engine.sessionId===session&&await js('circuitLab.sim===normalTestSim&&circuitLab.sim.elapsed>0'));
  check('No console errors',errors.length===0,errors);
  const result={passed:checks.every(c=>c.passed),version,forceCpuFallback,generatedAt:new Date().toISOString(),checks,report,stopped,consoleErrors:errors,boundary:'Bounded actual-app cold starts, timeout/stop/export/isolation checks. Not proof all four models learned two laps.'};
  await fs.writeFile(path.join(output,'model-test-smoke.json'),JSON.stringify(result,null,2));return result;
}
module.exports={run,reportDialog};
