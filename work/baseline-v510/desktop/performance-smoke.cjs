'use strict';
// Diagnostic of our own renderer/compute bridge, in a disposable app profile.
// Never changes a user's saved champion or an older packaged release.
const fs=require('node:fs/promises'),path=require('node:path');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(window,{output,version,baselineRuntime,forceCpuFallback=false,capture=false}){
  await fs.mkdir(output,{recursive:true});
  const wc=window.webContents,errors=[];
  wc.on('console-message',details=>{if(details.level==='error'||details.level===3)errors.push(details.message);});
  const baselineSource=baselineRuntime?await fs.readFile(baselineRuntime,'utf8'):null;
  const result=await wc.executeJavaScript(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),$=id=>document.getElementById(id),checks=[];
    const until=async(predicate,timeout=30000)=>{const start=performance.now();while(!predicate()){if(performance.now()-start>timeout)throw Error('Timeout verifica prestazioni');await wait(50);}};
    const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+' · '+JSON.stringify(detail));};
    const change=(id,value)=>{$(id).value=String(value);$(id).dispatchEvent(new Event('input',{bubbles:true}));$(id).dispatchEvent(new Event('change',{bubbles:true}));};
    await until(()=>globalThis.circuitLab?.sim?.engine&&$('run-state').textContent!=='AVVIO');
    let sim=circuitLab.sim,latest=null;
    const unsubscribe=desktopCompute.onSnapshot(snapshot=>{if(snapshot.cars)latest=snapshot;});
    const pause=async()=>{sim.running=false;await until(()=>latest?.engine?.modelId===sim.modelId&&latest.running===false,30000);await wait(100);};
    await pause();
    const initialGraph=sim.graph,initialData=circuitLab.data,gpuBench=[],parity=[];
    const baselineSource=${JSON.stringify(baselineSource)};
    if(baselineSource&&!${forceCpuFallback}){
      const sandbox={FlySim:{...FlySim},desktopCompute:{onGpuRequest(){}},navigator,GPUBufferUsage,GPUShaderStage,GPUMapMode};
      new Function('globalThis',baselineSource)(sandbox);
      const oldBackend=new sandbox.FlySim.DesktopGpuNeuralBackend(initialData,initialGraph),newBackend=new FlySim.DesktopGpuNeuralBackend(initialData,initialGraph);
      const drivers=new FlySim.Simulation(initialData,{population:32,seed:7717,circuitId:'monza',circuits:MALE_CNS_CIRCUITS,brainFactory:MaleCNSDesktopState.mirrorBrain});
      const makeRequest=(population,iterations=2,reset=false)=>{
        const drives=new Float32Array(population*initialGraph.inputs.length),gains=new Float32Array(population*16);
        for(let i=0;i<population;i++){
          const car=drivers.cars[i],sensors=car.inputs.concat(car.physicsInputs);
          gains.set(FlySim.synapticGains(initialGraph,car.genome),i*16);
          for(let k=0;k<initialGraph.inputs.length;k++)drives[i*initialGraph.inputs.length+k]=FlySim.sensorDrive(initialGraph,car.genome,sensors,k,FlySim.MAP_PHYSICS_ADAPTER_GAIN);
        }
        return {population,drives,gains,agentIds:Array.from({length:population},(_,i)=>i),inspectedAgentId:population-1,iterations,reset};
      };
      try{
        await oldBackend.init();await newBackend.init();
        for(const iterations of [1,2,3,4]){
          const request=makeRequest(16,iterations,true),legacyRuns=[],newRuns=[];
          for(let repeat=0;repeat<4;repeat++){legacyRuns.push(await oldBackend.run(request));newRuns.push(await newBackend.run(request));}
          const diff=(a,b)=>{
            let orderEqual=true,maxReadoutAbsDiff=0,maxCoreAbsDiff=0;
            for(let i=0;i<16;i++)for(let k=0;k<64;k++){orderEqual=orderEqual&&a.agents[i].active[k]===b.agents[i].active[k];maxReadoutAbsDiff=Math.max(maxReadoutAbsDiff,Math.abs(a.agents[i].values[k]-b.agents[i].values[k]));}
            for(let k=0;k<newBackend.reservedCount;k++){orderEqual=orderEqual&&a.agents[15].active[k]===b.agents[15].active[k];maxCoreAbsDiff=Math.max(maxCoreAbsDiff,Math.abs(a.agents[15].values[k]-b.agents[15].values[k]));}
            return {orderEqual,maxReadoutAbsDiff,maxCoreAbsDiff};
          };
          const oldRepeat=diff(legacyRuns[0],legacyRuns[1]),newRepeat=diff(newRuns[0],newRuns[1]),cross=diff(legacyRuns[0],newRuns[0]);
          for(let repeat=2;repeat<4;repeat++)for(const [runs,target]of [[legacyRuns,oldRepeat],[newRuns,newRepeat]]){const d=diff(runs[0],runs[repeat]);target.maxReadoutAbsDiff=Math.max(target.maxReadoutAbsDiff,d.maxReadoutAbsDiff);target.maxCoreAbsDiff=Math.max(target.maxCoreAbsDiff,d.maxCoreAbsDiff);}
          const row={iterations,cross,baselineRepeat:oldRepeat,optimizedRepeat:newRepeat,tolerance:1e-5};parity.push(row);
          // Once context admission hits the sparse budget, atomic arrival
          // order was already nondeterministic. Preserve and report that
          // limitation; do not claim bit-exact trajectories after saturation.
          check('GPU stable readout order '+iterations,cross.orderEqual,row);
          if(iterations<=2)check('GPU cold-start numeric equivalence '+iterations,cross.maxReadoutAbsDiff<=1e-5&&cross.maxCoreAbsDiff<=1e-5,row);
        }
        for(const population of [16,32]){
          const request=makeRequest(population),timings={baseline:[],optimized:[]};
          for(const backend of [oldBackend,newBackend]){await backend.run({...request,reset:true});for(let i=0;i<3;i++)await backend.run(request);}
          // Alternate order to reduce thermal/warm-cache ordering bias.
          for(let i=0;i<12;i++)for(const name of (i%2?['optimized','baseline']:['baseline','optimized'])){
            const start=performance.now();await(name==='baseline'?oldBackend:newBackend).run(request);timings[name].push(performance.now()-start);
          }
          const stats=a=>{const sorted=a.slice().sort((a,b)=>a-b);return {samples:a,medianMs:(sorted[5]+sorted[6])/2,p95Ms:sorted[11]};};
          gpuBench.push({population,iterations:2,baseline:{...stats(timings.baseline),readbackBytes:oldBackend.maxPopulation*(oldBackend.activeBudget*8+4),submissions:3},optimized:{...stats(timings.optimized),readbackBytes:newBackend.lastReadbackBytes,submissions:newBackend.lastSubmissions},adapter:newBackend.adapter});
        }
      }finally{
        newBackend.dispose();oldBackend.device?.destroy();
      }
    }
    const models=${forceCpuFallback} ? ['v4'] : ['v2','v3','v4'],populations=[];
    for(const model of models){
      if(circuitLab.modelId!==model){change('controller-select',model);await until(()=>circuitLab.modelId===model&&!$('controller-select').disabled);}
      sim=circuitLab.sim;await pause();
      await desktopCompute.command({type:'setWorkerCount',value:1});await until(()=>sim.engine?.workerCount===1);await pause();
      change('circuit-select','monza');change('population-range',100);await until(()=>sim.population===100&&sim.cars.length===100);await wait(350);
      change('agent-select',99);sim.speedMultiplier=30;sim.running=true;
      const start=performance.now();await until(()=>sim.cars[99]?.brainSnapshot&&sim.cars[99].brain.activity.length===sim.graph.n&&sim.cars.some(c=>c.distance>.05||c.speed>.01),30000);
      await wait(1300);await pause();
      const car=sim.cars[99],finite=sim.cars.every(c=>[c.x,c.y,c.speed,c.fitness,...c.outputs].every(Number.isFinite)),overlap=Math.max(...sim.cars.map(c=>Math.min(c.outputs[1]||0,c.outputs[2]||0)));
      check(model+' has 100 agents',sim.cars.length===100&&sim.population===100&&$('agent-select').options.length===100);
      check(model+' population control is coherent',$('population-range').max==='100'&&$('population-output').textContent.startsWith('100 '),$('population-output').textContent);
      check(model+' inspects A-100 only',car.brainSnapshot&&sim.cars.filter(c=>c.brainSnapshot).length===1&&$('selected-agent-id').textContent==='A-100');
      check(model+' finite physics and exclusive pedals',finite&&overlap<=1e-9,{finite,overlap});
      check(model+' target speed remains 30x',sim.speedMultiplier===30&&Number($('speed-range').value)===30);
      check(model+' neural graph unchanged',sim.graph.n===({v2:1121,v3:7721,v4:166700})[model]);
      if(model==='v4')check('V4 compute backend',${forceCpuFallback}?sim.engine.gpu.state==='fallback':sim.engine.gpu.state==='active',sim.engine.gpu);
      const before=JSON.stringify(sim.cars.map(c=>[c.x,c.y,c.speed,c.fitness]));await wait(650);
      check(model+' truly pauses 100 cars',before===JSON.stringify(sim.cars.map(c=>[c.x,c.y,c.speed,c.fitness])));
      populations.push({modelId:model,population:sim.population,workers:sim.engine.workerCount,generation:sim.generation,elapsed:sim.elapsed,wallMs:performance.now()-start,maxSpeed:Math.max(...sim.cars.map(c=>c.speed)),maxDistance:Math.max(...sim.cars.map(c=>c.distance)),neurons:sim.graph.n,edges:sim.graph.edgeCount,inspectedAgentId:99,activityCount:car.brain.activeCount??car.brain.activity.length,mirrorBytes:sim.cars.reduce((n,c)=>n+c.brain.activity.byteLength+(c.brain.active?.byteLength||0),0),gpu:sim.engine.gpu});
    }
    // Also exercise the diagnostic motor modes with the full graph: these
    // use the CPU solver, not the scratch-free GPU mirror.
    sim.mode='straight';await until(()=>latest.mode==='straight'&&latest.elapsed===0&&!latest.running);sim.running=true;await until(()=>latest.mode==='straight'&&latest.cars.some(c=>c.distance>0));await pause();
    check('Full-graph straight-mode CPU solver works',sim.cars.some(c=>c.distance>0)&&sim.cars.every(c=>c.outputs.every(Number.isFinite)));
    sim.mode='off';await until(()=>latest.mode==='off'&&latest.elapsed===0&&!latest.running);sim.running=true;await until(()=>latest.mode==='off'&&latest.elapsed>=FlySim.DT*2);await pause();
    check('Full-graph network-off remains stationary',sim.cars.every(c=>c.distance===0&&c.outputs.every(v=>v===0)),{maxDistance:Math.max(...sim.cars.map(c=>c.distance)),elapsed:sim.elapsed,mode:sim.mode});
    sim.mode='connectome';await until(()=>latest.mode==='connectome'&&latest.elapsed===0&&!latest.running);change('agent-select',99);sim.running=true;await until(()=>sim.cars[99]?.brain.activeCount>=7721);await wait(300);await pause();
    check('Returning to GPU learning works',sim.cars[99].brainSnapshot&&sim.cars[99].brain.activeCount>=7721);
    $('view-split').click();
    const full=initialGraph,oldBrain=FlySim.makeBrain(full),gpuMirror=MaleCNSDesktopState.mirrorBrain(full),size=b=>Object.values(b).reduce((n,v)=>n+(v?.byteLength||0),0);
    const ids=Array.from(document.querySelectorAll('[id]')).map(e=>e.id);check('No duplicate DOM IDs',ids.length===new Set(ids).size);
    unsubscribe();
    return {version:circuitLab.version,checks,gpuBench,parity,populations,memory:{fullCpuBrainBytes:size(oldBrain),gpuWorkerMirrorBytes:size(gpuMirror),rendererMirrorBytes:populations.at(-1).mirrorBytes},boundary:'Short kernel/worker/runtime benchmark; does not establish learning convergence, sustained thermals or a guaranteed real 30x speed at 100 agents.'};
  })()`,true);
  if(capture){
    result.views={};
    for(const [name,width,height]of [['desktop-100-agents',1540,980],['narrow-100-agents',390,844],['narrow-population-control',390,844]]){
      window.setContentSize(width,height);await wc.executeJavaScript(name==='narrow-population-control'?"document.getElementById('population-range').closest('label').scrollIntoView({block:'center'})":"window.scrollTo(0,0)",true);await wait(200);
      result.views[name]=await wc.executeJavaScript(`({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,populationMax:document.getElementById('population-range').max,populationLabel:document.getElementById('population-output').textContent,agent:document.getElementById('selected-agent-id').textContent})`,true);
      const image=await wc.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(output,name+'.png'),image.toPNG());
    }
  }
  result.runtimeVersion=version;result.generatedAt=new Date().toISOString();result.forceCpuFallback=forceCpuFallback;result.consoleErrors=errors;
  result.passed=result.checks.every(c=>c.passed)&&errors.length===0&&Object.values(result.views||{}).every(v=>v.documentWidth<=v.width);
  await fs.writeFile(path.join(output,'performance-smoke.json'),JSON.stringify(result,null,2));
  console.log('PERFORMANCE_SMOKE '+JSON.stringify({passed:result.passed,checks:result.checks.length,version,output,errors}));
  return result;
}
module.exports={run};
