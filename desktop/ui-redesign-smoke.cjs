'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(window,{output,version}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,errors=[];
  const themeMode=process.argv.includes('--ui-theme-smoke');
  const firstPersonMode=process.argv.includes('--first-person-smoke');
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3){errors.push(details.message);console.error('UI_CONSOLE '+details.message);}});
  const result=await wc.executeJavaScript(`(async()=>{
    const $=id=>document.getElementById(id),wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
    const check=(name,ok,detail)=>{checks.push({name,passed:!!ok,detail});if(!ok)throw Error(name+' '+JSON.stringify(detail));};
    const until=async(fn)=>{const start=performance.now();while(!fn()){if(performance.now()-start>45000)throw Error('Timeout app '+JSON.stringify({ready:!!globalThis.circuitLab,inert:document.querySelector('main').inert,state:$('run-state')?.textContent,note:$('mode-note')?.textContent}));await wait(100);}};
    const change=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    await until(()=>globalThis.circuitLab?.sim?.engine&&!document.querySelector('main').inert);
    if(circuitLab.sim.running)$('toggle-run').click();await wait(800);
    change('circuit-select','monza');await wait(500);if(circuitLab.sim.running)$('toggle-run').click();await wait(500);
    const sim=circuitLab.sim;
    const fingerprint=()=>JSON.stringify({elapsed:sim.elapsed,generation:sim.generation,learning:sim.learningStats,history:sim.history,cars:sim.cars.map(c=>({id:c.id,x:c.x,y:c.y,heading:c.heading,outputs:c.outputs,fitness:c.fitness,genome:c.genome,activity:Array.from(c.brain.activity)}))});
    let baseline=fingerprint();for(let i=0;i<10;i++){await wait(150);const next=fingerprint();if(next===baseline)break;baseline=next;}
    check('Version is 5.7.0',circuitLab.version==='5.7.0');
    check('Configuration separate on left',$('session-config')?.contains($('controller-select'))&&$('session-config').contains($('speed-range')));
    check('Generation history empty state',!!$('generation-empty')&&!!$('generation-results'));
    const stage=$('visual-stage'),rect=$('track-3d-canvas').getBoundingClientRect();
    check('Large real 3D canvas',rect.width>800&&rect.height>=400,{width:rect.width,height:rect.height});
    $('open-model-test').click();await wait(150);
    check('Test opens independently',$('model-test-panel').open&&!$('model-test-panel').hidden&&!globalThis.circuitLab.modelTest?.running);
    check('Test navigation selected',$('open-model-test').getAttribute('aria-pressed')==='true'&&$('view-circuit').getAttribute('aria-pressed')==='false');
    check('Start focused but not executed',document.activeElement.id==='model-test-start');
    $('view-circuit').click();await wait(100);check('Session restores field',!$('model-test-panel').open&&$('model-test-panel').hidden&&stage.dataset.view==='circuit');
    $('view-brain').click();await wait(150);check('Brain reachable',!$('brain-view').hidden&&$('circuit-view').hidden);
    const atlas=circuitLab.atlas;change('brain-preset','xy');check('Atlas plane control',atlas.preset==='xy');change('brain-preset','orbit');
    $('brain-zoom-in').click();$('brain-map-reset').click();$('brain-live').click();check('Atlas freeze independent',atlas.frozen&&!sim.running);$('brain-live').click();
    $('view-split').click();await wait(100);check('Split remains interactive',!$('brain-view').hidden&&!$('circuit-view').hidden);
    $('view-circuit').click();await wait(100);change('camera-select','overview');await wait(150);check('3D overview preserved',$('camera-select').value==='overview');
    $('track-zoom-in').click();$('track-reset').click();$('toggle-sensors').click();$('toggle-sensors').click();$('track-details').click();$('track-details').click();$('track-boundaries').click();$('track-boundaries').click();
    check('Observation preserves neural physical learning state',fingerprint()===baseline);
    const theme=MaleCNSTheme.controller,themeButton=$('theme-toggle');
    theme.setTheme('light');baseline=fingerprint();
    themeButton.click();await wait(100);
    check('Dark theme is immediate and accessible',document.documentElement.dataset.theme==='dark'&&themeButton.getAttribute('aria-pressed')==='true'&&getComputedStyle(document.documentElement).colorScheme==='dark');
    check('Theme choice persisted separately',localStorage.getItem(MaleCNSTheme.STORAGE_KEY)==='dark');
    check('Theme never changes paused neural physical learning state',fingerprint()===baseline&&!sim.running);
    const graphDetails=document.querySelector('.history-details');graphDetails.open=true;await wait(150);
    const chart=$('history-canvas').getContext('2d'),darkInk=getComputedStyle(document.documentElement).getPropertyValue('--history-ink').trim();
    check('History text adopts dark palette while paused',chart.fillStyle===darkInk,{actual:chart.fillStyle,expected:darkInk});
    themeButton.click();await wait(100);
    const lightInk=getComputedStyle(document.documentElement).getPropertyValue('--history-ink').trim();
    check('Light theme and chart restored without resetting trial',theme.getTheme()==='light'&&chart.fillStyle===lightInk&&fingerprint()===baseline);
    graphDetails.open=false;await wait(100);
    $('agent-next').click();await wait(350);check('Next car inspection',$('agent-select').value==='1');$('agent-previous').click();await wait(350);check('Previous car inspection',$('agent-select').value==='0');$('follow-best').click();
    check('All range limits unchanged',$('population-range').max==='100'&&$('population-number').max==='100'&&$('speed-range').max==='30'&&$('mutation-range').max==='35');
    $('population-number').value='8';$('population-number').dispatchEvent(new Event('change',{bubbles:true}));await until(()=>sim.population===8&&sim.cars.length===8);
    check('Numeric population reaches actual worker via original control',sim.population===8&&$('population-range').value==='8');
    const beforeBlocked=sim.population;$('population-range').disabled=true;$('population-number').value='30';$('population-number').dispatchEvent(new Event('change',{bubbles:true}));
    check('Disabled range prevents numeric proxy changing training',sim.population===beforeBlocked&&$('population-number').value==='8');$('population-range').disabled=false;
    $('population-number').value='16';$('population-number').dispatchEvent(new Event('change',{bubbles:true}));await until(()=>sim.population===16&&sim.cars.length===16);
    const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);check('Unique IDs',ids.length===new Set(ids).size);
    check('Manual diagnostic controls remain',!!$('vehicle-gearbox')&&!!$('vehicle-abs')&&!!$('vehicle-tc')&&!!$('score-details'));
    check('Save controls remain version locked',!!$('save-progress')&&!!$('load-progress')&&$('progress-file-note').textContent.includes('5.7.0'));
    check('Actual selected car telemetry',$('agent-speed').textContent.includes('km/h')&&$('vehicle-rpm').textContent.includes('rpm'));
    const forceResume=$('toggle-run');forceResume.click();themeButton.click();
    check('Theme switch leaves running simulation running',sim.running&&theme.getTheme()==='dark');
    await wait(1000);if(sim.running)forceResume.click();await wait(500);
    check('Run and pause still advance only when running',sim.elapsed>0&&!sim.running,{elapsed:sim.elapsed});
    if(${firstPersonMode}){
      const fpSim=sim,beforeCamera=fingerprint(),viewer=circuitLab.circuit3D;
      const driverDescription=id=>{const surface=$('track-3d-canvas'),text=$('track-navigation-note').textContent;return surface.getAttribute('aria-label').includes('A-'+String(id+1).padStart(2,'0'))&&surface.getAttribute('aria-label').includes('prima persona')&&surface.getAttribute('aria-describedby').split(' ').includes('first-person-note')&&!$('first-person-note').hidden&&text.includes('frecce per guardare')&&text.includes('campo visivo')&&text.includes('Centra o Home')&&!text.includes('orbitare');};
      const exteriorDescription=()=>!$('track-3d-canvas').getAttribute('aria-label').includes('prima persona')&&!$('track-3d-canvas').getAttribute('aria-describedby').split(' ').includes('first-person-note')&&$('first-person-note').hidden&&$('track-navigation-note').textContent.includes('orbitare')&&$('track-navigation-note').textContent.includes('Maiusc');
      await viewer.modelReady;change('camera-select','first-person');await until(()=>viewer.mode==='first-person'&&viewer.driverAgentId!==undefined);
      check('First-person camera is tied to selected V5 car',viewer.driverAgentId===Number($('agent-select').value)&&viewer.cockpit.group.visible&&viewer.camera.fov===70);
      check('Focused first-person canvas describes chosen V5 driver and actual controls',driverDescription(viewer.driverAgentId));
      check('Selected exterior and overlays cannot obstruct first-person view',!viewer.selection.visible&&!viewer.rays.visible&&!viewer.markers.visible&&viewer.fleet.info().lodCounts[0]===0);
      viewer.look(20,-10);$('track-zoom-in').click();$('track-reset').click();await wait(100);
      check('Reset centres first-person without leaving selected car',viewer.mode==='first-person'&&viewer.lookYaw===0&&viewer.lookPitch===0&&viewer.camera.fov===70);
      check('First-person accessible instructions survive Centra',driverDescription(viewer.driverAgentId));
      check('First-person controls preserve paused V5 neural physical learning state',fingerprint()===beforeCamera&&!fpSim.running);
      $('track-mode-2d').click();await until(()=>circuitLab.circuitView==='2d');
      check('2D fallback has a valid follow mode',$('camera-select').value==='follow');
      check('2D navigation restores map instructions and removes driver description',$('first-person-note').hidden&&!$('track-navigation-note').textContent.includes('campo visivo'));
      change('camera-select','first-person');await until(()=>circuitLab.circuitView==='3d'&&viewer.mode==='first-person');
      check('Selecting first-person from 2D automatically opens actual 3D',!$('track-3d-canvas').hidden&&$('track-mode-3d').getAttribute('aria-pressed')==='true');
      change('controller-select','v2');await until(()=>circuitLab.sim.graph.modelId==='v2'&&!$('controller-select').disabled);if(circuitLab.sim.running)$('toggle-run').click();await wait(500);
      change('population-range','100');await until(()=>circuitLab.sim.population===100&&circuitLab.sim.cars.length===100);await wait(500);
      const selectedSim=circuitLab.sim,physical=()=>JSON.stringify({elapsed:selectedSim.elapsed,generation:selectedSim.generation,history:selectedSim.history,learning:selectedSim.learningStats,cars:selectedSim.cars.map(c=>({id:c.id,x:c.x,y:c.y,heading:c.heading,fitness:c.fitness,genome:c.genome}))});
      let snapshot=physical();for(let i=0;i<8;i++){await wait(100);if(physical()===snapshot)break;snapshot=physical();}
      change('camera-select','first-person');change('agent-select','90');await until(()=>viewer.driverAgentId===90);
      check('First-person selection includes A-91 in actual 100-agent population',viewer.driverAgentId===90&&selectedSim.cars.length===100&&viewer.fleet.carCount===100&&$('agent-select').value==='90');
      check('First-person accessible name identifies selected A-91',driverDescription(90));
      const expected=(await import('./circuit-3d.mjs')).driverCameraFrame(selectedSim.cars.find(c=>c.id===90),viewer.origin,viewer.ground,viewer.lookYaw,viewer.lookPitch);
      check('Actual camera is at the chosen driver eye',viewer.camera.position.distanceTo(expected.position)<1e-7,{position:viewer.camera.position.toArray(),expected:expected.position.toArray()});
      $('agent-next').click();await until(()=>viewer.driverAgentId===91);check('First-person follows manual car change',viewer.driverAgentId===91);
      check('First-person accessible name follows manual switch to A-92',driverDescription(91));
      check('Selection and camera do not mutate physical learning state',physical()===snapshot&&!selectedSim.running);
      change('camera-select','follow');await wait(100);check('Follow restores exterior accessible instructions',exteriorDescription()&&physical()===snapshot);
      change('camera-select','overview');await wait(100);check('Overview restores exterior accessible instructions',exteriorDescription()&&physical()===snapshot);
      change('camera-select','first-person');await wait(100);
      change('agent-select','90');$('view-split').click();await wait(200);
      check('Both real renderers remain accessible in first-person split',!$('brain-view').hidden&&!$('circuit-view').hidden&&viewer.mode==='first-person');
      const mainCanvas=$('track-3d-canvas');mainCanvas.focus();mainCanvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await wait(80);
      check('Keyboard head-look works without moving car',viewer.lookYaw>0&&physical()===snapshot);$('track-reset').click();
      return {checks,boundary:'Real selected-car first-person and split-layout regression, not convergence or manufacturer cockpit validation.'};
    }
    return {checks,boundary:'UI regression, not a convergence or throughput benchmark.'};
  })()`,true);
  const capture=async(name,width,height,view,openTest=false,theme='light',cameraMode='overview')=>{
    window.setContentSize(width,height);
    await wc.executeJavaScript(`MaleCNSTheme.controller.setTheme('${theme}');document.getElementById('view-${view}').click();${openTest?"document.getElementById('open-model-test').click();":''}document.getElementById('camera-select').value='${cameraMode}';document.getElementById('camera-select').dispatchEvent(new Event('change',{bubbles:true}));window.scrollTo(0,0);`,true);await wait(350);
    // A resize clears the WebGL backbuffer. Wait for layout, then request a
    // presentation-only atlas paint before the native screenshot is taken.
    if(firstPersonMode&&view==='split')await wc.executeJavaScript(`(async()=>{
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const atlas=circuitLab.atlas;atlas.resize();atlas.invalidate();atlas.render();
      if(atlas.gl)atlas.gl.finish();
    })()`,true);
    const metrics=await wc.executeJavaScript(`(()=>{const root=getComputedStyle(document.documentElement),lum=s=>{const c=s.trim().replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;},bg=lum(root.getPropertyValue('--panel')),controls=[...document.querySelectorAll('button,select,input,summary')].filter(e=>e.getBoundingClientRect().width);return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,overflow:controls.filter(e=>e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left< -1).map(e=>e.id||e.tagName),contrasts:Object.fromEntries(['paper','graphite','muted','coral','teal','amber'].map(k=>{const l=lum(root.getPropertyValue('--'+k));return[k,(Math.max(l,bg)+.05)/(Math.min(l,bg)+.05)];}))};})()`,true);
    const shot=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),shot.toPNG());return metrics;
  };
  result.views={};
  if(!process.argv.includes('--ui-redesign-no-capture')){
  if(firstPersonMode){
    result.views={user:await capture('user-2234',2234,1063,'split',false,'dark','first-person'),wide:await capture('split-dark',1440,980,'split',false,'dark','first-person'),narrow:await capture('split-1280',1280,900,'split',false,'dark','first-person'),light:await capture('split-light',1440,980,'split',false,'light','first-person'),single:await capture('driver-desktop',1440,980,'circuit',false,'dark','first-person'),mobile:await capture('driver-mobile',390,844,'split',false,'dark','first-person')};
    for(const [w,h]of [[2234,1063],[1440,980],[1280,900]]){
      window.setContentSize(w,h);await wc.executeJavaScript("document.getElementById('view-split').click();window.dispatchEvent(new Event('resize'))");await wait(200);
      const bounds=await wc.executeJavaScript("(()=>{const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};return {track:box('circuit-view'),brain:box('brain-view'),trackTitle:box('simulation-title'),brainTitle:box('brain-map-title'),trackBuffer:document.getElementById('track-3d-canvas').height};})()",true);
      result.checks.push({name:'Paired panel tops bottoms and title baselines aligned at '+w,passed:Math.abs(bounds.track.top-bounds.brain.top)<1&&Math.abs(bounds.track.bottom-bounds.brain.bottom)<1&&Math.abs(bounds.trackTitle.top-bounds.brainTitle.top)<1&&bounds.trackBuffer>0,detail:bounds});
    }
  }else if(themeMode){
    result.views={light:await capture('light-desktop',1440,980,'circuit'),dark:await capture('dark-desktop',1440,980,'circuit',false,'dark'),dark1280:await capture('dark-1280',1280,900,'circuit',false,'dark'),brain:await capture('dark-brain',1440,980,'brain',false,'dark'),test:await capture('dark-test',1440,980,'circuit',true,'dark'),mobile:await capture('dark-mobile',390,844,'circuit',false,'dark')};
  }else{
  result.views={hero:await capture('hero-repro',1586,992,'circuit'),desktop:await capture('desktop',1440,980,'circuit'),user1280:await capture('user-1280',1280,900,'circuit'),brain:await capture('desktop-brain',1440,980,'brain'),split:await capture('desktop-split',1440,980,'split'),test:await capture('desktop-test',1440,980,'circuit',true),mobile:await capture('mobile',390,844,'circuit')};
  }
  // Full-document proofs with the viewport held fixed; no viewport-height reflow.
  wc.debugger.attach('1.3');
  for(const [name,w,h]of [['desktop-full',1440,980],['mobile-full',390,844]]){
    window.setContentSize(w,h);await wc.executeJavaScript(`MaleCNSTheme.controller.setTheme('${themeMode||firstPersonMode?'dark':'light'}');document.documentElement.style.scrollbarGutter='stable';document.getElementById('view-${firstPersonMode?'split':'circuit'}').click();window.scrollTo(0,0)`);await wait(300);
    const layout=await wc.debugger.sendCommand('Page.getLayoutMetrics'),size=layout.cssContentSize;
    const shot=await wc.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width:w,height:size.height,scale:1}});
    await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
  }
  wc.debugger.detach();}
  if(themeMode){
    await wc.executeJavaScript("MaleCNSTheme.controller.setTheme('dark')");
    let reloadTimeout;
    await new Promise((resolve,reject)=>{reloadTimeout=setTimeout(()=>reject(Error('Theme reload timeout')),30000);wc.once('did-finish-load',resolve);wc.reload();}).finally(()=>clearTimeout(reloadTimeout));
    const restored=await wc.executeJavaScript("document.documentElement.dataset.theme==='dark'&&document.getElementById('theme-toggle').getAttribute('aria-pressed')==='true'&&localStorage.getItem(MaleCNSTheme.STORAGE_KEY)==='dark'",true);
    result.checks.push({name:'Actual page restart restores saved dark preference',passed:restored});
  }
  result.version=version;result.consoleErrors=errors;
  result.passed=result.checks.every(c=>c.passed)&&!errors.length&&Object.values(result.views).every(v=>!v.overflow.length&&v.documentWidth<=v.width&&v.contrasts.muted>=4.5);
  await fs.writeFile(path.join(output,'ui-redesign-smoke.json'),JSON.stringify(result,null,2));console.log('UI_REDESIGN '+JSON.stringify({passed:result.passed,checks:result.checks.length,errors,output}));return result;
}
module.exports={run};
