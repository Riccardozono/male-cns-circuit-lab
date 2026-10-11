'use strict';
// Own-app diagnostic only, run in a fresh disposable Electron profile.
const fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(window,{output,version,forceCpuFallback=false,capture=false}){
  await fs.mkdir(output,{recursive:true});
  const wc=window.webContents,errors=[];
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message);});
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id),checks=[];
    const until=async(predicate,label,timeout=30000)=>{const start=performance.now();while(!predicate()){if(performance.now()-start>timeout)throw Error('Timeout '+label+' '+JSON.stringify({elapsed:globalThis.circuitLab?.sim?.elapsed,gpu:globalThis.circuitLab?.sim?.engine?.gpu,agent:$('brain-agent')?.textContent,selected:$('agent-select')?.value,gearUpDisabled:$('gear-up')?.disabled,vehicle:globalThis.circuitLab?.sim?.cars[99]?.vehicle}));await wait(50);}};
    const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
    const change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new Event('input',{bubbles:true}));$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    await until(()=>globalThis.circuitLab?.sim?.engine&&$('run-state').textContent!=='AVVIO','avvio');
    const sim=circuitLab.sim;let latest=null;
    const unsubscribe=desktopCompute.onSnapshot(s=>{if(s.cars)latest=s;});
    const pause=async()=>{latest=null;sim.running=false;await until(()=>latest?.running===false,'pausa');await wait(180);};
    await pause();
    check('Source and native versions agree',circuitLab.version===${JSON.stringify(version)});
    check('992 physics dependency and SI revision loaded',FlySim.Vehicle===MaleCNSVehicle&&sim.cars[0].vehicle.revision===MaleCNSVehicle.REVISION);
    check('28 real sensor channels and 202 learned parameters',FlySim.SENSOR_COUNT===28&&sim.graph.learning.length===202,{sensors:FlySim.SENSOR_COUNT,parameters:sim.graph.learning.length});
    check('Full anatomical graph retained',sim.graph.n===166700&&sim.graph.edgeCount===6242118,{nodes:sim.graph.n,edges:sim.graph.edgeCount});
    check('Physics checkpoint isolation',FlySim.checkpointKey('monza',1).includes('v46-992-gt3r-si-1'));
    await desktopCompute.command({type:'setWorkerCount',value:1});await until(()=>sim.engine.workerCount===1,'worker singolo');
    change('circuit-select','monza');change('population-range',100);await until(()=>sim.circuitId==='monza'&&sim.cars.length===100,'Monza 100 auto');
    change('agent-select',99);sim.speedMultiplier=1;sim.running=true;
    await until(()=>sim.cars[99]?.brainSnapshot&&sim.cars[99].brain.activeCount>=7721&&sim.cars.some(c=>c.vehicle.speedMps>.1),'IA e fisica');await pause();
    check('100 Porsche agents, compact unselected wheel telemetry',sim.cars.every(c=>c.vehicle.modelId===MaleCNSVehicle.SPEC.id)&&sim.cars.length===100&&sim.cars.filter(c=>c.vehicle.wheels).length===1&&sim.cars[99].vehicle.wheels.length===4);
    check('Only selected neural snapshot is full',sim.cars.filter(c=>c.brainSnapshot).length===1&&sim.cars[99].brain.activeCount>=7721);
    check('Hybrid backend operational',${forceCpuFallback}?sim.engine.gpu.state==='fallback':sim.engine.gpu.state==='active',sim.engine.gpu);
    check('Every physical state finite, pedals exclusive',sim.cars.every(c=>[c.x,c.y,c.vehicle.speedMps,c.vehicle.rpm,c.totalG].every(Number.isFinite)&&Math.min(c.outputs[1],c.outputs[2])===0));
    check('UI speed is km/h, not arbitrary map units',$('agent-speed').textContent.includes('km/h'),$('agent-speed').textContent);
    const physical=()=>JSON.stringify({elapsed:sim.elapsed,generation:sim.generation,stats:sim.learningStats,cars:sim.cars.map(c=>[c.x,c.y,c.speed,c.vehicle.speedMps,c.vehicle.rpm,c.vehicle.fuelL,c.vehicle.shiftRemaining,c.vehicle.gear,c.fitness])});
    const before=physical();await wait(450);check('Pause freezes body, fuel, RPM, shifts and learning',before===physical());
    change('agent-select',98);await until(()=>sim.cars[98]?.vehicle.wheels?.length===4,'telemetria in pausa');await wait(500);
    // A pause can invalidate an in-flight GPU tick. In that documented state
    // the observer must wait for resume, not invent a full activity sample.
    const observed=sim.cars[98].brainSnapshot&&sim.cars[98].brain.activeCount>=7721;
    check('Paused observer is read-only or explicitly waiting',before===physical()&&(observed||(!sim.cars[98].brainSnapshot&&$('brain-agent').textContent.includes('attesa'))),{observed,label:$('brain-agent').textContent});
    const mapLengths=[];
    for(const id of ['monaco','le-mans','monza']){
      change('circuit-select',id);await until(()=>sim.circuitId===id&&latest?.circuitId===id&&latest.elapsed===0,'pista '+id);
      const length=sim.track.total/sim.track.pixelsPerMeter;mapLengths.push({id,lengthM:length,referenceM:MaleCNSVehicle.CIRCUIT_METRICS[id].lengthM});
      check('Metric calibration '+id,Math.abs(length-MaleCNSVehicle.CIRCUIT_METRICS[id].lengthM)<1e-6&&sim.track.metricNotice.includes('approssimazioni'));
    }
    sim.mode='off';await until(()=>latest.mode==='off'&&latest.elapsed===0,'rete spenta');change('agent-select',99);await wait(200);
    document.querySelector('.vehicle-details').open=true;
    const poses=()=>JSON.stringify(sim.cars.map(c=>[c.id,c.x,c.y,c.speed,c.fitness]));const stationary=poses();
    change('vehicle-gearbox','manual');await until(()=>sim.cars[99].vehicle.gearboxMode==='manual','cambio manuale');await wait(180);
    check('Manual edit affects selected agent only',sim.cars[99].diagnosticVehicle&&sim.cars.filter(c=>c.diagnosticVehicle).length===1&&sim.cars[0].vehicle.gearboxMode==='auto');
    await until(()=>!$('gear-up').disabled,'pulsante cambio');$('gear-up').click();await until(()=>sim.cars[99].vehicle.targetGear===2&&sim.cars[99].vehicle.shiftRemaining>0,'richiesta marcia');
    const remaining=sim.cars[99].vehicle.shiftRemaining;await wait(400);
    check('Paused shift waits for simulated time',sim.cars[99].vehicle.gear===1&&sim.cars[99].vehicle.shiftRemaining===remaining&&poses()===stationary);
    $('vehicle-abs').checked=false;$('vehicle-abs').dispatchEvent(new Event('change',{bubbles:true}));
    $('vehicle-tc').checked=false;$('vehicle-tc').dispatchEvent(new Event('change',{bubbles:true}));await until(()=>!sim.cars[99].vehicle.absEnabled&&!sim.cars[99].vehicle.tcEnabled,'assistenze');
    check('ABS/TC commands acknowledged by worker',!sim.cars[99].vehicle.absEnabled&&!sim.cars[99].vehicle.tcEnabled&&sim.cars[0].vehicle.absEnabled&&sim.cars[0].vehicle.tcEnabled);
    sim.running=true;await until(()=>sim.cars[99].vehicle.gear===2&&sim.cars[99].vehicle.shiftRemaining===0,'fine cambiata');await pause();
    check('Shift completes while zero-pedal body remains still',sim.cars[99].vehicle.gear===2&&sim.cars.every(c=>c.speed===0&&c.vehicle.speedMps===0));
    check('Powertrain telemetry is live from selected car',$('vehicle-gear').textContent==='2'&&$('vehicle-rpm').textContent.includes('rpm')&&$('vehicle-wheel-loads').textContent.includes('AS')&&$('vehicle-aids').textContent.includes('manuale'));
    sim.mode='connectome';await until(()=>latest.mode==='connectome'&&latest.elapsed===0,'ritorno IA');await wait(180);
    check('New episode restores standard aids and automatic sequential',sim.cars.every(c=>!c.diagnosticVehicle&&c.vehicle.gearboxMode==='auto'&&c.vehicle.absEnabled&&c.vehicle.tcEnabled&&c.vehicle.gear===1));
    sim.running=true;await until(()=>sim.cars[99]?.brainSnapshot&&sim.cars[99].brain.activeCount>=7721&&sim.elapsed>.4,'nuovo episodio');await pause();
    check('Anatomical learning resumes after diagnostic controls',sim.engine.gpu.state===(${forceCpuFallback}?'fallback':'active')&&sim.cars.some(c=>c.distance>0));
    $('view-split').click();change('camera-select','follow');for(let i=0;i<3;i++)$('track-zoom-in').click();await wait(200);
    check('Interactive map and 3D atlas remain reachable',!$('circuit-view').hidden&&!$('brain-view').hidden&&circuitLab.atlas.graph.n===166700&&circuitLab.trackView.scale>1.8);
    const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);check('No duplicate controls',new Set(ids).size===ids.length);
    const telemetry=sim.cars[99].vehicle,gpu=sim.engine.gpu;unsubscribe();
    return {version:circuitLab.version,checks,mapLengths,telemetry,gpu,population:sim.population,workerCount:sim.engine.workerCount,boundary:'Short native functional check with 100 agents. Not measured Porsche validation, full 3D suspension, sustained speed or all-circuit learning convergence.'};
  })()`,true).catch(async error=>{
    await fs.writeFile(path.join(output,'physics-debug.json'),JSON.stringify({errors,state:await wc.executeJavaScript("({run:document.getElementById('run-state').textContent,note:document.getElementById('mode-note').textContent})")},null,2));throw error;
  });
  if(capture){
    result.views={};
    for(const [name,width,height,scroll]of [['desktop-split',1540,980,'top'],['desktop-powertrain',1540,980,'cockpit'],['narrow-powertrain',390,844,'cockpit'],['narrow-map',390,844,'map']]){
      window.setContentSize(width,height);
      await wc.executeJavaScript(scroll==='top'?'window.scrollTo(0,0)':scroll==='map'?"document.getElementById('view-circuit').click();document.getElementById('simulation-canvas').scrollIntoView({block:'center'})":"document.querySelector('.vehicle-cockpit').scrollIntoView({block:'center'})",true);await wait(250);
      result.views[name]=await wc.executeJavaScript(`({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,overflow:Array.from(document.querySelectorAll('button,select,input,summary')).filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).map(e=>e.id||e.tagName),gear:document.getElementById('vehicle-gear').textContent,rpm:document.getElementById('vehicle-rpm').textContent})`,true);
      const png=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),png.toPNG());
    }
  }
  result.runtimeVersion=version;result.generatedAt=new Date().toISOString();result.forceCpuFallback=forceCpuFallback;result.consoleErrors=errors;
  result.passed=result.checks.every(c=>c.passed)&&errors.length===0&&Object.values(result.views||{}).every(v=>v.documentWidth<=v.width&&v.overflow.length===0);
  await fs.writeFile(path.join(output,'physics-smoke.json'),JSON.stringify(result,null,2));
  console.log('PHYSICS_SMOKE '+JSON.stringify({passed:result.passed,checks:result.checks.length,version,output,errors}));return result;
}
module.exports={run};
