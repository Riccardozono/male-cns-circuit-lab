'use strict';
// Only exercises this application's own renderer. Separate hidden test/profile.
const fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function run(window,{output,version}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,errors=[];
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message);});
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id),checks=[],circuits=[];
    const check=(name,passed,detail)=>{checks.push({name,passed:Boolean(passed),detail});if(!passed)throw Error(name+' · '+JSON.stringify(detail));};
    const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    const start=performance.now();while(!globalThis.circuitLab?.tracks||!globalThis.circuitLab?.sim?.engine){if(performance.now()-start>30000)throw Error('Timeout circuito');await wait(100);}
    $('view-circuit').click();if(circuitLab.sim.running)$('toggle-run').click();
    if(circuitLab.tracks.boundaries)$('track-boundaries').click();
    if(!circuitLab.tracks.details)$('track-details').click();await wait(800);
    const sim=circuitLab.sim;
    const fingerprint=()=>JSON.stringify({elapsed:sim.elapsed,generation:sim.generation,learning:sim.learningStats,random:sim.random.state,cars:sim.cars.map(c=>({x:c.x,y:c.y,heading:c.heading,outputs:c.outputs,reward:c.reward,penalty:c.penalty,genome:c.genome,active:c.brain.activeCount,activity:Array.from(c.brain.activity)}))});
    for(const id of ['lab','monza','monaco','le-mans']){
      change('circuit-select',id);await wait(450);
      let baseline=fingerprint();for(let i=0;i<10;i++){await wait(100);const next=fingerprint();if(next===baseline)break;baseline=next;}
      const tracks=circuitLab.tracks;
      check(id+' exact render/physics polygons',JSON.stringify(tracks.model.outer.points)===JSON.stringify(sim.track.outer.map(p=>({x:p.x,y:p.y})))&&JSON.stringify(tracks.model.inner.points)===JSON.stringify(sim.track.inner.map(p=>({x:p.x,y:p.y}))));
      if(id!=='lab'){
        const reference=tracks.model.curbReference;
        check(id+' explicit documented curb zones',tracks.model.curbSegments.length===({monza:7,monaco:5,'le-mans':7})[id]&&reference?.coverage==='partial'&&reference.referenceYear===2025);
        check(id+' visible primary curb reference',!$('track-curb-reference').hidden&&$('track-curb-source').href===reference.url&&$('track-model-note').textContent.includes('non un rilievo completo'));
      }
      const before=circuitLab.trackView.scale;$('track-zoom-in').click();check(id+' zoom button',circuitLab.trackView.scale>before);
      const zoom=circuitLab.trackCamera.zoom;
      $('simulation-canvas').dispatchEvent(new WheelEvent('wheel',{deltaY:-40,clientX:650,clientY:540,bubbles:true,cancelable:true}));
      check(id+' wheel zoom',circuitLab.trackCamera.zoom>zoom);
      const center=circuitLab.trackCamera.center.x;$('simulation-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
      check(id+' keyboard pan',circuitLab.trackCamera.center.x!==center);
      change('track-landmark','start');check(id+' focus start',circuitLab.trackCamera.zoom>=6&&$('track-landmark').value==='start');
      if(sim.circuit.landmarks.length){change('track-landmark','0');check(id+' named curve focus',circuitLab.trackCamera.center.x===sim.circuit.landmarks[0].x);}
      $('track-details').click();check(id+' minimal graphics',!tracks.details);$('track-details').click();
      $('track-boundaries').click();check(id+' real boundaries overlay',tracks.boundaries);
      check(id+' visual controls preserve physics and neural state',fingerprint()===baseline);
      const v=circuitLab.trackView,road=new Path2D();for(const edge of [sim.track.outer,sim.track.inner]){edge.forEach((p,i)=>i?road.lineTo(p.x,p.y):road.moveTo(p.x,p.y));road.closePath();}
      const ctx=$('simulation-canvas').getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);
      let onRoad=0;for(let i=0;i<sim.track.center.length;i+=Math.max(1,Math.floor(sim.track.center.length/70))){const p=sim.track.center[i];if(ctx.isPointInPath(road,p.x,p.y,'evenodd'))onRoad++;}ctx.restore();
      check(id+' exact evenodd road fill',onRoad>=69,{samples:onRoad});
      const tileInfo=tracks.info();check(id+' cache pixel budget',tileInfo.tiles<=48&&tileInfo.cacheBytes<30*1024*1024,tileInfo);
      $('track-boundaries').click();$('track-reset').click();await wait(50);
      const misses=tracks.cache.misses;$('camera-select').dispatchEvent(new Event('change',{bubbles:true}));
      check(id+' static road reuse',tracks.cache.misses===misses,{newTiles:tracks.info().newTiles});
      circuits.push({id,curbSpans:tracks.info().curbSpans,vertices:sim.track.outer.length+sim.track.inner.length,cache:tracks.info()});
    }
    const IDs=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);check('Unique DOM IDs',new Set(IDs).size===IDs.length);
    change('circuit-select','monza');await wait(350);$('track-reset').click();
    return {checks,circuits,version:circuitLab.version,neuralGpu:sim.engine.gpu,boundary:'Read-only circuit visualization checks. Not a performance or learning-convergence benchmark.'};
  })()`,true);
  const capture=async(name,width,height,code='')=>{
    window.setContentSize(width,height);await wc.executeJavaScript(`document.getElementById('view-circuit').click();window.scrollTo(0,0);${code}`,true);await wait(180);
    const metrics=await wc.executeJavaScript(`(()=>{
      const r=document.getElementById('simulation-canvas').getBoundingClientRect(),controls=Array.from(document.querySelectorAll('button,select,input,summary')).filter(e=>e.getBoundingClientRect().width);
      return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,canvas:{width:r.width,height:r.height},overflow:controls.filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.id||e.tagName),view:circuitLab.trackView,cache:circuitLab.tracks.info()};
    })()`,true);
    const screenshot=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),screenshot.toPNG());
    // Canvas export is app-owned media: an unobstructed map proof.
    const png=await wc.executeJavaScript(`document.getElementById('simulation-canvas').toDataURL('image/png').split(',')[1]`);
    await fs.writeFile(path.join(output,name+'-map.png'),Buffer.from(png,'base64'));
    return {...metrics,file:name+'.png',map:name+'-map.png'};
  };
  result.views={
    monza:await capture('monza-overview',1540,980),
    monzaDetail:await capture('monza-detail',1540,980,`document.getElementById('track-landmark').value='0';document.getElementById('track-landmark').dispatchEvent(new Event('change'));`),
    monaco:await capture('monaco-overview',1540,980,`document.getElementById('circuit-select').value='monaco';document.getElementById('circuit-select').dispatchEvent(new Event('change'));`),
    monacoDetail:await capture('monaco-detail',1540,980,`document.getElementById('track-landmark').value='3';document.getElementById('track-landmark').dispatchEvent(new Event('change'));`),
    lemans:await capture('lemans-overview',1540,980,`document.getElementById('circuit-select').value='le-mans';document.getElementById('circuit-select').dispatchEvent(new Event('change'));`),
    lemansDetail:await capture('lemans-detail',1540,980,`document.getElementById('track-landmark').value='0';document.getElementById('track-landmark').dispatchEvent(new Event('change'));`),
    narrow:await capture('narrow-monza',390,844,`document.getElementById('circuit-select').value='monza';document.getElementById('circuit-select').dispatchEvent(new Event('change'));`),
    split:await capture('metric-split',1540,980,`document.getElementById('view-split').click();`)
  };
  result.generatedAt=new Date().toISOString();result.runtimeVersion=version;result.consoleErrors=errors;
  result.passed=result.checks.every(c=>c.passed)&&errors.length===0&&Object.values(result.views).every(v=>v.documentWidth<=v.width&&v.overflow.length===0&&v.cache.cacheBytes<30*1024*1024);
  await fs.writeFile(path.join(output,'track-smoke.json'),JSON.stringify(result,null,2));
  console.log('TRACK_SMOKE '+JSON.stringify({passed:result.passed,version,checks:result.checks.length,output,errors}));return result;
}
module.exports={run};
