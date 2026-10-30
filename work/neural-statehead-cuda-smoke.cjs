'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function run(window,{modelFile,selected,getCoordinator,info}){
  const root=path.resolve(__dirname,'..'),arg=process.argv.find(x=>x.startsWith('--statehead-smoke-output-dir=')),out=path.resolve(arg?arg.slice('--statehead-smoke-output-dir='.length):path.join(root,'.impeccable/review/neural-sacl/statehead-cuda-app-smoke-packaged-20261020-01'));
  if(await fs.stat(out).then(()=>true,()=>false))throw Error('Preserve existing smoke output; choose a new directory');await fs.mkdir(out,{recursive:false});
  const checks=[],errors=[];window.webContents.on('console-message',details=>{if(details.level>=2)errors.push(details.message);});const check=(name,passed,actual)=>{checks.push({name,passed:Boolean(passed),...(actual===undefined?{}:{actual})});if(!passed)throw Error('State-head app smoke failed: '+name+' '+JSON.stringify(actual));};
  const js=source=>window.webContents.executeJavaScript(source),until=async predicate=>{const started=Date.now();while(Date.now()-started<90000){if(await predicate())return true;await new Promise(resolve=>setTimeout(resolve,100));}return false;};
  try{
    const ready=await until(async()=>{
      if(await js('Boolean(globalThis.circuitLab?.sim?.cars?.length===16&&globalThis.circuitLab?.sim?.circuitId==="monza")'))return true;
      return info().experiment?.phase==='error';
    });
    if(!await js('Boolean(globalThis.circuitLab?.sim?.cars?.length===16&&globalThis.circuitLab?.sim?.circuitId==="monza")')){
      const page=await js('(()=>({readyState:document.readyState,title:document.title,body:document.body?.innerText?.slice(0,1200),runState:document.getElementById("run-state")?.textContent,modeNote:document.getElementById("mode-note")?.textContent,dataset:document.getElementById("dataset-status")?.textContent,hasDesktopCompute:Boolean(globalThis.desktopCompute),hasCircuits:Boolean(globalThis.MALE_CNS_CIRCUITS),hasApp:Boolean(globalThis.circuitLab)}))()').catch(error=>({error:error.message}));
      check('V3/Monza app starts with 16 real cars and initializes its renderer',false,{ready,engine:info(),url:window.webContents.getURL(),page});
    }
    check('V3/Monza app starts with 16 real cars and initializes its renderer',ready);
    const snapshot=await js('(()=>{try{const s=circuitLab.sim;return {version:circuitLab.version,modelId:s.modelId,circuitId:s.circuitId,population:s.population,generation:s.generation,running:s.running,cars:s.cars.map(c=>({id:c.id,lifetime:c.lifetime,laps:c.laps,bestProgress:c.bestProgress,outputs:c.outputs})),modeNote:document.getElementById("mode-note").textContent,capacity:document.getElementById("model-capacity-note").textContent,details:document.getElementById("data-counts").textContent,fileNote:document.getElementById("progress-file-note").textContent}}catch(error){return {__error:error.stack||String(error)}}})()');check('Renderer exposes the app state for inspection',!snapshot.__error,snapshot.__error||snapshot);
    check('Version remains 5.6.0 and the isolated app selects V3/Monza',snapshot.version==='5.6.0'&&snapshot.modelId==='v3'&&snapshot.circuitId==='monza',snapshot);
    check('16 independent cars start in generation 1 while paused',snapshot.population===16&&snapshot.generation===1&&snapshot.running===false&&snapshot.cars.length===16&&snapshot.cars.every(c=>c.lifetime===0&&c.laps===0),{population:snapshot.population,generation:snapshot.generation,running:snapshot.running});
    check('Every initial agent has finite, mutually exclusive pedals',snapshot.cars.every(c=>c.outputs?.every(Number.isFinite)&&Math.min(c.outputs[1],c.outputs[2])===0));
    check('UI accurately identifies the 8 neural projections and 18 learned coefficients',snapshot.capacity.includes('8 proiezioni')&&snapshot.details.includes('18 coefficienti')&&snapshot.fileNote.includes('.malecns-statehead-cuda-dev'),{capacity:snapshot.capacity,details:snapshot.details,fileNote:snapshot.fileNote});
    check('Visible baseline is the clean globally protected state-head result',snapshot.modeNote.includes('1 / 2 giri verificati')&&snapshot.modeNote.includes('6.591'),snapshot.modeNote);
    const modelHash=crypto.createHash('sha256').update(await fs.readFile(modelFile)).digest('hex');check('Selected controller matches its CUDA-verified model file',modelHash===selected.modelSha256,{modelHash,selected: selected.modelSha256});
    const coordinator=getCoordinator(),engine=info();check('Four native Node workers load the expected model on RTX 4060',coordinator.workerCount===4&&coordinator.workers.every(w=>w.child.exitCode===null)&&engine.gpu.actualGpuCalls>0&&engine.gpu.cpuFallbacks===0&&engine.gpu.backend==='state-head-exact-cuda-driver-v1',engine.gpu);
    const before=await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.lifetime,c.bestProgress,c.outputs]))');await new Promise(resolve=>setTimeout(resolve,500));const after=await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.lifetime,c.bestProgress,c.outputs]))');check('Pause keeps physics and neural state unchanged',before===after);
    check('No renderer console errors',errors.length===0,errors);
    const report={passed:true,checks,modelSha256:modelHash,proofFile:selected.proofFile,appVersion:'5.6.0',model:'V3 state-head / Monza',population:16,workers:4,cuda:engine.gpu,ui:snapshot,boundary:'Native application startup and a paused 16-agent state-head population verified against the existing exact-CUDA physical proof. Smoke does not claim a new learning improvement or two completed laps.'};
    await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log('STATEHEAD_CUDA_APP_VERIFIED '+JSON.stringify({passed:true,checks:checks.length,modelSha256:modelHash,cuda:engine.gpu}));return report;
  }catch(error){await fs.writeFile(path.join(out,'failed.json'),JSON.stringify({passed:false,checks,errors,error:error.stack},null,2));throw error;}
}
module.exports={run};
