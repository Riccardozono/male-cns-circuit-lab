'use strict';
// Own-app observation tests, isolated profile. Ranking fixtures below modify
// renderer mirrors only; worker training/physics are never edited for a test.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(window,{output,engine,version,forceCpuFallback=false,capture=false}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,errors=[];
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message);});
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id),checks=[],models=[];
    const until=async(fn,timeout=30000)=>{const start=performance.now();while(!fn()){if(performance.now()-start>timeout){const s=globalThis.circuitLab?.sim;throw Error('Timeout auto selection: '+fn.toString()+' · '+JSON.stringify({model:s?.modelId,population:s?.population,selected:$('agent-select').value,automatic:$('follow-best').getAttribute('aria-pressed'),note:$('agent-selection-note').textContent,cars:s?.cars?.length,brainIds:s?.cars?.filter(c=>c.brainSnapshot).map(c=>c.id),inspected:s?._inspectedAgentId,pendingPopulation:s?._pendingPopulation,engine:s?.engine}));}await wait(50);}};
    const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
    const change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    let latest=null;const unsubscribe=desktopCompute.onSnapshot(snapshot=>{if(snapshot.cars)latest=snapshot;});
    await until(()=>globalThis.circuitLab?.sim?.engine?.sessionId&&circuitLab.sim.cars.length);
    check('Automatic selection is enabled by default',$('follow-best').getAttribute('aria-pressed')==='true');
    check('UI exposes the exact current app version',circuitLab.version===${JSON.stringify(version)}&&$('build-version').textContent===${JSON.stringify(version)});
    for(const model of ['v2','v3','v4']){
      change('controller-select',model);await until(()=>circuitLab.sim.modelId===model&&!$('controller-select').disabled);
      const s=circuitLab.sim;s.running=false;
      await until(()=>latest?.engine?.sessionId===s.engine.sessionId&&latest.running===false);
      await desktopCompute.command({type:'setWorkerCount',value:1});
      change('population-range',100);await until(()=>s.population===100&&s.cars.length===100&&latest?.population===100&&latest.running===false);
      if($('follow-best').getAttribute('aria-pressed')==='false')$('follow-best').click();
      s.speedMultiplier=3;s.running=true;
      await until(()=>s.elapsed>.2&&s.cars.some(c=>c.speed>.01)&&$('agent-select').value===String(MaleCNSAgents.bestActive(s.cars,Number($('agent-select').value)).id));
      const current=Number($('agent-select').value),car=s.cars.find(c=>c.id===current);
      check(model+': real 100-agent leader is selected automatically',Boolean(car)&&$('selected-agent-id').textContent==='A-'+String(current+1).padStart(2,'0')&&$('follow-best').getAttribute('aria-pressed')==='true');
      check(model+': real sensors and physics remain finite',s.cars.every(c=>[c.x,c.y,c.speed,c.fitness,...c.outputs,...c.inputs].every(Number.isFinite)&&Math.min(c.outputs[1],c.outputs[2])<=1e-9));
      // Read a full real A-100 sample while running. A pause during an in-flight
      // GPU tick may intentionally invalidate that tick and defer atlas reads
      // until resume; an observer must never run another neural step to fake it.
      s.speedMultiplier=.5;change('agent-select',99);
      await until(()=>s.cars[99]?.brainSnapshot===true&&Number($('agent-select').value)===99&&latest.cars[99]?.brain&&(model!=='v4'||${forceCpuFallback}||latest.cars[99].brain.active.length>64));
      check(model+': A-100 receives its own full real neural sample',s.cars[99].brainSnapshot&&latest.cars[99].id===99&&Boolean(latest.cars[99].brain));
      s.running=false;await until(()=>latest?.engine?.sessionId===s.engine.sessionId&&latest.running===false);await wait(250);
      check(model+': manual selection stays on A-100',$('follow-best').getAttribute('aria-pressed')==='false'&&$('selected-agent-id').textContent==='A-100'&&$('agent-selection-note').textContent.includes('manuale'));
      await wait(300);check(model+': auto mode does not override a manual choice',$('agent-select').value==='99');
      if(model==='v4')check('V4 uses the expected GPU or cold CPU fallback',${forceCpuFallback}?s.engine.gpu.state==='fallback':s.engine.gpu.state==='active',s.engine.gpu);
      const physical=JSON.stringify(latest.cars.map(c=>({id:c.id,x:c.x,y:c.y,heading:c.heading,speed:c.speed,outputs:c.outputs,inputs:c.inputs,physicsInputs:c.physicsInputs,fitness:c.fitness,reward:c.reward,penalty:c.penalty,lifetime:c.lifetime})));
      const neural=JSON.stringify(latest.cars[99].brain),learning=JSON.stringify([latest.generation,latest.elapsed,latest.history,latest.learningStats]);
      $('follow-best').click();await wait(250);change('agent-select',99);await wait(350);
      check(model+': selection-only changes leave paused physics and learning intact',physical===JSON.stringify(latest.cars.map(c=>({id:c.id,x:c.x,y:c.y,heading:c.heading,speed:c.speed,outputs:c.outputs,inputs:c.inputs,physicsInputs:c.physicsInputs,fitness:c.fitness,reward:c.reward,penalty:c.penalty,lifetime:c.lifetime})))&&learning===JSON.stringify([latest.generation,latest.elapsed,latest.history,latest.learningStats]));
      const pausedReadReady=s.cars[99]?.brainSnapshot===true&&Boolean(latest.cars[99]?.brain);
      check(model+': paused atlas is either a real sample or an explicit wait',pausedReadReady||(!s.cars[99]?.brainSnapshot&&$('brain-agent').textContent.includes('riprendi se la rete è in riavvio')));
      if(pausedReadReady&&neural!=='null')check(model+': returning to A-100 reads the same real neural activity',neural===JSON.stringify(latest.cars[99].brain));
      $('follow-best').click();await until(()=>$('agent-select').value===String(MaleCNSAgents.bestActive(s.cars,Number($('agent-select').value)).id));
      check(model+': re-enabling follows the current leader',$('follow-best').getAttribute('aria-pressed')==='true');
      models.push({modelId:model,population:s.population,selected:Number($('agent-select').value),gpu:s.engine.gpu,pausedAtlas:pausedReadReady?'real-read-only-sample':'explicit-wait-for-resume'});
    }
    const s=circuitLab.sim,apply=s.applySnapshot,post=s.post,messages=[];
    const originals=s.cars.map(c=>({id:c.id,alive:c.alive,laps:c.laps,bestLapTime:c.bestLapTime,bestProgress:c.bestProgress,fitness:c.fitness,x:c.x,y:c.y}));
    // Freeze only incoming observer mirrors for deterministic UI fixtures.
    // Other listener 'latest' still receives the real worker's snapshots.
    s.applySnapshot=()=>{};s.post=function(command){messages.push(command.type);return post.call(s,command);};
    try{
      for(const c of s.cars){c.alive=true;c.laps=0;c.bestLapTime=Infinity;c.bestProgress=0;c.fitness=0;}
      s.cars[1].bestProgress=100;await until(()=>$('agent-select').value==='1');
      check('UI follows the winning renderer fixture without a click',$('selected-agent-id').textContent==='A-02');
      s.cars[99].bestProgress=200;await until(()=>$('agent-select').value==='99');check('A new leading car is selected on the next UI update',$('selected-agent-id').textContent==='A-100');
      s.cars[99].alive=false;s.cars[0].bestProgress=150;await until(()=>$('agent-select').value==='0');check('Crashing the observed leader switches to the next active car',$('agent-selection-note').textContent.includes('migliore auto attiva'));
      s.cars[1].laps=1;s.cars[1].bestLapTime=120;s.cars[1].fitness=-50000;await wait(300);check('A badly scored lap cannot bypass the net objective',$('agent-select').value==='0');
      s.cars[2].laps=1;s.cars[2].bestLapTime=110;s.cars[2].fitness=600;await until(()=>$('agent-select').value==='2');check('A higher net score becomes the observed leader',$('selected-agent-id').textContent==='A-03');
      for(const c of s.cars)c.alive=false;await until(()=>$('agent-select').value==='2'&&$('agent-selection-note').textContent.includes('Nessuna auto attiva'));check('The final best remains selected when everyone is inactive',$('agent-select').value==='2'&&$('agent-selection-note').textContent.includes('Nessuna auto attiva'));
      change('agent-select',99);await wait(180);check('Manual inspection works even for an inactive car',$('agent-select').value==='99'&&$('follow-best').getAttribute('aria-pressed')==='false');
      const count=messages.length;s.cars[0].laps=2;s.cars[0].bestLapTime=100;s.cars[0].fitness=900;await wait(350);check('Changing the fixture leader cannot steal manual focus',$('agent-select').value==='99'&&messages.length===count);
      $('follow-best').click();await until(()=>$('agent-select').value==='0');check('Toggle restores automatic selection without a reset',$('follow-best').getAttribute('aria-pressed')==='true');
      change('camera-select','follow');await wait(180);check('Existing follow camera tracks the automatically selected car',$('track-view-label').textContent.startsWith('Segui A-01'));
      const selected=s.cars[0],savedType=selected.laps;s.cars[1].laps=savedType;s.cars[1].bestLapTime=selected.bestLapTime;s.cars[1].fitness=selected.fitness;s.cars[1].bestProgress=selected.bestProgress;
      const prior=messages.length;await wait(500);check('Exact leader ties do not spam inspect requests',$('agent-select').value==='0'&&messages.length===prior);
      check('Automatic observer sends no motor/reset/learning commands',messages.length>0&&messages.every(type=>type==='inspectAgent'),messages);
    }finally{for(const c of s.cars)Object.assign(c,originals.find(o=>o.id===c.id));s.applySnapshot=apply;s.post=post;}
    const id=Number($('agent-select').value);change('agent-select',id);s.setInspectedAgent(id);await wait(250);$('follow-best').click();await wait(200);
    unsubscribe();const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);check('No duplicated control IDs',ids.length===new Set(ids).size);
    return {version:circuitLab.version,checks,models,fixtureBoundary:'Synthetic ranking fields are renderer-only diagnostic fixtures; actual worker state and neural readbacks checked separately. No fake driving or learning result.'};
  })()`,true);
  if(capture){
    result.views={};
    for(const [name,width,height,script]of [['desktop-selection',1540,980,"document.getElementById('view-split').click();document.getElementById('agent-select').scrollIntoView({block:'center'})"],['narrow-selection',390,844,"document.getElementById('agent-select').scrollIntoView({block:'center'})"],['desktop-map',1540,980,"document.getElementById('camera-select').value='overview';document.getElementById('camera-select').dispatchEvent(new Event('change'));window.scrollTo(0,0)"]]){
      window.setContentSize(width,height);await wc.executeJavaScript(script,true);await wait(200);
      const metrics=await wc.executeJavaScript(`(()=>{const controls=Array.from(document.querySelectorAll('button,select,input,summary')).filter(e=>e.getBoundingClientRect().width),button=document.getElementById('follow-best'),note=document.getElementById('agent-selection-note');return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,overflow:controls.filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.id||e.tagName),auto:button.getAttribute('aria-pressed'),height:button.getBoundingClientRect().height,button:button.textContent,note:note.textContent};})()`,true);
      const img=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),img.toPNG());result.views[name]={...metrics,file:name+'.png'};
    }
  }
  result.runtimeVersion=version;result.generatedAt=new Date().toISOString();result.forceCpuFallback=forceCpuFallback;result.consoleErrors=errors;
  result.passed=result.checks.every(c=>c.passed)&&errors.length===0&&Object.values(result.views||{}).every(v=>v.documentWidth<=v.width&&!v.overflow.length&&v.height>=36&&v.auto==='true');
  result.boundary='UI auto-selection and read-only observation, not a learning-convergence or throughput benchmark.';
  await fs.writeFile(path.join(output,'selection-smoke.json'),JSON.stringify(result,null,2));console.log('SELECTION_SMOKE '+JSON.stringify({passed:result.passed,checks:result.checks.length,version,output,errors}));return result;
}
module.exports={run};
