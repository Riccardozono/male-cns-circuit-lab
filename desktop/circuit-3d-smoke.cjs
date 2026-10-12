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
      check(circuitId+': all required local environment assets finish loading',await js('circuitLab.circuit3D.environmentReady'));
      const original=await engine.exportProgress(),hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
      const beforeMotion=await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.x,c.y,c.heading,c.outputs,c.fitness]))');
      await change('camera-select','overview');await js('render()');
      const metrics=await js('circuitLab.circuit3D.info()');
      const landscapeExpected=circuitId!=='lab';
      check(circuitId+': offline NASA landscape and OSM districts cover the requested band without replacing the physical surface',landscapeExpected?metrics.landscape?.coverageM===(circuitId==='le-mans'?2000:1000)&&metrics.landscape.source==='NASA SRTMGL1 v003'&&metrics.landscape.physicalSurfaceUnchanged&&metrics.landscape.verticalScale===1&&metrics.districts?.buildings>50&&metrics.districts.drawCalls<=4&&!await js('document.getElementById("landscape-source-note").hidden'):!metrics.landscape&&!metrics.districts, {landscape:metrics.landscape,districts:metrics.districts});
      const transform=metrics.carLods?.livery?.transform;
      check(circuitId+': 100 real agents and bounded instanced LOD draw calls',metrics.carCount===100&&metrics.drawCalls<150&&metrics.carRevision==='992-user-glb-lod-3'&&metrics.carLods?.livery?.loaded&&JSON.stringify(transform)===JSON.stringify({offset:[0,2],scale:[1,-1]})&&metrics.roadVertices>20&&!metrics.lost,metrics);
      check(circuitId+': static estimated barriers/runoffs load locally',metrics.scenery?.geometryRevision==='circuit-scenery-1'&&metrics.scenery.estimated&&metrics.scenery.barrierSegments>50&&metrics.scenery.meshes<=9&&metrics.scenery.zones.every(z=>z.renderedTiles>0),metrics.scenery);
      check(circuitId+': supplied textured tree variants and physical terrain are present',metrics.terrain?.revision==='terrain-profile-1'&&metrics.terrain.estimated&&metrics.vegetation?.instances>20&&metrics.vegetation.supplied&&metrics.vegetation.variants===(landscapeExpected?10:2)&&metrics.vegetation.textures===(landscapeExpected?8:1)&&metrics.vegetation.drawCalls<=23, {terrain:metrics.terrain,vegetation:metrics.vegetation});
      if(['monza','le-mans'].includes(circuitId))check(circuitId+': dense mapped woodland uses both newly downloaded Sketchfab models',metrics.vegetation.woodlandTrees>5000&&metrics.vegetation.assets.some(a=>a.asset==='european-tree'&&a.instances>1000)&&metrics.vegetation.assets.some(a=>a.asset==='oak-tree'&&a.instances>1000),metrics.vegetation);
      const buildingsExpected=['monaco','le-mans'].includes(circuitId);
      check(circuitId+': licensed textured buildings appear only on Monaco and Le Mans',buildingsExpected?metrics.buildings?.buildings>20&&metrics.buildings.asset===circuitId&&metrics.buildings.textures>0&&metrics.buildings.drawCalls<=35:!metrics.buildings,metrics.buildings);
      check(circuitId+': estimated facilities contain stands, seats, pits and clear start supports',metrics.facilities?.revision==='track-facilities-1'&&metrics.facilities.estimated&&metrics.facilities.grandstands>0&&metrics.facilities.seats>100&&metrics.facilities.pitBuildings===1&&metrics.facilities.startGantry&&metrics.facilities.drawCalls<=3,metrics.facilities);
      check(circuitId+': environment loading/status has no missing asset error',!metrics.environmentError&&await js('document.getElementById("track-3d-status").textContent.includes("Alberi Sketchfab")'),metrics.environmentError);
      const detailsInitiallyOn=await js('document.getElementById("track-details").getAttribute("aria-pressed")==="true"');
      if(!detailsInitiallyOn)await js('document.getElementById("track-details").click();render()');
      await js('document.getElementById("track-details").click();render()');
      check(circuitId+': Details hides trees, buildings and facilities while paused',await js('!circuitLab.circuit3D.info().scenery.visible&&!circuitLab.circuit3D.vegetation.group.visible&&!circuitLab.circuit3D.facilities.group.visible&&(!circuitLab.circuit3D.buildings||!circuitLab.circuit3D.buildings.group.visible)&&(!circuitLab.circuit3D.districts||!circuitLab.circuit3D.districts.group.visible)'));
      await js('document.getElementById("track-details").click();render()');
      check(circuitId+': Details restores scenery without new physics',await js('circuitLab.circuit3D.info().scenery.visible')&&hash(await engine.exportProgress())===hash(original));
      await js('document.getElementById("track-zoom-in").click();document.getElementById("track-3d-canvas").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}));render()');
      if(landscapeExpected){
        await change('track-landmark','landscape');await js('render()');
        check(circuitId+': Landscape focus is camera-only, keeps paused progress and fits the extended world',hash(await engine.exportProgress())===hash(original)&&await js('circuitLab.circuit3D.mode==="overview"&&document.getElementById("track-landmark").value==="landscape"&&circuitLab.circuit3D.overviewScope==="landscape"&&Math.abs(circuitLab.circuit3D.distance-circuitLab.circuit3D.overviewDistance)<1e-6'));
        if(capture)await snap(circuitId+'-landscape',1540,980);
        await change('track-landmark','woodland');await js('render()');
        check(circuitId+': Bosco focus is accessible and preserves paused cars and training',hash(await engine.exportProgress())===hash(original)&&await js('document.getElementById("track-landmark").value==="woodland"&&circuitLab.circuit3D.mode==="overview"&&circuitLab.circuit3D.vegetation.info().assets.length===3'));
        if(capture&&['monza','le-mans'].includes(circuitId))await snap(circuitId+'-woodland',1540,980);
        await js('document.getElementById("track-reset").click();render()');
        check(circuitId+': reset returns from Landscape to the whole circuit with no training changes',hash(await engine.exportProgress())===hash(original)&&await js('document.getElementById("track-landmark").value===""&&circuitLab.circuit3D.mode==="overview"'));
      }
      await change('camera-select','follow');await js('render()');
      check(circuitId+': orbit/zoom/follow never alter physics or training',hash(await engine.exportProgress())===hash(original)&&await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.x,c.y,c.heading,c.outputs,c.fitness]))')===beforeMotion);
      await js(`(()=>{const select=document.getElementById('track-landmark'),option=[...select.options].find(o=>o.value.startsWith('facility:'));if(!option)throw Error('Facility selector unavailable');select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));render();})()`);
      check(circuitId+': stand focus is findable, paused-safe and reveals near seats',hash(await engine.exportProgress())===hash(original)&&await js('circuitLab.circuit3D.mode==="overview"&&circuitLab.circuit3D.info().facilities.seatInstances>0&&document.getElementById("track-landmark").value.startsWith("facility:")'));
      wc.focus();await js('document.getElementById("track-landmark").focus()');await wc.sendInputEvent({type:'keyDown',keyCode:'End'});await wc.sendInputEvent({type:'keyUp',keyCode:'End'});await wait(120);
      const keyboard=await js('({focus:document.activeElement.id,windowFocus:document.hasFocus(),selected:document.getElementById("track-landmark").value,pit:circuitLab.circuit3D.facilities.focuses.find(p=>p.kind==="pit").key})');
      check(circuitId+': keyboard selection reaches the pit focus without changing progress',keyboard.focus==='track-landmark'&&keyboard.selected===keyboard.pit&&hash(await engine.exportProgress())===hash(original),keyboard);
      await js(`(()=>{document.getElementById('track-details').click();const select=document.getElementById('track-landmark');select.value=circuitLab.circuit3D.facilities.focuses[0].key;select.dispatchEvent(new Event('change',{bubbles:true}));render();})()`);
      check(circuitId+': focusing a facility restores hidden Details without a training command',await js('document.getElementById("track-details").getAttribute("aria-pressed")==="true"&&circuitLab.circuit3D.facilities.info().visible')&&hash(await engine.exportProgress())===hash(original));
      for(const kind of ['stand','pit']){
        await js(`(()=>{const select=document.getElementById('track-landmark');select.value=circuitLab.circuit3D.facilities.focuses.find(p=>p.kind===${JSON.stringify(kind)}).key;select.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('track-3d-canvas').focus();})()`);wc.focus();await wc.sendInputEvent({type:'keyDown',keyCode:'Home'});await wc.sendInputEvent({type:'keyUp',keyCode:'Home'});await wait(120);
        check(circuitId+': Home from '+kind+' synchronizes whole-circuit selector/camera without progress changes',await js('document.getElementById("track-landmark").value===""&&trackFocus===""&&circuitLab.circuit3D.mode==="overview"&&Math.abs(circuitLab.circuit3D.distance-circuitLab.circuit3D.overviewDistance)<1e-6')&&hash(await engine.exportProgress())===hash(original)&&await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.x,c.y,c.heading,c.outputs,c.fitness]))')===beforeMotion);
      }
      await js(`(()=>{const select=document.getElementById('track-landmark');select.value=circuitLab.circuit3D.facilities.focuses[0].key;select.dispatchEvent(new Event('change',{bubbles:true}));render();})()`);
      if(capture&&circuitId!=='lab'){
        if(circuitId==='monaco')await snap('monaco-grandstand',1540,980,{scope:'Existing Inquadra control focuses an actual estimated placement. No car or learning state is staged.'});
        if(circuitId==='monza'){
          await js(`(()=>{const select=document.getElementById('track-landmark'),p=circuitLab.circuit3D.facilities.focuses.find(p=>p.kind==='pit');select.value=p.key;select.dispatchEvent(new Event('change',{bubbles:true}));render();})()`);
          check('Pit focus never changes paused learning state',hash(await engine.exportProgress())===hash(original));
          await js('document.getElementById("track-reset").click();render()');await snap('monza-overview',1540,980);
          await change('camera-select','follow');await js('render()');await snap('monza-follow',1540,980);
        }else{
          await change('track-landmark','district');await js('render()');
          check(circuitId+': building details are reachable through the normal selector without changing progress',hash(await engine.exportProgress())===hash(original)&&await js('document.getElementById("track-landmark").value==="district"&&circuitLab.circuit3D.districts.info().windows>0'));
          await snap(circuitId+'-district',1540,980,{scope:'Existing Inquadra selects actual mapped building detail. No staged cars or learning.'});
        }
      }
    }
    // Exercise live physical movement on the full graph at the requested cap.
    await change('circuit-select','monza');await until('circuitLab.sim.circuitId==="monza"&&circuitLab.sim.cars.length===100');await engine.command({type:'setSpeed',value:30});await engine.command({type:'pause',value:true});await js('circuitLab.sim.running=true');await until('circuitLab.sim.elapsed>.3');await js('circuitLab.sim.running=false');await engine.command({type:'pause',value:false});
    check('100-agent actual solver runs with finite independent pedals',await js('circuitLab.sim.cars.length===100&&circuitLab.sim.cars.every(c=>[c.x,c.y,c.speed,...c.outputs].every(Number.isFinite)&&Math.min(c.outputs[1],c.outputs[2])<=1e-9)'));
    const durations=await js('(()=>{const v=[];for(let i=0;i<25;i++){const start=performance.now();render();v.push(performance.now()-start);}return v;})()');
    check('Render timing sampled without neural ticks',durations.every(Number.isFinite),{medianMs:durations.slice().sort((a,b)=>a-b)[12],maxMs:Math.max(...durations),scope:'CPU submission time for 25 paused renders, not total GPU time or simulation throughput'});
    await js('document.getElementById("track-mode-2d").click()');await until('circuitLab.circuitView==="2d"');check('2D remains accessible without phantom facilities',await js('!document.getElementById("simulation-canvas").hidden&&document.getElementById("simulation-canvas").width>10&&![...document.getElementById("track-landmark").options].some(o=>o.value.startsWith("facility:"))'));
    await js('document.getElementById("track-mode-3d").click()');await until('circuitLab.circuitView==="3d"');
  }
  await js('document.getElementById("open-model-test").click()');check('Test entry remains visible and focuses Start',await js('document.getElementById("model-test-panel").open&&document.activeElement.id==="model-test-start"'));
  check('In-app environment author/license links remain findable',await js('document.querySelector(".track-asset-credit summary").textContent==="Modelli 3D e crediti"&&document.querySelector(".track-asset-credit").textContent.includes("00amza")&&document.querySelector(".track-asset-credit").textContent.includes("Satik64")&&document.querySelector(".track-asset-credit").textContent.includes("ChristosRami.studio")'));
  await js('document.getElementById("model-test-panel").open=false;document.getElementById("view-split").click()');check('Brain atlas and circuit can be displayed together',await js('!document.getElementById("brain-view").hidden&&!document.getElementById("circuit-view").hidden'));
  if(capture){await snap('desktop-split',1540,980);await js('document.getElementById("view-circuit").click()');await snap('desktop',1540,980);await snap('user-1280',1280,900);await snap('mobile',390,1100);await snap('mobile-opening',390,1100);}
  const unexpected=errors.filter(e=>!(forceCpuFallback&&/WebGL|context|GL context/i.test(e)));check('No unexpected renderer errors',unexpected.length===0,errors);
  const compute=await js('({workers:circuitLab.sim.engine?.pool?.size||null,gpu:circuitLab.sim.engine?.gpu||null})');
  const result={passed:true,version,forceCpuFallback,generatedAt:new Date().toISOString(),checks,views,compute,consoleErrors:errors,boundary:'Rendering and runtime checks, not learned laps or official car/track CAD validation.'};await fs.writeFile(path.join(output,'ui-smoke.json'),JSON.stringify(result,null,2));console.log('CIRCUIT_3D_QA '+JSON.stringify({passed:true,checks:checks.length,output}));return result;
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
