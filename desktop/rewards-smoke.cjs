'use strict';
// Real Windows engine, real neural rollouts, one isolated profile. The manual
// generation command tests terminal scoring/selection, NOT learned lap success.
const fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function run(window,{output,version,forceCpuFallback=false,capture=false}){
  await fs.mkdir(output,{recursive:true});const wc=window.webContents,errors=[];
  wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id),checks=[],cases=[];
    const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
    const until=async(fn)=>{const start=performance.now();while(!fn()){if(performance.now()-start>180000)throw Error('Timeout reward runtime: '+fn.toString()+' · '+JSON.stringify(circuitLab.sim.engine));await wait(50);}};
    const change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    const sum=o=>Object.values(o).reduce((a,b)=>a+b,0),near=(a,b)=>Math.abs(a-b)<1e-6;
    let latest;const unsubscribe=desktopCompute.onSnapshot(s=>{if(s.cars)latest=s;});
    await until(()=>globalThis.circuitLab?.sim?.engine?.sessionId&&latest);
    check('Exact app/reward version',circuitLab.version===${JSON.stringify(version)}&&$('build-version').textContent===${JSON.stringify(version)}&&FlySim.Rewards.REVISION==='episodic-2');
    $('view-circuit').click();
    for(const model of ['v2','v3','v4','v5']){
      if(circuitLab.sim.modelId!==model){change('controller-select',model);await until(()=>circuitLab.sim.modelId===model&&!$('controller-select').disabled);}
      const s=circuitLab.sim;s.running=false;await until(()=>latest?.engine?.sessionId===s.engine.sessionId&&!latest.running);
      await desktopCompute.command({type:'setWorkerCount',value:1});
      change('population-range',100);await until(()=>s.population===100&&latest.population===100);
      for(const id of ['monza','monaco','le-mans']){
        change('circuit-select',id);s.speedMultiplier=.5;s.running=true;
        await until(()=>latest?.circuitId===id&&s.circuitId===id&&s.cars.length===100&&s.elapsed>.5&&s.cars.some(c=>c.speed>.01));
        change('agent-select',99);await until(()=>s.cars[99]?.brainSnapshot&&latest.cars[99]?.rewardBreakdown);
        const selected=s.cars[99],track=s.track,observedActiveNeurons=selected.brain.activeCount;
        check(model+'/'+id+': 100 real cars move without pedal overlap',s.cars.length===100&&s.cars.some(c=>c.distance>0)&&s.cars.every(c=>Math.min(c.outputs[1],c.outputs[2])<=1e-9));
        check(model+'/'+id+': real brain/sensors/physics/score finite',selected.brain.activity.every(Number.isFinite)&&s.cars.every(c=>[c.x,c.y,c.speed,c.fitness,c.baseFitness,...c.outputs,...c.inputs,...c.physicsInputs].every(Number.isFinite)));
        check(model+'/'+id+': ledger reconciles from worker',near(sum(selected.rewardBreakdown.rewards),selected.reward)&&near(sum(selected.rewardBreakdown.penalties),selected.penalty)&&near(selected.fitness,selected.reward-selected.penalty)&&near(selected.baseFitness,selected.fitness+selected.lapRegressionPenalty));
        check(model+'/'+id+': actual map/physics walls retained',track.pixelsPerMeter===1&&track.widthMeters.length===track.center.length&&JSON.stringify(circuitLab.tracks.model.outer.points)===JSON.stringify(track.outer.map(p=>({x:p.x,y:p.y}))));
        if(s.graph.full)check(model+'/'+id+': expected GPU/CPU backend',${forceCpuFallback}?s.engine.gpu.state==='fallback':s.engine.gpu.state==='active',s.engine.gpu);
        if(model==='v5'){
          const p=s.graph.learning;
          check(id+': V5 real capacity and learned parameters',s.graph.n===166700&&s.graph.edgeCount===6242118&&p.nodes.length===128&&p.gainGroups===32&&p.length===346&&s.graph.solver.activeNeuronBudget===32768&&s.graph.solver.iterationsPerControlTick===4);
          check(id+': V5 real inspected neurons exceed V4 budget',selected.brain.activeCount>8192&&selected.brain.activeCount<=32768,{active:selected.brain.activeCount,budget:32768});
          check(id+': V5 copy explains anatomical vs compute capacity',$('model-capacity-note').textContent.includes('32.768')&&$('model-capacity-note').textContent.includes('166.700')&&$('data-counts').textContent.includes('346'));
        }
        s.running=false;await until(()=>latest?.circuitId===id&&!latest.running);await wait(300);
        // A hidden test window need not receive animation frames. Trigger the
        // ordinary inspector refresh after its real worker sample arrived.
        change('agent-select',99);
        check(model+'/'+id+': inspector shows true scoring/reference',!$('reward-context').textContent.includes('attesa')&&$('reward-breakdown').children.length===FlySim.Rewards.rewardKeys.length+FlySim.Rewards.penaltyKeys.length&&$('reward-reference').textContent.includes('taratura')&&$('generation-note').textContent.includes('punteggio netto'),{context:$('reward-context').textContent,rows:$('reward-breakdown').children.length,note:$('generation-note').textContent});
        const fingerprint=()=>JSON.stringify([latest.elapsed,latest.generation,latest.learningStats,latest.cars.map(c=>[c.x,c.y,c.heading,c.speed,c.outputs,c.fitness,c.reward,c.penalty,c.rewardBreakdown])]),before=fingerprint();
        $('score-details').open=true;$('reward-details').open=true;$('track-zoom-in').click();$('view-split').click();await wait(300);
        check(model+'/'+id+': reading scores/map/atlas does not change training',fingerprint()===before);
        const prior=latest,expected=prior.cars.map(c=>({...c,fitness:c.fitness-(c.laps<1&&!c.noLapPenalty?FlySim.SCORE_RULES.noLapPenalty+FlySim.SCORE_RULES.missingLapPenalty*(1-Math.min(1,c.bestProgress/track.total)):0)})).sort(FlySim.compareAgents)[0];
        const updates=prior.learningStats.updates;await desktopCompute.command({type:'evolve'});
        await until(()=>latest.generation===prior.generation+1&&latest.history.at(-1)?.generation===prior.generation);
        const h=latest.history.at(-1);
        check(model+'/'+id+': all 100 episodes affect optimizer exactly once',latest.learningStats.updates===updates+1&&latest.learningStats.episodes===prior.learningStats.episodes+100&&!latest.running,latest.learningStats);
        check(model+'/'+id+': terminal penalties determine the actual selected rollout',near(h.best,expected.fitness)&&h.noLapCount===100&&h.rewardRevision==='episodic-2', {expected:expected.fitness,actual:h.best,noLapCount:h.noLapCount});
        check(model+'/'+id+': real generation history reconciles and stores reference',near(sum(h.rewardBreakdown.rewards),h.reward)&&near(sum(h.rewardBreakdown.penalties),h.penalty)&&near(h.best,h.reward-h.penalty)&&h.previousBestLapTime===null&&Number.isFinite(h.baseBest));
        cases.push({modelId:model,circuitId:id,population:100,neurons:s.graph.n,solver:s.graph.solver,readoutNeurons:s.graph.learning.nodes.length,gainGroups:s.graph.learning.gainGroups,parameters:s.graph.learning.length,inspectedActiveNeurons:observedActiveNeurons,gpuBufferBytes:s.gpu?.ownedBuffers.reduce((n,b)=>n+b.size,0)??0,gpu:s.engine.gpu,generation:h.generation,bestScore:h.best,baseBest:h.baseBest,bestProgress:h.bestProgress,laps:h.laps,optimizerUpdates:latest.learningStats.updates,episodes:latest.learningStats.episodes});
        $('view-circuit').click();
      }
    }
    check('Highest net score wins over an artificially assigned faster lap',FlySim.compareAgents({fitness:100,laps:0,bestProgress:100},{fitness:-10000,laps:2,bestLapTime:1,bestProgress:100000})<0);
    const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);check('No duplicate control IDs',ids.length===new Set(ids).size);
    unsubscribe();return {checks,cases,version:circuitLab.version,forceCpuFallback:${forceCpuFallback},boundary:'Real 100-agent neural motion, reward ledgers and interrupted-generation selection across 4 models/3 tracks. Not a learned-lap/convergence or FPS benchmark.'};
  })()`,true);
  if(capture){
    result.views={};
    for(const [name,width,height]of [['desktop-rewards',1540,980],['narrow-rewards',390,844]]){
      window.setContentSize(width,height);await wc.executeJavaScript("document.getElementById('controller-select').scrollIntoView({block:'center'})",true);await wait(200);
      const metrics=await wc.executeJavaScript(`(()=>{const elements=Array.from(document.querySelectorAll('button,select,input,summary,dt,dd')).filter(e=>e.getBoundingClientRect().width);return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,overflow:elements.filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.id||e.tagName),ledgerRows:document.getElementById('reward-breakdown').children.length};})()`,true);
      const img=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),img.toPNG());result.views[name]={...metrics,file:name+'.png'};
    }
    window.setContentSize(1540,980);await wc.executeJavaScript("document.getElementById('view-split').click();window.scrollTo(0,0)",true);await wait(200);
    const img=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,'split-map-atlas.png'),img.toPNG());result.views.split={file:'split-map-atlas.png'};
  }
  result.runtimeVersion=version;result.generatedAt=new Date().toISOString();result.consoleErrors=errors;
  result.passed=result.checks.every(c=>c.passed)&&!errors.length&&Object.values(result.views||{}).every(v=>!v.width||(v.documentWidth<=v.width&&!v.overflow.length));
  await fs.writeFile(path.join(output,'rewards-smoke.json'),JSON.stringify(result,null,2));console.log('REWARDS_SMOKE '+JSON.stringify({passed:result.passed,version,checks:result.checks.length,cases:result.cases.length,forceCpuFallback,output,errors}));return result;
}
module.exports={run};
