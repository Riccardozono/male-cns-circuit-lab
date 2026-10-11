'use strict';
// Disposable native renderer/geometry QA; never a driving demonstration.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function run(window,{output,engine,version,forceCpuFallback,capture}){
  await fs.mkdir(output,{recursive:true});const checks=[],errors=[],views={},wc=window.webContents,wait=ms=>new Promise(r=>setTimeout(r,ms));
  wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
  const js=async code=>{try{return await wc.executeJavaScript(code,true);}catch(e){throw Error(e.message+' PROBE '+code+' CONSOLE '+JSON.stringify(errors));}};
  const until=async code=>{const start=Date.now();while(!await js(code)){if(Date.now()-start>120000)throw Error('QA timeout: '+code+' '+JSON.stringify(errors));await wait(50);}};
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' '+JSON.stringify(detail));};
  const change=(id,value)=>js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until('Boolean(globalThis.circuitLab?.sim?.engine?.sessionId)&&!document.querySelector("main").inert');
  await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});await engine.command({type:'setWorkerCount',value:1});await js('circuitLab.sim.reconnect()');
  check('Native and visible app versions agree',await js(`circuitLab.version===${JSON.stringify(version)}`));
  check('Learning and point charts are explicitly separated',await js('document.getElementById("history-mode").value==="progress"&&document.getElementById("learning-distance")!==null'));
  if(forceCpuFallback&&await js('circuitLab.circuitView!=="3d"')){
    check('Unavailable 3D leaves the live 2D map usable',await js('!document.getElementById("simulation-canvas").hidden&&document.getElementById("track-3d-status").textContent.includes("2D")'));
  }else{
    check('The actual 3D view starts in car-follow mode',await js('circuitLab.circuitView==="3d"&&circuitLab.circuit3D.mode==="follow"'));
    check('The user-supplied GLB loads locally with textures and LODs',await js('circuitLab.circuit3D.modelReady'),await js('circuitLab.circuit3D.info()'));
    await engine.command({type:'setPopulation',value:100});await until('circuitLab.sim.cars.length===100');
    for(const circuitId of ['lab','monza','monaco','le-mans']){
      await change('circuit-select',circuitId);await until(`circuitLab.sim.circuitId===${JSON.stringify(circuitId)}&&circuitLab.sim.cars.length===100`);await engine.command({type:'pause',value:false});
      const original=await engine.exportProgress(),hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
      const beforeMotion=await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.x,c.y,c.heading,c.outputs,c.fitness]))');
      await change('camera-select','overview');await js('render()');
      const metrics=await js('circuitLab.circuit3D.info()');
      const transform=metrics.carLods?.livery?.transform;
      check(circuitId+': 100 real agents and bounded instanced LOD draw calls',metrics.carCount===100&&metrics.drawCalls<150&&metrics.carRevision==='992-user-glb-lod-3'&&metrics.carLods?.livery?.loaded&&JSON.stringify(transform)===JSON.stringify({offset:[0,2],scale:[1,-1]})&&metrics.roadVertices>20&&!metrics.lost,metrics);
      check(circuitId+': static estimated barriers/runoffs load locally',metrics.scenery?.geometryRevision==='circuit-scenery-1'&&metrics.scenery.estimated&&metrics.scenery.barrierSegments>50&&metrics.scenery.meshes<=9&&metrics.scenery.zones.every(z=>z.renderedTiles>0),metrics.scenery);
      check(circuitId+': physical estimated elevation and static vegetation are present',metrics.terrain?.revision==='terrain-profile-1'&&metrics.terrain.estimated&&metrics.vegetation?.instances>20&&metrics.vegetation.drawCalls<=3, {terrain:metrics.terrain,vegetation:metrics.vegetation});
      const detailsInitiallyOn=await js('document.getElementById("track-details").getAttribute("aria-pressed")==="true"');
      if(!detailsInitiallyOn)await js('document.getElementById("track-details").click();render()');
      await js('document.getElementById("track-details").click();render()');
      check(circuitId+': Details hides scenery while paused',await js('!circuitLab.circuit3D.info().scenery.visible&&!circuitLab.circuit3D.vegetation.group.visible'));
      await js('document.getElementById("track-details").click();render()');
      check(circuitId+': Details restores scenery without new physics',await js('circuitLab.circuit3D.info().scenery.visible')&&hash(await engine.exportProgress())===hash(original));
      await js('document.getElementById("track-zoom-in").click();document.getElementById("track-3d-canvas").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}));render()');
      await change('camera-select','follow');await js('render()');
      check(circuitId+': orbit/zoom/follow never alter physics or training',hash(await engine.exportProgress())===hash(original)&&await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.x,c.y,c.heading,c.outputs,c.fitness]))')===beforeMotion);
      if(capture&&circuitId!=='lab'){
        await change('camera-select','overview');await snap(circuitId+'-overview',1540,980);
        const focusLabels={monza:'Prima Variante · T1',monaco:'Sainte-Dévote','le-mans':'Chicane Dunlop'};
        await js(`(()=>{const select=document.getElementById('track-landmark'),option=[...select.options].find(o=>o.value.startsWith('width:')&&o.textContent.startsWith(${JSON.stringify(focusLabels[circuitId]+' · ')}));if(!option)throw Error('Named runoff UI focus unavailable');select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));circuitLab.circuit3D.distance=145;circuitLab.circuit3D.pitch=1.05;render();})()`);
        const focusBefore=hash(original),focusAfter=hash(await engine.exportProgress());
        check(circuitId+': named runoff UI focus preserves paused progress',focusBefore===focusAfter);
        await snap(circuitId+'-runoff',1540,980,{pausedProgress:{before:focusBefore,after:focusAfter,unchanged:focusBefore===focusAfter}});
        if(circuitId==='monaco'){
          await js(`(()=>{const select=document.getElementById('track-landmark'),option=[...select.options].find(o=>o.value.startsWith('width:')&&o.textContent.includes('Beau Rivage'));select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));circuitLab.circuit3D.distance=170;circuitLab.circuit3D.pitch=.32;circuitLab.circuit3D.yaw=2.3;render();})()`);
          await snap('monaco-elevation',1540,980,{pausedProgress:{before:focusBefore,after:hash(await engine.exportProgress()),unchanged:focusBefore===hash(await engine.exportProgress())}});
        }
        if(circuitId==='monza'){
          await change('camera-select','follow');
          await js('if(document.getElementById("toggle-sensors").getAttribute("aria-pressed")==="true")document.getElementById("toggle-sensors").click()');
          // Camera-only observation inside the ordinary zoom range. No car,
          // physical pose or controller state is positioned for the pictures.
          for(const [name,yaw,pitch]of [['monza-car',Math.PI/2+.20,.30],['monza-car-left',Math.PI,.24],['monza-car-right',0,.24],['monza-car-rear',-Math.PI/2-.15,.30]]){
            await js(`circuitLab.circuit3D.followDistance=6;circuitLab.circuit3D.yaw=${yaw};circuitLab.circuit3D.pitch=${pitch};render()`);await snap(name,1540,980);
          }
          await js('document.getElementById("toggle-sensors").click()');
        }
      }
    }
    // Exercise live physical movement on the full graph at the requested cap.
    await change('circuit-select','monza');await engine.command({type:'setSpeed',value:30});await js('circuitLab.sim.running=true');await until('circuitLab.sim.elapsed>.3');await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});
    check('100-agent actual solver runs with finite independent pedals',await js('circuitLab.sim.cars.length===100&&circuitLab.sim.cars.every(c=>[c.x,c.y,c.speed,...c.outputs].every(Number.isFinite)&&Math.min(c.outputs[1],c.outputs[2])<=1e-9)'));
    const durations=await js('(()=>{const v=[];for(let i=0;i<25;i++){const start=performance.now();render();v.push(performance.now()-start);}return v;})()');
    check('Render timing sampled without neural ticks',durations.every(Number.isFinite),{medianMs:durations.slice().sort((a,b)=>a-b)[12],maxMs:Math.max(...durations),scope:'CPU submission time for 25 paused renders, not total GPU time or simulation throughput'});
    await js('document.getElementById("track-mode-2d").click()');await until('circuitLab.circuitView==="2d"');check('2D remains accessible',await js('!document.getElementById("simulation-canvas").hidden&&document.getElementById("simulation-canvas").width>10'));
    await js('document.getElementById("track-mode-3d").click()');await until('circuitLab.circuitView==="3d"');
  }
  await js('document.getElementById("open-model-test").click()');check('Test entry remains visible and focuses Start',await js('document.getElementById("model-test-panel").open&&document.activeElement.id==="model-test-start"'));
  await js('document.getElementById("model-test-panel").open=false;document.getElementById("view-split").click()');check('Brain atlas and circuit can be displayed together',await js('!document.getElementById("brain-view").hidden&&!document.getElementById("circuit-view").hidden'));
  if(capture){await snap('desktop-split',1540,980);await js('document.getElementById("view-circuit").click()');await snap('desktop',1540,980);await snap('user-1280',1280,900);await snap('mobile',390,1100);await snap('mobile-opening',390,1100);}
  const unexpected=errors.filter(e=>!(forceCpuFallback&&/WebGL|context|GL context/i.test(e)));check('No unexpected renderer errors',unexpected.length===0,errors);
  const result={passed:true,version,forceCpuFallback,generatedAt:new Date().toISOString(),checks,views,consoleErrors:errors,boundary:'Rendering and runtime checks, not learned laps or official car/track CAD validation.'};await fs.writeFile(path.join(output,'ui-smoke.json'),JSON.stringify(result,null,2));console.log('CIRCUIT_3D_QA '+JSON.stringify({passed:true,checks:checks.length,output}));return result;
  async function snap(name,width,height,extra={}){
    window.setSize(width,height);await js('window.scrollTo(0,0);resize();render()');await wait(200);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const metrics={...await js('({width:innerWidth,documentWidth:document.documentElement.scrollWidth,duplicateIds:document.querySelectorAll("[id]").length-new Set([...document.querySelectorAll("[id]")].map(e=>e.id)).size,focusSelection:document.getElementById("track-landmark").selectedOptions[0]?.textContent,camera:circuitLab.circuit3D?{mode:circuitLab.circuit3D.mode,focus:circuitLab.circuit3D.focus.toArray(),distance:circuitLab.circuit3D.distance,yaw:circuitLab.circuit3D.yaw,pitch:circuitLab.circuit3D.pitch}:null,three:circuitLab.circuit3D?.info()})'),...extra};
    check(name+': responsive without overflow/duplicate IDs',metrics.documentWidth<=metrics.width+1&&metrics.duplicateIds===0,metrics);
    if(!wc.debugger.isAttached())wc.debugger.attach('1.3');const full=name==='desktop'||name==='mobile',layout=full?await wc.debugger.sendCommand('Page.getLayoutMetrics'):null;
    const options={format:'png',captureBeyondViewport:full,fromSurface:true};if(full)options.clip={x:0,y:0,width:layout.cssContentSize.width,height:layout.cssContentSize.height,scale:1};
    const {data}=await wc.debugger.sendCommand('Page.captureScreenshot',options);await fs.writeFile(path.join(output,name+'.png'),Buffer.from(data,'base64'));views[name]={...metrics,file:name+'.png',fullPage:full};
  }
}
module.exports={run};
