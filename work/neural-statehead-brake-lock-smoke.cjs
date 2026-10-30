'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function run(window,{modelFile,selected,getCoordinator,info}){
  const root=path.resolve(__dirname,'..'),arg=process.argv.find(x=>x.startsWith('--brake-lock-smoke-output-dir='));
  const out=path.resolve(arg?arg.slice('--brake-lock-smoke-output-dir='.length):path.join(root,'.impeccable/review/learning-ml/statehead-brake-lock-app-smoke-20261020'));
  if(await fs.stat(out).then(()=>true,()=>false))throw Error('Preserve existing brake-lock smoke output; choose another directory');
  await fs.mkdir(out,{recursive:false});
  const checks=[],errors=[];window.webContents.on('console-message',d=>{if(d.level>=2)errors.push(d.message);});
  const check=(name,passed,actual)=>{checks.push({name,passed:Boolean(passed),...(actual===undefined?{}:{actual})});if(!passed)throw Error('Brake-lock app smoke failed: '+name+' '+JSON.stringify(actual));};
  const js=source=>window.webContents.executeJavaScript(source),until=async predicate=>{const started=Date.now();while(Date.now()-started<90000){if(await predicate())return true;await new Promise(resolve=>setTimeout(resolve,100));}return false;};
  try{
    const ready=await until(async()=>await js('Boolean(globalThis.circuitLab?.sim?.cars?.length===16&&globalThis.circuitLab?.sim?.circuitId==="monza")')||info().experiment?.phase==='error');
    const snapshot=await js('(()=>{try{const s=circuitLab.sim;return {version:circuitLab.version,modelId:s.modelId,circuitId:s.circuitId,population:s.population,generation:s.generation,running:s.running,cars:s.cars.map(c=>({id:c.id,lifetime:c.lifetime,laps:c.laps,outputs:c.outputs})),modeNote:document.getElementById("mode-note").textContent,modelCapacityNote:document.getElementById("model-capacity-note").textContent,fileNote:document.getElementById("progress-file-note").textContent,generationNote:document.getElementById("generation-note").textContent}}catch(error){return {__error:error.stack||String(error)}}})()');
    check('Renderer creates the paused V3 Monza population',ready&&!snapshot.__error&&snapshot.cars.length===16,snapshot);
    check('App keeps version 5.6.0 and the verified V3/Monza controller',snapshot.version==='5.6.0'&&snapshot.modelId==='v3'&&snapshot.circuitId==='monza',snapshot);
    check('16 cars start at generation 1, paused and at the line',snapshot.population===16&&snapshot.generation===1&&snapshot.running===false&&snapshot.cars.every(c=>c.lifetime===0&&c.laps===0));
    check('Initial cars retain exclusive gas/brake outputs',snapshot.cars.every(c=>c.outputs?.every(Number.isFinite)&&Math.min(c.outputs[1],c.outputs[2])===0));
    check('UI discloses the 2-second anti-lock rule and isolated save extension',snapshot.generationNote.includes('dopo 2 s')&&snapshot.fileNote.includes('.malecns-statehead-brakelock-dev'),{generationNote:snapshot.generationNote,fileNote:snapshot.fileNote});
    check('UI explains that observed penalized terminal context can guide future mutations without prescribing a route',snapshot.modelCapacityNote.includes('potrà guidare varianti longitudinali')&&snapshot.modelCapacityNote.includes('Nessun comando o percorso preimpostato'),snapshot.modelCapacityNote);
    check('Displayed baseline is the one-lap verified sample',snapshot.modeNote.includes('1 / 2 giri verificati')&&snapshot.modeNote.includes('6.591'),snapshot.modeNote);
    const modelHash=crypto.createHash('sha256').update(await fs.readFile(modelFile)).digest('hex');
    check('Selected model file still matches the verified model checksum',modelHash===selected.modelSha256,{modelHash,expected:selected.modelSha256});
    const coordinator=getCoordinator(),engine=info();
    check('Four pinned Node workers initialize the exact-CUDA engine',coordinator.workerCount===4&&coordinator.workers.every(w=>w.child.exitCode===null)&&engine.gpu.actualGpuCalls>0&&engine.gpu.cpuFallbacks===0,engine.gpu);
    check('Archive seed is re-scored once by the exact lock penalty',Math.abs(coordinator.archive.champion.fitness-coordinator.baselineFitness)<1e-6&&Math.abs(coordinator.archive.champion.baseFitness-coordinator.baselineFitness)<1e-6,{archiveFitness:coordinator.archive.champion.fitness,archiveBaseFitness:coordinator.archive.champion.baseFitness,baseline:coordinator.baselineFitness,penalty:coordinator.baselinePenalty});
    const before=await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.lifetime,c.bestProgress,c.outputs]))');await new Promise(resolve=>setTimeout(resolve,500));
    const after=await js('JSON.stringify(circuitLab.sim.cars.map(c=>[c.lifetime,c.bestProgress,c.outputs]))');
    check('Paused physics and neural outputs remain unchanged',before===after);
    check('No renderer console errors',errors.length===0,errors);
    const report={passed:true,checks,modelSha256:modelHash,proofFile:selected.proofFile,appVersion:'5.6.0',model:'V3 state-head + brake-lock overlay / Monza',population:16,workers:4,rewardRevision:coordinator.rewardRevision,baselinePenalty:coordinator.baselinePenalty,cuda:engine.gpu,ui:snapshot,boundary:'App startup, paused population, isolated save protocol and brake-lock baseline were verified. Smoke does not claim that any new generation has learned or completed two laps.'};
    await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2),{encoding:'utf8'});
    console.log('STATEHEAD_BRAKE_LOCK_APP_VERIFIED '+JSON.stringify({passed:true,checks:checks.length,modelSha256:modelHash,baselinePenalty:coordinator.baselinePenalty,cuda:engine.gpu}));return report;
  }catch(error){await fs.writeFile(path.join(out,'failed.json'),JSON.stringify({passed:false,checks,errors,error:error.stack},null,2),{encoding:'utf8'});throw error;}
}
module.exports={run};
