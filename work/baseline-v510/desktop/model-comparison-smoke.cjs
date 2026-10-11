'use strict';
// Real native UI with a separate user-data directory. All comparison actions
// are performed paused and checked against the actual engine's training state.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Comparison=require('../outputs/model-comparison.js');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(window,{output,engine,version,forceCpuFallback=false,capture=false}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,checks=[],cases=[],errors=[];
  wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
  const js=code=>wc.executeJavaScript(code,true),check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
  const until=async code=>{const start=Date.now();while(!await js(code)){if(Date.now()-start>120000)throw Error('Comparison UI timeout: '+code);await wait(50);}};
  const change=async(id,value)=>js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const stable=async()=>{await engine.exportProgress();return crypto.createHash('sha256').update(JSON.stringify(await engine.exportProgress())).digest('hex');};
  const physics=()=>js('JSON.stringify([circuitLab.sim.elapsed,circuitLab.sim.generation,circuitLab.sim.cars.map(c=>[c.x,c.y,c.heading,c.speed,c.outputs,c.inputs,c.physicsInputs,c.fitness,c.reward,c.penalty])])');
  await until('Boolean(globalThis.circuitLab?.sim?.engine?.sessionId&&circuitLab.sim.cars.length)');
  check('App/UI retain exact 5.0.0 save version',version==='5.0.0'&&await js(`circuitLab.version===${JSON.stringify(version)}&&document.getElementById('build-version').textContent===${JSON.stringify(version)}`));
  check('Comparison is available beneath selector, closed by default',await js("!document.getElementById('model-comparison-details').open&&document.getElementById('controller-select').parentElement.contains(document.getElementById('model-comparison-details'))"));
  await js('circuitLab.sim.running=false');await engine.exportProgress();
  await change('population-range',4);await until('circuitLab.sim.population===4&&circuitLab.sim.cars.length===4');
  for(const expected of Comparison.models){
    await change('controller-select',expected.id);await until(`circuitLab.sim.modelId==='${expected.id}'&&!document.getElementById('controller-select').disabled`);
    // Backend initialization is asynchronous; exercise a real neural tick
    // before pausing instead of asserting against its transient waiting label.
    await until(`circuitLab.sim.elapsed>.3${expected.slotBudget===null?'':"&&circuitLab.sim.engine.gpu.state==='"+(forceCpuFallback?'fallback':'active')+"'"}`);
    await js('circuitLab.sim.running=false');await engine.exportProgress();await wait(200);
    const actual=await js(`(()=>{const s=circuitLab.sim,g=s.graph,p=FlySim.ensureLearning(g),d=document.getElementById('model-comparison-details');return {model:s.modelId,neurons:g.n,connections:g.edgeCount,slots:g.solver?.activeNeuronBudget??null,passes:g.solver?.iterationsPerControlTick??null,readout:p.nodes.length,gainGroups:p.gainGroups,parameters:p.length,rows:Array.from(d.querySelectorAll('tbody')).map(b=>Array.from(b.children).map(r=>Array.from(r.cells).map(c=>c.textContent))),current:Array.from(d.querySelectorAll('tr.is-current')).map(r=>({id:r.dataset.modelId,aria:r.getAttribute('aria-current')})),selection:d.querySelector('[data-comparison="selection"]').textContent,gpu:s.engine.gpu};})()`);
    check(expected.id+': displayed anatomy/learning are the actual loaded graph',actual.neurons===expected.neurons&&actual.connections===expected.connections&&actual.slots===expected.slotBudget&&actual.readout===expected.readout&&actual.gainGroups===expected.gainGroups&&actual.parameters===expected.parameters,actual);
    check(expected.id+': both comparison tables contain all exact configurations',JSON.stringify(actual.rows)===JSON.stringify([
      Comparison.models.map(m=>[m.id.toUpperCase(),m.neurons.toLocaleString('it-IT'),m.connections.toLocaleString('it-IT'),m.slotBudget===null?'Denso':m.slotBudget.toLocaleString('it-IT')]),
      Comparison.models.map(m=>[m.id.toUpperCase(),String(m.passes),String(m.readout),String(m.parameters)])
    ]));
    check(expected.id+': only selected model is highlighted and announced',actual.current.length===2&&actual.current.every(r=>r.id===expected.id&&r.aria==='true')&&actual.selection.startsWith(expected.id.toUpperCase()+' selezionato'));
    const before=await stable(),motion=await physics();
    const interaction=await js(`(()=>{const d=document.getElementById('model-comparison-details');d.open=true;document.getElementById('view-circuit').click();document.getElementById('track-reset').click();const z=circuitLab.trackCamera.zoom;document.getElementById('track-zoom-in').click();const zoomed=circuitLab.trackCamera.zoom>z;document.getElementById('view-split').click();return {zoomed,view:document.getElementById('visual-stage').dataset.view,atlas:Boolean(circuitLab.atlas),open:d.open};})()`);
    await wait(250);
    check(expected.id+': disclosure/map zoom/split atlas remain functional',interaction.zoomed&&interaction.view==='split'&&interaction.atlas&&interaction.open,interaction);
    check(expected.id+': comparison and map inspection leave physics/RNG/genomes/optimizer/history unchanged',await stable()===before&&await physics()===motion);
    check(expected.id+': no duplicate table rows across model switches',await js("document.querySelectorAll('#model-comparison-details tbody tr').length===8"));
    if(expected.slotBudget!==null)check(expected.id+': existing GPU/CPU engine remains available',actual.gpu.state===(forceCpuFallback?'fallback':'active'),actual.gpu);
    cases.push({modelId:expected.id,population:4,graph:actual,trainingStateUnchanged:true});
  }
  await js("document.getElementById('model-comparison-details').open=false;document.getElementById('model-comparison-toggle').focus()");
  // sendInputEvent requires a focused OS window. CDP exercises Chromium's
  // real default keyboard action without showing or focusing this hidden test.
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await wc.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await wait(100);
  const keyboard=await js("(()=>{const e=document.getElementById('model-comparison-toggle');return {open:document.getElementById('model-comparison-details').open,active:document.activeElement.id,outline:getComputedStyle(e).outlineStyle};})()");
  wc.debugger.detach();check('Native disclosure opens from Chromium keyboard with visible focus',keyboard.open&&keyboard.active==='model-comparison-toggle'&&keyboard.outline!=='none',keyboard);
  const ids=await js("Array.from(document.querySelectorAll('[id]')).map(e=>e.id)");check('No duplicate DOM IDs',ids.length===new Set(ids).size);
  const views={};
  if(capture){
    for(const [name,width,height,script]of [
      ['desktop-comparison',1540,980,"document.getElementById('view-circuit').click();document.getElementById('model-comparison-details').scrollIntoView({block:'start'})"],
      ['narrow-comparison',390,844,"document.getElementById('model-comparison-details').scrollIntoView({block:'start'})"],
      ['split-map-atlas',1540,980,"document.getElementById('view-split').click();window.scrollTo(0,0)"]
    ]){
      window.setContentSize(width,height);await js(script);await wait(250);
      const metrics=await js(`(()=>{const d=document.getElementById('model-comparison-details'),visible=Array.from(d.querySelectorAll('th,td,p,summary')).filter(e=>e.getBoundingClientRect().width);return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,tableOverflow:Array.from(d.querySelectorAll('.model-comparison-table')).map(t=>t.scrollWidth>t.clientWidth+1),overflow:visible.filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.tagName),rows:d.querySelectorAll('tbody tr').length,open:d.open,bodyFont:getComputedStyle(d.querySelector('p')).fontSize,tableFont:getComputedStyle(d.querySelector('table')).fontSize,gap:getComputedStyle(d.querySelector('.model-comparison-body')).gap};})()`);
      const image=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),image.toPNG());views[name]={...metrics,file:name+'.png'};
      check(name+': all comparison cells fit viewport and table',metrics.documentWidth<=metrics.width&&!metrics.overflow.length&&!metrics.tableOverflow.some(Boolean),metrics);
    }
    // Crop of the real native render, not a synthetic/UI mockup.
    window.setContentSize(1540,980);await js("document.getElementById('view-circuit').click();document.getElementById('model-comparison-details').scrollIntoView({block:'start'})");await wait(150);
    const bounds=await js("(()=>{const r=document.getElementById('model-comparison-details').getBoundingClientRect();return {x:Math.round(r.x)-8,y:Math.max(0,Math.round(r.y)-8),width:Math.round(r.width)+16,height:Math.min(innerHeight-16,Math.round(r.height)+16)};})()");
    const crop=await wc.capturePage(bounds,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,'comparison-detail.png'),crop.toPNG());
  }
  const result={version,runtimeVersion:version,generatedAt:new Date().toISOString(),forceCpuFallback,checks,cases,views,consoleErrors:errors,passed:checks.every(c=>c.passed)&&!errors.length,boundary:'Read-only model comparison on the real Windows app. Model selection runs existing neural engines; paused disclosure/map/atlas inspection preserves actual engine training and physical state. Not a throughput or convergence benchmark.'};
  await fs.writeFile(path.join(output,'model-comparison-smoke.json'),JSON.stringify(result,null,2));console.log('MODEL_COMPARISON_SMOKE '+JSON.stringify({passed:result.passed,checks:checks.length,cases:cases.length,errors,output}));return result;
}
module.exports={run};
