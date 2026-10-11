'use strict';
// Actual Windows runtime, isolated test profiles. No convergence/FPS claim.
const fs=require('node:fs/promises'),path=require('node:path');
async function run(window,{output,version,forceCpuFallback=false,capture=false}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,errors=[];
  wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id),checks=[],cases=[];
    const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
    const until=async(fn)=>{const start=performance.now();while(!fn()){if(performance.now()-start>45000)throw Error('Timeout metric runtime: '+fn.toString()+' · '+JSON.stringify(circuitLab.sim.engine));await wait(50);}};
    const change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    let latest;const unsubscribe=desktopCompute.onSnapshot(s=>{if(s.cars)latest=s;});
    await until(()=>globalThis.circuitLab?.tracks&&circuitLab.sim.engine?.sessionId&&latest);
    check('Exact app version',circuitLab.version===${JSON.stringify(version)}&&$('build-version').textContent===${JSON.stringify(version)});
    $('view-circuit').click();
    for(const model of ['v2','v3','v4']){
      if(circuitLab.sim.modelId!==model){change('controller-select',model);await until(()=>circuitLab.sim.modelId===model&&!$('controller-select').disabled);}
      const s=circuitLab.sim;s.running=false;await until(()=>latest?.engine?.sessionId===s.engine.sessionId&&!latest.running);
      await desktopCompute.command({type:'setWorkerCount',value:1});
      change('population-range',100);await until(()=>s.population===100&&latest.population===100);
      for(const id of ['monza','monaco','le-mans']){
        change('circuit-select',id);s.speedMultiplier=.5;s.running=true;
        await until(()=>latest?.circuitId===id&&s.circuitId===id&&s.cars.length===100&&s.elapsed>.2&&s.cars.some(c=>c.speed>.01));
        // A full real sample for A-100 while running; never step a paused brain.
        change('agent-select',99);await until(()=>s.cars[99]?.brainSnapshot&&latest?.cars[99]?.brain);
        const samples=s.cars,selected=s.cars[99],track=s.track,dimensions=track.dimensions;
        check(model+'/'+id+': 100 physical cars actually move',samples.length===100&&samples.some(c=>c.distance>0||c.speed>.01));
        check(model+'/'+id+': real motors, physics and sensors finite',samples.every(c=>[c.x,c.y,c.heading,c.speed,c.fitness,...c.outputs,...c.inputs,...c.physicsInputs].every(Number.isFinite)&&Math.min(c.outputs[1],c.outputs[2])<=1e-9));
        check(model+'/'+id+': own real full brain sample',selected.brainSnapshot&&selected.brain.activity.every(Number.isFinite));
        check(model+'/'+id+': length / variable widths / render agree',track.pixelsPerMeter===1&&Math.abs(track.lengthMeters-dimensions.lengthMeters)<.00001&&track.widthMeters.length===track.center.length&&JSON.stringify(circuitLab.tracks.model.outer.points)===JSON.stringify(track.outer.map(p=>({x:p.x,y:p.y})))&&JSON.stringify(circuitLab.tracks.model.inner.points)===JSON.stringify(track.inner.map(p=>({x:p.x,y:p.y}))));
        check(model+'/'+id+': honest dimensional UI and source',$('track-dimensions').textContent.includes('larghezz')&&$('track-dimensions').textContent.includes('stimate')&&$('track-dimension-source').href===dimensions.lengthSource&&!$('track-dimension-source').hidden);
        if(model==='v4')check(id+': expected GPU/CPU backend',${forceCpuFallback}?s.engine.gpu.state==='fallback':s.engine.gpu.state==='active',s.engine.gpu);
        s.running=false;await until(()=>latest?.circuitId===id&&!latest.running);await wait(300);
        const fingerprint=()=>JSON.stringify([latest.elapsed,latest.generation,latest.learningStats,latest.cars.map(c=>[c.x,c.y,c.heading,c.speed,c.outputs,c.fitness,c.reward,c.penalty,c.physicsInputs])]),before=fingerprint();
        const station=track.widthStations.reduce((a,b)=>a.widthMeters<b.widthMeters?a:b),index=track.widthStations.indexOf(station);
        change('track-landmark','width:'+index);await wait(300);
        check(model+'/'+id+': every width section can be inspected',circuitLab.trackCamera.center.x===station.x&&$('track-local-width').textContent.includes(station.label)&&$('track-local-width').textContent.includes('(stimata)'),{station,center:circuitLab.trackCamera.center,text:$('track-local-width').textContent});
        $('track-boundaries').click();$('track-zoom-in').click();$('track-reset').click();await wait(250);
        check(model+'/'+id+': map-only controls never modify training or physical state',fingerprint()===before);
        cases.push({modelId:model,circuitId:id,population:100,lengthMeters:track.lengthMeters,widthRangeMeters:dimensions.widthRangeMeters,stations:track.widthStations.length,neurons:s.graph.n,realBrainAgentId:99,gpu:s.engine.gpu});
      }
    }
    unsubscribe();return {checks,cases,version:circuitLab.version,forceCpuFallback:${forceCpuFallback},boundary:'Actual 100-agent motion and real neural reads, all three models/circuits. No learned-lap, convergence, throughput, sustained FPS or 30x guarantee.'};
  })()`,true);
  // One bounded visual batch only on the source run. Packaged checks do not
  // trigger another design/polish loop or replace the old release evidence.
  if(capture)result.mapReview=await require('./track-smoke.cjs').run(window,{output:path.join(output,'map-review'),version});
  result.runtimeVersion=version;result.consoleErrors=errors;result.generatedAt=new Date().toISOString();
  result.passed=result.checks.every(c=>c.passed)&&!errors.length&&(!capture||result.mapReview.passed);
  await fs.writeFile(path.join(output,'metric-smoke.json'),JSON.stringify(result,null,2));
  console.log('METRIC_SMOKE '+JSON.stringify({passed:result.passed,version,checks:result.checks.length,cases:result.cases.length,forceCpuFallback,output,errors}));return result;
}
module.exports={run};
