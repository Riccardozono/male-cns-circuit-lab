'use strict';
// Diagnostic mode only: same UI and file layer, disposable profile, injected
// picker responses. No path-taking file API is exposed to ordinary renderers.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Progress=require('../outputs/progress-save.js'),F=require('../outputs/simulation.js');
const queues=new Map(),wait=ms=>new Promise(r=>setTimeout(r,ms));
function dialogs(output){
  const actions=[];queues.set(output,actions);
  const take=type=>{const next=actions.shift();if(!next||next.type!==type)throw Error('Unexpected diagnostic dialog '+type);return next.result;};
  return {showSaveDialog:async()=>take('save'),showOpenDialog:async()=>take('open'),showMessageBox:async()=>take('confirm')};
}
async function run(window,{output,engine,version,forceCpuFallback=false,capture=false}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,checks=[],errors=[],cases=[];
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message);});
  const js=code=>wc.executeJavaScript(code,true),check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
  const until=async(code,timeout=30000)=>{const start=Date.now();while(!await js(code)){if(Date.now()-start>timeout)throw Error('Timeout progress check: '+code);await wait(50);}};
  const change=async(id,value)=>js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const click=async id=>{await until(`!document.getElementById(${JSON.stringify(id)}).disabled&&!document.querySelector('main').inert`);await js(`document.getElementById(${JSON.stringify(id)}).click()`);await until("document.querySelector('main').getAttribute('aria-busy')==='false'");};
  const queue=(type,result)=>queues.get(output).push({type,result});
  const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
  const stable=async()=>{await engine.exportProgress();await engine.exportProgress();return engine.exportProgress();};
  const normalized=p=>{const copy=JSON.parse(JSON.stringify(p));for(const w of copy.workers)w.state.elapsedAtSave=0;return copy;};
  await until("Boolean(globalThis.circuitLab?.sim?.engine?.sessionId&&circuitLab.sim.cars.length)");
  check('UI and native app report the same exact version',await js(`circuitLab.version===${JSON.stringify(version)}&&document.getElementById('build-version').textContent===${JSON.stringify(version)}`));
  for(const [modelId,circuitId,workerCount]of [['v2','monza',2],['v3','monaco',1],['v4','le-mans',1],['v5','monza',1]]){
    await change('controller-select',modelId);await until(`circuitLab.sim.modelId==='${modelId}'&&!document.getElementById('controller-select').disabled&&circuitLab.sim.engine.modelId==='${modelId}'`);
    await js("circuitLab.sim.running=false");await until('!circuitLab.sim.running');
    await js(`desktopCompute.command({type:'setWorkerCount',value:${workerCount}})`);
    // The ordinary pool-change API returns a new session. Reconnect the
    // diagnostic observer to it, without introducing a model/policy reset.
    await js('circuitLab.sim.reconnect()');await change('circuit-select',circuitId);
    await change('population-range',4);await until(`circuitLab.sim.population===4&&circuitLab.sim.cars.length===4&&circuitLab.sim.circuitId==='${circuitId}'`);
    await js("(()=>{const e=document.getElementById('mutation-range');e.value='23';e.dispatchEvent(new Event('input',{bubbles:true}));const v=document.getElementById('speed-range');v.value='3.5';v.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await until('circuitLab.sim.mutation===.23&&circuitLab.sim.speedMultiplier===3.5');
    // Actual unassisted rollouts; advancing early by the existing UI command
    // tests optimizer/history preservation, not lap completion/convergence.
    await js('circuitLab.sim.running=true');await until('circuitLab.sim.elapsed>.22');
    await js('circuitLab.sim.running=false');await until('!circuitLab.sim.running');
    await click('next-generation');await until('circuitLab.sim.generation>=2');
    await js('circuitLab.sim.running=true');await until('circuitLab.sim.elapsed>.22');
    await js('circuitLab.sim.running=false');await until('!circuitLab.sim.running');
    await click('next-generation');await until('circuitLab.sim.generation>=3');
    await js('circuitLab.sim.running=true');await until('circuitLab.sim.elapsed>.12');
    await js('circuitLab.sim.running=false');await until('!circuitLab.sim.running');
    const before=await stable(),filePath=path.join(output,'progress-'+modelId+'.malecns-save');
    queue('save',{canceled:false,filePath});await click('save-progress');
    const text=await fs.readFile(filePath,'utf8'),file=await Progress.decode(text,version),p=file.payload;
    check(modelId+': UI creates a valid portable file for every worker',p.modelId===modelId&&p.circuitId===circuitId&&p.workers.length===workerCount&&hash(p)===hash(before),{bytes:Buffer.byteLength(text),workers:p.workers.length});
    check(modelId+': learned optimizer and real histories are present',p.workers.every(w=>w.state.optimizer.updates>=2&&w.state.history.length>=2&&w.state.genomes.length===4),p.workers.map(w=>({generation:w.state.generation,updates:w.state.optimizer.updates,episodes:w.state.optimizer.episodes})));
    const status=await js("document.getElementById('progress-status').textContent");check(modelId+': saved file name and version are visible',status.includes(path.basename(filePath))&&status.includes(version),status);
    if(version==='5.7.0'&&p.workers.some(worker=>worker.state.rewardRevision!==F.Rewards.REVISION))
      check(modelId+': incompatible reward revision displays its compatibility warning',status.includes('release 5.7.0 distribuita non lo apre'),status);
    await change('controller-select',modelId==='v2'?'v3':'v2');await until(`circuitLab.sim.modelId==='${modelId==='v2'?'v3':'v2'}'&&!document.getElementById('controller-select').disabled`);
    await js('circuitLab.sim.running=false');await until('!circuitLab.sim.running');
    queue('open',{canceled:false,filePaths:[filePath]});queue('confirm',{response:0});await click('load-progress');
    const startState=await js(`(()=>{const s=circuitLab.sim,start=FlySim.makeCar(s.track,0);return {model:s.modelId,circuit:s.circuitId,running:s.running,elapsed:s.elapsed,population:s.cars.length,x:s.cars[0].x,y:s.cars[0].y,startX:start.x,startY:start.y,speed:s.cars[0].vehicle.speedMps,selector:document.getElementById('controller-select').value,status:document.getElementById('progress-status').textContent};})()`);
    check(modelId+': loading selects saved model/circuit, paused at start',startState.model===modelId&&startState.circuit===circuitId&&!startState.running&&startState.elapsed===0&&startState.population===4&&startState.x===startState.startX&&startState.y===startState.startY&&startState.speed===0&&startState.selector===modelId,startState);
    check(modelId+': imported model updates both comparison highlights',await js(`Array.from(document.querySelectorAll('#model-comparison-details tr.is-current')).length===2&&Array.from(document.querySelectorAll('#model-comparison-details tr.is-current')).every(r=>r.dataset.modelId==='${modelId}')&&document.querySelector('#model-comparison-details [data-comparison="selection"]').textContent.startsWith('${modelId.toUpperCase()} selezionato')`));
    const restored=await stable();check(modelId+': all saved training parameters round-trip exactly',hash(normalized(restored))===hash(normalized(p)),{before:hash(normalized(p)),after:hash(normalized(restored))});
    check(modelId+': UI settings match the restored worker settings',await js("document.getElementById('mutation-range').value==='23'&&document.getElementById('population-range').value==='4'&&document.getElementById('speed-range').value==='3.5'&&circuitLab.sim.mutation===.23"));
    const resumedGeneration=await js('circuitLab.sim.generation');await click('toggle-run');await until('circuitLab.sim.elapsed>.12');
    check(modelId+': loaded controller continues with finite real telemetry',await js(`circuitLab.sim.generation>=${resumedGeneration}&&circuitLab.sim.cars.every(c=>[c.x,c.y,c.speed,c.fitness,...c.outputs].every(Number.isFinite))`));
    if(modelId==='v4'||modelId==='v5')check(modelId+' restored GPU/CPU path is active',await js(forceCpuFallback?"circuitLab.sim.engine.gpu.state==='fallback'":"circuitLab.sim.engine.gpu.state==='active'"),await js('circuitLab.sim.engine.gpu'));
    await js('circuitLab.sim.running=false');await until('!circuitLab.sim.running');
    cases.push({modelId,circuitId,file:path.basename(filePath),bytes:Buffer.byteLength(text),workers:workerCount,savedGeneration:p.workers[0].state.generation,optimizerUpdates:p.workers[0].state.optimizer.updates,sha256:crypto.createHash('sha256').update(text).digest('hex')});
  }
  const before=await stable(),session=engine.sessionId;
  for(const [name,actions,expected]of [
    ['Cancel Save',[['save',{canceled:true}]],'annullato'],
    ['Cancel Open',[['open',{canceled:true}]],'annullato'],
    ['Cancel replacement',[['open',{canceled:false,filePaths:[path.join(output,'progress-v2.malecns-save')]}],['confirm',{response:1}]],'annullato']
  ]){for(const [type,result]of actions)queue(type,result);await click(name==='Cancel Save'?'save-progress':'load-progress');check(name+' preserves current trial',hash(await stable())===hash(before)&&engine.sessionId===session&&await js(`document.getElementById('progress-status').textContent.includes('${expected}')`));}
  const wrongPath=path.join(output,'wrong-version.malecns-save'),brokenPath=path.join(output,'broken-checksum.malecns-save'),shapePath=path.join(output,'wrong-policy.malecns-save');
  await fs.writeFile(wrongPath,await Progress.encode(before,'5.5.0'));
  const broken=JSON.parse(await Progress.encode(before,version));broken.payload.workers[0].state.optimizer.mean[0]+=1;await fs.writeFile(brokenPath,JSON.stringify(broken));
  const wrongShape=JSON.parse(JSON.stringify(before));wrongShape.workers[0].state.genomes[0].policyWeights=[0];await fs.writeFile(shapePath,await Progress.encode(wrongShape,version));
  for(const [name,target,fragment]of [['Previous 5.5.0 release',wrongPath,'richiede esattamente'],['Checksum mismatch',brokenPath,'checksum'],['Malformed policy',shapePath,'incompatibile']]){
    queue('open',{canceled:false,filePaths:[target]});await click('load-progress');
    const status=await js("document.getElementById('progress-status').textContent");check(name+' is rejected without changing the trial',status.includes(fragment)&&engine.sessionId===session&&hash(await stable())===hash(before),status);
  }
  for(const modelId of ['v4','v5']){
    if(await js('circuitLab.sim.modelId')!==modelId){await change('controller-select',modelId);await until(`circuitLab.sim.modelId==='${modelId}'&&!document.getElementById('controller-select').disabled`);await js('circuitLab.sim.running=false');await until('!circuitLab.sim.running');}
    await change('population-range',100);await until('circuitLab.sim.cars.length===100&&circuitLab.sim.generation===1');
    const bigPath=path.join(output,'progress-'+modelId+'-100.malecns-save');queue('save',{canceled:false,filePath:bigPath});await click('save-progress');
    const big=await Progress.decode(await fs.readFile(bigPath,'utf8'),version);check('100 agents and full '+modelId+' graph are portable',big.payload.workers[0].state.genomes.length===100&&big.payload.graph.nodes===166700&&big.payload.workers[0].state.optimizer.mean.length===(modelId==='v5'?346:202));
    await change('population-range',4);await until('circuitLab.sim.cars.length===4');queue('open',{canceled:false,filePaths:[bigPath]});queue('confirm',{response:0});await click('load-progress');
    check(modelId+': 100-agent file restores all cars without trimming',await js('circuitLab.sim.population===100&&circuitLab.sim.cars.length===100&&!circuitLab.sim.running'));
    await click('toggle-run');await until('circuitLab.sim.elapsed>.15',180000);check(modelId+': 100-agent imported trial runs with exclusive pedals and finite physics',await js('circuitLab.sim.cars.every(c=>[c.x,c.y,c.speed,...c.outputs].every(Number.isFinite)&&Math.min(c.outputs[1],c.outputs[2])<=1e-9)'));
    await js('circuitLab.sim.running=false');await until('!circuitLab.sim.running');
  }
  const priorSaveDirectory=process.argv.find(a=>a.startsWith('--model-ui-prior-saves='))?.slice('--model-ui-prior-saves='.length),priorImports=[];
  if(priorSaveDirectory){
    for(const modelId of ['v2','v3','v4','v5']){
      const filePath=path.join(path.resolve(priorSaveDirectory),'progress-'+modelId+(modelId==='v4'||modelId==='v5'?'-100':'')+'.malecns-save');
      const text=await fs.readFile(filePath,'utf8'),file=await Progress.decode(text,version),p=file.payload;
      queue('open',{canceled:false,filePaths:[filePath]});queue('confirm',{response:0});await click('load-progress');
      check(modelId+': previous delivered 5.0.0 file loads paused through the real UI',await js(`circuitLab.sim.modelId==='${modelId}'&&!circuitLab.sim.running&&circuitLab.sim.cars.length===${p.workers[0].state.genomes.length}&&document.getElementById('controller-select').value==='${modelId}'&&Array.from(document.querySelectorAll('#model-comparison-details tr.is-current')).every(r=>r.dataset.modelId==='${modelId}')`));
      check(modelId+': previous file preserves all worker training state exactly',hash(normalized(await stable()))===hash(normalized(p)));
      priorImports.push({modelId,file:filePath,workers:p.workers.length,population:p.workers[0].state.genomes.length,sha256:crypto.createHash('sha256').update(text).digest('hex')});
    }
  }
  // A clear saved status in the single wide/narrow finish-review batch.
  queue('save',{canceled:false,filePath:path.join(output,'progress-v5-100-current.malecns-save')});await click('save-progress');
  const movingCopyPath=process.argv.find(a=>a.startsWith('--moving-copy-fixture='))?.slice('--moving-copy-fixture='.length);
  let movingCopy=null;
  if(movingCopyPath){
    const text=await fs.readFile(path.resolve(movingCopyPath),'utf8'),file=await Progress.decode(text,version),p=file.payload;
    queue('open',{canceled:false,filePaths:[path.resolve(movingCopyPath)]});queue('confirm',{response:0});await click('load-progress');
    check('Experimental V3 copy loads in the actual UI in pause with its 5 workers',
      await js("circuitLab.sim.modelId==='v3'&&circuitLab.sim.circuitId==='monza'&&!circuitLab.sim.running&&circuitLab.sim.cars.length===40&&circuitLab.sim.engine.workerCount===5"));
    check('Experimental copy keeps its validated full worker state',hash(normalized(await stable()))===hash(normalized(p)));
    check('Imported-session description is truthful',await js("document.getElementById('mode-note').textContent.includes('salvataggio importato')&&!document.getElementById('mode-note').textContent.includes('nessun salvataggio importato')"));
    check('The visible import status warns about 5.7.0 release compatibility',await js("document.getElementById('progress-status').textContent.includes('release 5.7.0 distribuita non lo apre')"));
    check('Historical progress-3 scoring shows a compatibility warning',await js("progressCompatibility(['progress-3']).includes('release 5.7.0 distribuita non lo apre')") );
    check('Save controls explain strict version and reward compatibility',await js("document.getElementById('progress-file-note').textContent.includes('non si aprono nella release 5.7.0 distribuita')"));
    movingCopy={workers:p.workers.length,population:p.workers[0].state.population,rewardRevision:p.workers[0].state.rewardRevision,
      sha256:crypto.createHash('sha256').update(text).digest('hex')};
    if(capture){
      movingCopy.views={};
      for(const [name,width,height,dark]of [['import-light-desktop',1540,980,false],['import-dark-desktop',1540,980,true],['import-light-compact',1080,800,false],['import-dark-compact',1080,800,true]]){
        window.setContentSize(width,height);
        await js(`(()=>{if((document.documentElement.dataset.theme==='dark')!==${dark})document.getElementById('theme-toggle').click();const note=document.getElementById('progress-file-note');note.scrollIntoView({block:'center',behavior:'instant'});const rect=note.getBoundingClientRect();window.scrollBy(0,Math.max(0,rect.bottom-innerHeight+24));})()`);
        await wait(200);
        const metrics=await js(`(()=>{const e=document.getElementById('progress-file-note'),s=getComputedStyle(e),r=e.getBoundingClientRect();let n=e,bg='';while(n){const c=getComputedStyle(n).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break;}n=n.parentElement;}return {theme:document.documentElement.dataset.theme,width:innerWidth,documentWidth:document.documentElement.scrollWidth,textColor:s.color,background:bg,fontSize:s.fontSize,rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width},visible:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1};})()`);
        check(name+': compatibility note is visible without horizontal overflow',metrics.visible&&metrics.documentWidth<=metrics.width,metrics);
        const img=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),img.toPNG());movingCopy.views[name]={...metrics,file:name+'.png'};
      }
      window.setContentSize(1540,980);await js("if(document.documentElement.dataset.theme==='dark')document.getElementById('theme-toggle').click()");
    }
    await click('reset-sim');await until('circuitLab.sim.generation===1');
    check('Reset distinguishes the new session without modifying the imported file',await js("document.getElementById('mode-note').textContent.includes('sessione nuova, nessun salvataggio importato')&&document.getElementById('progress-status').textContent.includes('file caricato resta invariato')"));
    check('Experimental copy bytes remain unchanged',crypto.createHash('sha256').update(await fs.readFile(path.resolve(movingCopyPath))).digest('hex')===movingCopy.sha256);
  }
  const ids=await js("Array.from(document.querySelectorAll('[id]')).map(e=>e.id)");check('No duplicate DOM IDs',ids.length===new Set(ids).size);
  const views={};
  if(capture){
    for(const [name,width,height,script]of [
      ['desktop-map',1540,980,"document.getElementById('view-split').click();window.scrollTo(0,0)"],
      ['desktop-save',1540,980,"document.getElementById('progress-title').scrollIntoView({block:'center'})"],
      ['narrow-save',390,844,"document.getElementById('progress-title').scrollIntoView({block:'center'})"],
      ['narrow-map',390,844,"document.getElementById('view-circuit').click();window.scrollTo(0,0)"]
    ]){
      window.setContentSize(width,height);await js(script);await wait(200);
      const metrics=await js(`(()=>{const controls=Array.from(document.querySelectorAll('button,select,input,summary')).filter(e=>e.getBoundingClientRect().width),status=document.getElementById('progress-status'),main=document.querySelector('main');return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,overflow:controls.filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.id||e.tagName),status:status.textContent,statusLive:status.getAttribute('aria-live'),busy:main.getAttribute('aria-busy'),save:document.getElementById('save-progress').getBoundingClientRect().height,load:document.getElementById('load-progress').getBoundingClientRect().height,map:Math.max(document.getElementById('simulation-canvas').getBoundingClientRect().width,document.getElementById('track-3d-canvas').getBoundingClientRect().width)};})()`);
      const img=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),img.toPNG());views[name]={...metrics,file:name+'.png'};
    }
  }
  check('All expected native picker/confirmation calls completed',queues.get(output).length===0);
  const result={version,runtimeVersion:await js('circuitLab.version'),generatedAt:new Date().toISOString(),forceCpuFallback,checks,cases,priorImports,movingCopy,views,consoleErrors:errors,boundary:'Training-state round trips, forced early generations and short native runtime checks. Not exact mid-lap/GPU continuation, cryptographic authentication or learning-convergence evidence.'};
  result.passed=checks.every(c=>c.passed)&&errors.length===0&&Object.values(views).every(v=>v.documentWidth<=v.width&&!v.overflow.length&&v.statusLive==='polite'&&v.busy==='false'&&v.save>=36&&v.load>=36&&v.map>0);
  await fs.writeFile(path.join(output,'progress-smoke.json'),JSON.stringify(result,null,2));console.log('PROGRESS_SMOKE '+JSON.stringify({passed:result.passed,checks:checks.length,version,output,errors}));return result;
}
module.exports={dialogs,run};
