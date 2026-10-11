'use strict';
// Diagnostic of this application's own renderer. Uses a separate launch/profile.
const fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(window,{output,version}){
  await fs.mkdir(output,{recursive:true});
  const errors=[],wc=window.webContents;
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message);});
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id),checks=[];
    const until=async(predicate,timeout=10000)=>{const started=performance.now();while(!predicate()){if(performance.now()-started>timeout)throw Error('Timeout stato UI: '+JSON.stringify({agentLabel:$('brain-agent').textContent,cars:sim.cars.map(c=>({id:c.id,brain:c.brainSnapshot,count:c.brain.activeCount})),running:sim.running}));await wait(50);}};
    const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
    const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    const ready=performance.now();while(!globalThis.circuitLab?.atlas||!globalThis.circuitLab?.sim?.engine||$('run-state').textContent==='AVVIO'){if(performance.now()-ready>30000)throw Error('Timeout avvio UI');await wait(100);}
    const sim=circuitLab.sim,atlas=circuitLab.atlas;
    if(sim.running)$('toggle-run').click();await wait(800);
    const fingerprint=()=>JSON.stringify({generation:sim.generation,elapsed:sim.elapsed,stats:sim.learningStats,cars:sim.cars.map(c=>({id:c.id,x:c.x,y:c.y,heading:c.heading,speed:c.speed,reward:c.reward,penalty:c.penalty,genome:c.genome})),activity:Array.from(sim.cars[0].brain.activity)});
    let baseline=fingerprint();for(let i=0;i<12;i++){await wait(150);const next=fingerprint();if(next===baseline)break;baseline=next;}
    $('view-brain').click();await wait(100);
    check('Brain workspace reachable',!$('brain-view').hidden&&$('circuit-view').hidden&&$('view-brain').getAttribute('aria-pressed')==='true');
    for(const plane of ['xy','yz','xz','orbit']){change('brain-preset',plane);check('Preset '+plane,atlas.preset===plane);}
    change('brain-filter','readout');check('Learned readout filter',atlas.nodes.length===64&&atlas.nodes.every(i=>atlas.readoutSet.has(i)),atlas.nodes.length);
    change('brain-filter','inputs');check('Sensory input filter',atlas.nodes.length>0&&atlas.nodes.every(i=>atlas.inputSet.has(i)),atlas.nodes.length);
    change('brain-filter','descending');check('Annotated descending filter',atlas.nodes.length>0&&atlas.nodes.every(i=>sim.graph.classNames[sim.graph.classCodes[i]]==='descending_neuron'),atlas.nodes.length);
    change('brain-filter','active');check('Actual activity filter',atlas.nodes.every(i=>Math.abs(atlas.activity[i])>.002),atlas.nodes.length);
    change('brain-filter','all');
    const visualQuality=atlas.nodes.length;change('brain-quality','6000');check('Visual quality only',atlas.nodes.length<visualQuality&&sim.graph.n===166700,{displayed:atlas.nodes.length,neurons:sim.graph.n});change('brain-quality','18000');
    $('brain-density').value='0';$('brain-density').dispatchEvent(new Event('input',{bubbles:true}));check('Connection budget zero',atlas.activeEdges.length===0);
    $('brain-density').value='220';$('brain-density').dispatchEvent(new Event('input',{bubbles:true}));
    change('brain-color','activity');check('Activity colour mode',atlas.colorMode==='activity');change('brain-color','class');
    $('brain-search-form').closest('details').open=true;
    const realIndex=sim.graph.outputs.find(i=>atlas.coords.valid[i]),id=sim.graph.bodyIds[realIndex];
    $('brain-search').value=String(id);$('brain-search-form').requestSubmit();
    check('Real body ID search',atlas.selected===realIndex&&$('brain-selection-title').textContent.includes(String(id)),{id,selected:atlas.selected});
    const xyz=Array.from(sim.graph.positions.subarray(realIndex*3,realIndex*3+3));check('Real coordinates in details',xyz.every(v=>$('brain-selection-detail').textContent.includes(String(v))),xyz);
    $('brain-search').value='999999999999';$('brain-search-form').requestSubmit();check('Unknown ID error',Boolean($('brain-search-status').textContent));
    const missingIndex=atlas.coords.valid.findIndex(v=>!v);if(missingIndex>=0){$('brain-search').value=String(sim.graph.bodyIds[missingIndex]);$('brain-search-form').requestSubmit();check('Missing coordinate error',$('brain-search-status').textContent.includes('senza coordinate'));}
    $('brain-search-form').closest('details').open=false;
    const zoom=atlas.camera.zoom;$('brain-zoom-in').click();check('Zoom button',atlas.camera.zoom>zoom);
    $('brain-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    const yaw=atlas.camera.yaw;$('brain-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));check('Keyboard rotation',atlas.camera.yaw<yaw);
    $('brain-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check('Keyboard deselection',atlas.selected===-1&&$('brain-focus').disabled);
    $('brain-preset').value='orbit';$('brain-preset').dispatchEvent(new Event('change',{bubbles:true}));
    $('brain-live').click();check('Freeze atlas activity',atlas.frozen&&!sim.running);
    check('UI controls preserve paused neural/physical/optimizer state',fingerprint()===baseline);
    const capture={version:circuitLab.version,renderer:atlas.backend,points:atlas.nodes.length,coordinates:atlas.coords.indices.length,missingCoordinates:atlas.coords.missing,solver:sim.graph.solver,neuralGpu:sim.engine.gpu};
    const before={elapsed:sim.elapsed,generation:sim.generation};$('toggle-run').click();await wait(550);
    check('Atlas freeze does not stop simulation',atlas.frozen&&(sim.elapsed>before.elapsed||sim.generation>before.generation),{before,elapsed:sim.elapsed,generation:sim.generation});
    if(sim.running)$('toggle-run').click();await wait(400);$('brain-live').click();
    const inspectionFingerprint=()=>JSON.stringify({elapsed:sim.elapsed,generation:sim.generation,stats:sim.learningStats,cars:sim.cars.map(c=>[c.id,c.x,c.y,c.speed,c.fitness,c.outputs])}),beforeInspection=inspectionFingerprint();
    change('agent-select','1');await until(()=>sim.cars[1]?.brainSnapshot&&sim.cars[1].brain.activeCount>=7721&&atlas.carId===1);check('Atlas follows inspected agent',atlas.carId===1&&$('brain-agent').textContent.startsWith('A-02'),$('brain-agent').textContent);
    check('Paused inspection has full active sample without advancing physics',sim.cars[1].brain.activeCount>=7721&&inspectionFingerprint()===beforeInspection,{activeCount:sim.cars[1].brain.activeCount,elapsed:sim.elapsed});
    $('view-split').click();check('Split workspace',!$('brain-view').hidden&&!$('circuit-view').hidden);
    $('view-circuit').click();check('Circuit workspace',!$('circuit-view').hidden&&$('brain-view').hidden&&!$('camera-select').disabled);
    change('camera-select','follow');check('Interactive circuit camera',$('camera-select').value==='follow');change('camera-select','overview');
    $('view-brain').click();await wait(100);
    const glError=atlas.gl?atlas.gl.getError():null;check('Renderer error state',!atlas.contextLost&&(!atlas.gl||glError===0),{glError});
    const IDs=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);check('Unique DOM IDs',new Set(IDs).size===IDs.length);
    for(const model of ['v3','v2','v4']){
      change('controller-select',model);const started=performance.now();while(circuitLab.modelId!==model||$('controller-select').disabled){if(performance.now()-started>20000)throw Error('Timeout modello '+model);await wait(100);}
      const current=circuitLab.sim;if(current.running)$('toggle-run').click();await wait(250);
      const expected={v4:166700,v3:7721,v2:1121}[model];check('Atlas and model badge '+model,circuitLab.atlas.graph.n===expected&&$('model-badge').textContent.includes(model.toUpperCase()),{neurons:current.graph.n,points:circuitLab.atlas.nodes.length});
    }
    const current=circuitLab.sim;$('toggle-run').click();await wait(650);if(current.running)$('toggle-run').click();await wait(400);
    capture.neuralGpu=current.engine.gpu;capture.points=atlas.nodes.length;capture.agentLabel=$('brain-agent').textContent;
    return {checks,capture,glError,boundary:'UI/rendering regression check only. Not a learning-convergence benchmark.'};
  })()`,true);
  const screenshot=async(name,width,height,view)=>{
    window.setContentSize(width,height);await wc.executeJavaScript(`document.getElementById('view-${view}').click();window.scrollTo(0,0);`,true);await wait(180);
    const metrics=await wc.executeJavaScript(`(()=>{
      const canvas=document.getElementById('brain-canvas'),r=canvas.getBoundingClientRect(),controls=Array.from(document.querySelectorAll('button,select,input,summary')).filter(e=>e.getBoundingClientRect().width);
      const luminance=hex=>{const c=hex.trim().replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;},root=getComputedStyle(document.documentElement),bg=luminance(root.getPropertyValue('--panel'));
      return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,brain:{width:r.width,height:r.height},overflow:controls.filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.id||e.tagName),contrasts:Object.fromEntries(['paper','graphite','muted','coral','teal','amber'].map(k=>{const l=luminance(root.getPropertyValue('--'+k));return [k,(Math.max(l,bg)+.05)/(Math.min(l,bg)+.05)];})),trackingFloor:Math.min(...controls.map(e=>{const s=getComputedStyle(e);return s.letterSpacing==='normal'?0:parseFloat(s.letterSpacing)/parseFloat(s.fontSize);}))};
    })()`,true);
    const img=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),img.toPNG());
    return {...metrics,pngSize:img.getSize(),file:name+'.png'};
  };
  result.views={
    desktopBrain:await screenshot('desktop-brain',1540,980,'brain'),
    desktopSplit:await screenshot('desktop-split',1540,980,'split'),
    narrowBrain:await screenshot('narrow-brain',390,844,'brain')
  };
  result.runtimeVersion=version;result.generatedAt=new Date().toISOString();result.consoleErrors=errors;
  result.passed=result.checks.every(c=>c.passed)&&errors.length===0&&Object.values(result.views).every(v=>v.overflow.length===0&&v.documentWidth<=v.width&&v.contrasts.muted>=4.5&&v.trackingFloor>=-.04);
  await fs.writeFile(path.join(output,'ui-smoke.json'),JSON.stringify(result,null,2));
  console.log('UI_SMOKE '+JSON.stringify({passed:result.passed,checks:result.checks.length,version,output,renderer:result.capture.renderer,errors}));
  return result;
}
module.exports={run};
