'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
async function run(window,{root,stage,modelFile,getState,info}){
  const functionalOnly=process.argv.includes('--functional-only');
  const out=path.join(root,'.impeccable/review/neural-sacl/context-native-'+stage+(process.argv.includes('--diversity')?'-diversity':process.argv.includes('--frontier')?'-frontier':'')+(functionalOnly?'-functional':''));await fs.mkdir(out,{recursive:true});
  const wc=window.webContents,js=code=>wc.executeJavaScript(code,true),checks=[],errors=[],modelHash=await hash(modelFile);
  const check=(name,passed,detail=null)=>{checks.push({name,passed:Boolean(passed),detail});if(!passed)throw Error(name+': '+JSON.stringify(detail));};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async(fn,label,limit=45000)=>{const start=Date.now();while(!await fn()){if(Date.now()-start>limit)throw Error('Timeout '+label);await wait(120);}};
  wc.on('console-message',d=>{if(d.level==='error'||d.level===3)errors.push(d.message);});
  try{
    await until(()=>js('Boolean(globalThis.circuitLab?.sim?.engine&&!document.querySelector("main").inert)'),'native startup');
    check('Private app version is still 5.6.0',await js('circuitLab.version')==='5.6.0');
    check('Actual V3 anatomy and decoder fingerprint',await js('circuitLab.sim.graph.n===7721&&circuitLab.sim.graph.edgeCount===242486&&circuitLab.sim.graph.learning.version===8'));
    check('One actual car starts paused at the line',getState().cars.length===1&&!getState().running&&getState().elapsed===0);
    check('Inference-only boundary and dedicated save incompatibility visible',await js('document.getElementById("mode-note").textContent.includes("non cambiano")&&document.getElementById("save-progress").disabled&&document.getElementById("load-progress").disabled'));
    check('Backend identifies real exported model',info().experiment.modelSha256===modelHash);
    const paused=JSON.stringify(getState().cars[0]);await wait(400);check('Paused physical and neuronal snapshot does not advance',paused===JSON.stringify(getState().cars[0]));
    await js('document.getElementById("speed-range").value="30";document.getElementById("speed-range").dispatchEvent(new Event("input",{bubbles:true}))');
    await until(()=>getState().speedMultiplier===30,'requested speed');check('Slider agrees with actual worker request',await js('circuitLab.sim.speedMultiplier===30&&document.getElementById("speed-output").textContent==="30.0×"'));
    await js('document.getElementById("toggle-run").click()');
    await until(()=>getState().cars[0].bestProgress>400,'real motion');
    await js('document.getElementById("toggle-run").click()');await until(()=>!getState().running,'pause');
    const state=getState();check('Real motion and live full neuronal sample',state.cars[0].bestProgress>400&&state.cars[0].brain.values.length===7721);
    check('Finite exclusive motor commands',state.cars[0].outputs.every(Number.isFinite)&&Math.min(state.cars[0].outputs[1],state.cars[0].outputs[2])===0);
    window.setSize(1500,1000);await wait(350);if(!functionalOnly)await fs.writeFile(path.join(out,'desktop-light.png'),(await wc.capturePage()).toPNG());
    const before=JSON.stringify(getState().cars[0]);
    await js('document.getElementById("theme-toggle").click();showWorkspace("split");document.getElementById("camera-select").value="first-person";document.getElementById("camera-select").dispatchEvent(new Event("change",{bubbles:true}))');
    window.setSize(1440,1200);await wait(650);if(!functionalOnly)await fs.writeFile(path.join(out,'split-dark-driver.png'),(await wc.capturePage()).toPNG());
    window.setSize(980,900);await wait(350);
    check('Theme, camera, atlas and resize do not step the car',before===JSON.stringify(getState().cars[0]));
    check('Narrow layout has no page overflow',await js('document.documentElement.scrollWidth<=innerWidth+2'));
    await js('document.getElementById("toggle-run").click()');await until(()=>!getState().cars[0].alive,'actual physical termination',65000);
    const actual=getState().cars[0],expected=info().experiment.verifiedResult;
    check('Complete native physical episode reproduces learned model',actual.bestProgress===expected.bestProgress&&actual.fitness===expected.fitness&&actual.laps===expected.laps&&actual.reason===expected.reason,{actual:{progress:actual.bestProgress,fitness:actual.fitness,laps:actual.laps,reason:actual.reason},expected});
    check('Inference does not fabricate learning generations',getState().history.length===0&&getState().learningStats===null);
    check('Model file unchanged',await hash(modelFile)===modelHash);check('No renderer errors',errors.length===0,errors);
    check('Native worker uses the same numerical runtime as training',info().experiment.nodeVersion==='24.19.0');
    const sourceHashes={};for(const file of ['work/neural-context-live.cjs','work/neural-frontier-model.cjs','work/context-preview-worker.cjs','work/context-preview-main.cjs','work/context-preview-smoke.cjs'])sourceHashes[file]=await hash(path.join(root,file));
    const report={passed:true,checks,stage,appVersion:'5.6.0',electronVersion:process.versions.electron,workerNodeVersion:info().experiment.nodeVersion,modelSha256:modelHash,sourceHashes,functionalOnly,finalEpisode:{bestProgress:actual.bestProgress,fitness:actual.fitness,laps:actual.laps,reason:actual.reason},consoleErrors:errors,
      boundary:'Real Electron window, native worker, real interactive 3D/atlas, paused-state invariants and a complete from-line physical replay. Inference-only, not normal-generation training; no complete lap or all-model convergence claimed.'};
    await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log('CONTEXT_NATIVE_DONE '+JSON.stringify({passed:true,checks:checks.length,stage,finalEpisode:report.finalEpisode}));return report;
  }catch(error){await fs.writeFile(path.join(out,'failed.json'),JSON.stringify({passed:false,checks,errors,error:error.stack},null,2));throw error;}
}
module.exports={run};
