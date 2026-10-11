'use strict';
// Our application's own renderer; hidden window and disposable native profile.
const fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(window,{output,version,forceCpuFallback=false,capture=false}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,errors=[];
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message);});
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id),checks=[];
    const until=async(fn,timeout=30000)=>{const start=performance.now();while(!fn()){if(performance.now()-start>timeout)throw Error('Timeout verifica grafica auto');await wait(50);}};
    const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
    const change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    await until(()=>globalThis.circuitLab?.sim?.engine&&circuitLab?.carRenderer?.state==='ready');
    const sim=circuitLab.sim,r=circuitLab.carRenderer;let latest=null;
    const unsubscribe=desktopCompute.onSnapshot(s=>{if(s.cars)latest=s;});
    const pause=async()=>{sim.running=false;await until(()=>latest?.running===false&&latest?.engine?.modelId===sim.modelId);await wait(150);};
    await pause();await desktopCompute.command({type:'setWorkerCount',value:1});await until(()=>sim.engine.workerCount===1);
    change('circuit-select','monza');change('population-range',100);await until(()=>sim.cars.length===100&&sim.population===100);
    change('agent-select',99);sim.running=true;
    await until(()=>sim.cars[99]?.brainSnapshot&&sim.cars[99].brain.activeCount>=7721&&sim.cars.some(c=>c.distance>.01));
    await pause();await wait(250);
    check('App and native versions agree',circuitLab.version===${JSON.stringify(version)},circuitLab.version);
    check('Generated sprite ready through local app protocol',r.state==='ready'&&location.protocol==='male-cns:',r.status());
    check('Real alpha cutout',r.source.bounds.transparent>0&&r.source.bounds.opaque>0,r.source);
    check('Precomputed bounded colour and mip cache',r.status().colours===8&&r.status().cacheEntries===24&&r.status().cacheBytes<6*1024*1024,r.status());
    check('A-100 has its own preview',$('selected-agent-id').textContent==='A-100'&&$('car-visual-status').textContent.includes('A-100')&&$('car-preview').getAttribute('aria-label').includes('A-100'));
    const preview=$('car-preview'),pixels=preview.getContext('2d').getImageData(0,0,preview.width,preview.height).data;let previewPaint=0;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]>128)previewPaint++;
    check('Actual preview pixels, not a missing image placeholder',previewPaint>1000,{previewPaint,width:preview.width,height:preview.height});
    const fingerprint=()=>JSON.stringify({generation:sim.generation,elapsed:sim.elapsed,stats:sim.learningStats,track:sim.track,cars:sim.cars.map(c=>({id:c.id,x:c.x,y:c.y,heading:c.heading,speed:c.speed,steer:c.steer,outputs:c.outputs,vehicle:c.vehicle,reward:c.reward,penalty:c.penalty,fitness:c.fitness,genome:c.genome})),activity:Array.from(sim.cars[99].brain.activity)});
    const baseline=fingerprint(),builds=r.builds,car=sim.cars[99],scratch=document.createElement('canvas');scratch.width=512;scratch.height=256;const ctx=scratch.getContext('2d');
    for(const length of [4,24,100,250])for(const c of sim.cars)r.drawLocal(ctx,c,{color:['#ff7658','#68d3c5','#f0bd69','#a6b4ff','#d7a4dd','#8ccf8b','#f5df91','#77b7dc'][c.id%8],pixelLength:length});
    check('400 multi-LOD draws build no new materials',r.builds===builds&&r.draws.dot>=100&&r.draws.sprite>=300,r.status());
    check('Renderer reads actual steering/brake channels',MaleCNSCars.displayState(car).steering===car.steer*.58&&MaleCNSCars.displayState(car).braking===(car.alive&&car.outputs[2]>.02),{state:MaleCNSCars.displayState(car),steer:car.steer,brake:car.outputs[2]});
    $('car-closeup').click();await wait(80);
    check('Close-up selects follow, preserves selected agent and keyboard focus',$('camera-select').value==='follow'&&circuitLab.trackCamera.followZoom===6&&$('selected-agent-id').textContent==='A-100'&&document.activeElement===$('simulation-canvas'));
    $('track-zoom-out').click();$('track-zoom-in').click();$('toggle-sensors').click();$('toggle-sensors').click();$('view-brain').click();$('view-split').click();await wait(200);
    check('Graphic controls preserve physics, neural activity, rewards and optimizer',fingerprint()===baseline);
    check('100 cars retain finite independent physical telemetry',sim.cars.length===100&&sim.cars.every(c=>[c.x,c.y,c.speed,c.fitness,...c.outputs].every(Number.isFinite)));
    check('Gas/brake remain exclusive',sim.cars.every(c=>Math.min(c.outputs[1],c.outputs[2])<=1e-9));
    check('Correct GPU/CPU backend',${forceCpuFallback}?sim.engine.gpu.state==='fallback':sim.engine.gpu.state==='active',sim.engine.gpu);
    check('Physics and learning compatibility retained',MaleCNSVehicle.REVISION==='992-gt3r-si-1'&&FlySim.checkpointKey(sim.circuitId,sim.circuit.revision).startsWith('malecns-circuit-v46-992-gt3r-si-1-')&&sim.graph.learning.length===202&&sim.graph.n===166700);
    const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);check('No duplicate DOM IDs',ids.length===new Set(ids).size);
    unsubscribe();return {version:circuitLab.version,checks,renderer:r.status(),gpu:sim.engine.gpu,population:sim.population,boundary:'Read-only car graphic and short 100-agent runtime verification, not a 3D mesh, manufacturer certification, FPS benchmark or learning-convergence test.'};
  })()`,true);
  // One batched finish review: interactive map + atlas, car detail, narrow UI.
  if(capture){
    result.views={};
    const views=[['desktop-map',1540,980,"document.getElementById('view-split').click();window.scrollTo(0,0)"],['desktop-car',1540,980,"document.getElementById('car-preview').scrollIntoView({block:'center'})"],['narrow-car',390,844,"document.getElementById('car-preview').scrollIntoView({block:'center'})"],['narrow-map',390,844,"document.getElementById('car-closeup').click()"]];
    for(const [name,width,height,script]of views){
      window.setContentSize(width,height);await wc.executeJavaScript(script,true);await wait(200);
      const metrics=await wc.executeJavaScript(`(()=>{
        const visible=Array.from(document.querySelectorAll('button,select,input,summary')).filter(e=>e.getBoundingClientRect().width);
        const root=getComputedStyle(document.documentElement),lum=key=>{const c=root.getPropertyValue('--'+key).trim().slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;},bg=lum('panel');
        const p=document.getElementById('car-preview').getBoundingClientRect(),s=getComputedStyle(document.querySelector('.vehicle-visual'));
        return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,overflow:visible.filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.id||e.tagName),preview:{width:p.width,height:p.height,marginBottom:s.marginBottom},contrasts:Object.fromEntries(['paper','graphite','muted'].map(k=>[k,(Math.max(lum(k),bg)+.05)/(Math.min(lum(k),bg)+.05)])),trackingFloor:Math.min(...visible.map(e=>{const s=getComputedStyle(e);return s.letterSpacing==='normal'?0:parseFloat(s.letterSpacing)/parseFloat(s.fontSize);})),status:document.getElementById('car-visual-status').textContent};
      })()`,true);
      const img=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),img.toPNG());result.views[name]={...metrics,file:name+'.png'};
    }
  }
  result.runtimeVersion=version;result.generatedAt=new Date().toISOString();result.forceCpuFallback=forceCpuFallback;result.consoleErrors=errors;
  result.passed=result.checks.every(c=>c.passed)&&errors.length===0&&Object.values(result.views||{}).every(v=>v.documentWidth<=v.width&&!v.overflow.length&&v.contrasts.graphite>=4.5&&v.contrasts.muted>=4.5&&v.trackingFloor>=-.04);
  await fs.writeFile(path.join(output,'car-visual-smoke.json'),JSON.stringify(result,null,2));console.log('CAR_VISUAL_SMOKE '+JSON.stringify({passed:result.passed,checks:result.checks.length,version,output,errors}));return result;
}
module.exports={run};
